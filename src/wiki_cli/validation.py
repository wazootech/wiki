"""SHACL validation logic using pyshacl against loaded constraint shapes and custom style/hygiene audits."""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Any, Optional
from rdflib import Graph
import pyshacl

from .context import WikiConfig, Context
from .frontmatter import frontmatter_from_path
from .rdf import frontmatter_to_graph

logger = logging.getLogger(__name__)

# Filename pattern: lowercase kebab-case
FILENAME_REGEX = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")

# WikiLink pattern: [[slug]] or [[slug|display]]
WIKILINK_REGEX = re.compile(r"\[\[([^\]|]+)(?:\|[^\]]*)?\]\]")


def load_shapes(context: WikiConfig) -> Graph:
    """Load all SHACL shapes (.ttl files) from shapes directory into a Graph."""
    shapes_graph = Graph()
    shapes_graph.bind("sh", "http://www.w3.org/ns/shacl#")
    shapes_graph.bind("schema", "https://schema.org/")

    if context.shapes_dir.exists():
        for shape_file in sorted(context.shapes_dir.glob("*.ttl")):
            try:
                shapes_graph.parse(shape_file, format="turtle")
            except Exception as e:
                logger.warning("Failed to parse shape file %s: %s", shape_file.name, e)

    return shapes_graph


def validate_file(file_path: Path, context: WikiConfig, verbose: bool = False) -> Optional[tuple[bool, str]]:
    """Validate a single markdown file's frontmatter against loaded shapes.

    Returns None if no frontmatter is found, otherwise returns (conforms, results_text).
    """
    data = frontmatter_from_path(file_path)
    if not data:
        return None

    shapes_graph = load_shapes(context)
    data_graph = frontmatter_to_graph(data, context, file_id=file_path.stem)

    conforms, _, results_text = pyshacl.validate(
        data_graph,
        shapes_graph,
        inference="rdfs",
    )

    return conforms, results_text


def validate_all(context: WikiConfig, verbose: bool = False) -> tuple[bool, str]:
    """Validate all wiki documents as a single unified Graph against loaded shapes."""
    shapes_graph = load_shapes(context)
    data_graph = Graph()
    context.bind_namespaces(data_graph)

    errors = []
    has_files = False

    if context.wiki_dir.exists():
        for md_file in sorted(context.wiki_dir.glob("*.md")):
            try:
                data = frontmatter_from_path(md_file)
                if data:
                    data_graph += frontmatter_to_graph(data, context, file_id=md_file.stem)
                    has_files = True
            except Exception as e:
                errors.append((md_file.name, str(e)))

    if not has_files:
        return True, "No markdown documents with frontmatter found to validate."

    conforms, _, results_text = pyshacl.validate(
        data_graph,
        shapes_graph,
        inference="rdfs",
        abort_on_first_error=False,
    )

    if errors:
        results_text += f"\nParse errors encountered ({len(errors)}):\n"
        for name, err in errors:
            results_text += f"  - {name}: {err}\n"

    return conforms, results_text


def validate_summary(context: WikiConfig) -> dict[str, Any]:
    """Perform a per-file SHACL validation and return a summary of conforming/failing/error files."""
    shapes_graph = load_shapes(context)
    results: dict[str, Any] = {"conforms": [], "fails": [], "errors": []}

    if context.wiki_dir.exists():
        for md_file in sorted(context.wiki_dir.glob("*.md")):
            try:
                data = frontmatter_from_path(md_file)
                if not data:
                    results["errors"].append({"file": md_file.name, "reason": "no frontmatter"})
                    continue

                data_graph = frontmatter_to_graph(data, context, file_id=md_file.stem)
                conforms, _, _ = pyshacl.validate(data_graph, shapes_graph, inference="rdfs")

                if conforms:
                    results["conforms"].append(md_file.name)
                else:
                    results["fails"].append(md_file.name)
            except Exception as e:
                results["errors"].append({"file": md_file.name, "reason": str(e)})

    return results


def audit_filenames(config: WikiConfig) -> list[str]:
    """Audit filenames in the wiki directory to ensure they are lowercase kebab-case.

    Returns a list of warnings.
    """
    warnings = []
    if not config.wiki_dir.exists():
        return warnings

    for md_file in sorted(config.wiki_dir.glob("*.md")):
        stem = md_file.stem
        if not FILENAME_REGEX.match(stem):
            warnings.append(
                f"Filename '{md_file.name}' is not lowercase kebab-case."
            )
    return warnings


def audit_internal_links(config: WikiConfig) -> list[str]:
    """Audit internal wikilinks in markdown files to ensure they point to existing documents.

    Returns a list of warnings.
    """
    warnings = []
    if not config.wiki_dir.exists():
        return warnings

    existing_files = {md_file.stem for md_file in config.wiki_dir.glob("*.md")}

    for md_file in sorted(config.wiki_dir.glob("*.md")):
        try:
            content = md_file.read_text(encoding="utf-8")
            links = WIKILINK_REGEX.findall(content)
            for link in links:
                slug = link.strip().lower().replace(" ", "-")
                if slug not in existing_files:
                    warnings.append(
                        f"In {md_file.name}: Broken WikiLink [[{link}]] points to non-existent document."
                    )
        except Exception as e:
            warnings.append(f"Failed to read {md_file.name} for link audit: {e}")

    return warnings


def run_checks(config: WikiConfig) -> dict[str, Any]:
    """Run both strict SHACL validation and configured style audits.

    Returns a dict with 'conforms' (bool), 'errors' (list of str), and 'warnings' (list of str).
    """
    results = {
        "conforms": True,
        "errors": [],
        "warnings": [],
    }

    try:
        shacl_conforms, shacl_text = validate_all(config)
        if not shacl_conforms:
            results["conforms"] = False
            results["errors"].append(f"SHACL Validation Violation:\n{shacl_text}")
    except Exception as e:
        results["conforms"] = False
        results["errors"].append(f"SHACL validation system error: {e}")

    def process_issues(rule_key: str, issues: list[str]) -> None:
        severity = config.check.get(rule_key, "warning")
        if severity == "off":
            return
        elif severity == "error":
            if issues:
                results["conforms"] = False
                results["errors"].extend(issues)
        else:  # "warning"
            results["warnings"].extend(issues)

    filename_issues = audit_filenames(config)
    process_issues("filenameStyle", filename_issues)

    link_issues = audit_internal_links(config)
    process_issues("internalLinks", link_issues)

    return results
