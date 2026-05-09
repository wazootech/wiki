"""SHACL checking logic using pyshacl against loaded constraint shapes and custom style/hygiene audits."""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Any, Optional
from urllib.parse import unquote
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

# Standard Markdown link pattern: [display](target)
# Excludes external URLs (http/https, mailto) and internal anchor-only links (starting with #)
MARKDOWN_LINK_REGEX = re.compile(r"\[[^\]]+\]\((?!(?:https?://|mailto:|#))([^)]+)\)")


def extract_shapes_from_wiki(graph: Graph, context: WikiConfig) -> None:
    """Scan markdown documents in the wiki directory for inline SHACL shapes (frontmatter or code blocks)."""
    if not context.wiki_dir.exists():
        return

    for md_file in sorted(context.wiki_dir.glob("*.md")):
        try:
            content = md_file.read_text(encoding="utf-8")
            
            # 1. Try parsing frontmatter-defined shapes
            data = frontmatter_from_path(md_file)
            if data:
                rdf_type = data.get("@type") or data.get("type")
                is_shape = False
                if isinstance(rdf_type, str):
                    if any(term in rdf_type for term in ("sh:NodeShape", "sh:PropertyShape", "NodeShape", "PropertyShape")):
                        is_shape = True
                elif isinstance(rdf_type, list):
                    if any(isinstance(t, str) and any(term in t for term in ("sh:NodeShape", "sh:PropertyShape", "NodeShape", "PropertyShape")) for t in rdf_type):
                        is_shape = True
                elif any(isinstance(k, str) and (k.startswith("sh:") or k.startswith("shacl:")) for k in data):
                    is_shape = True

                if is_shape:
                    graph += frontmatter_to_graph(data, context, file_id=md_file.stem)

            # 2. Parse explicit ```turtle blocks from the file body into the shapes graph
            turtle_blocks = re.findall(r"```turtle\s*([\s\S]*?)```", content)
            for block in turtle_blocks:
                try:
                    graph.parse(data=block.strip(), format="turtle")
                except Exception:
                    pass # Ignore formatting errors
        except Exception as e:
            logger.warning("Failed to process wiki file %s for shapes: %s", md_file.name, e)


def load_shapes(context: WikiConfig) -> Graph:
    """Load all SHACL shapes (.ttl files) and frontmatter-defined shapes into a Graph."""
    shapes_graph = Graph()
    shapes_graph.bind("sh", "http://www.w3.org/ns/shacl#")
    shapes_graph.bind("schema", "https://schema.org/")

    if context.shapes_dir.exists():
        for shape_file in sorted(context.shapes_dir.glob("*.ttl")):
            try:
                shapes_graph.parse(shape_file, format="turtle")
            except Exception as e:
                logger.warning("Failed to parse shape file %s: %s", shape_file.name, e)

    extract_shapes_from_wiki(shapes_graph, context)

    return shapes_graph


def check_shacl_file(file_path: Path, context: WikiConfig, verbose: bool = False) -> Optional[tuple[bool, str]]:
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
        shacl_graph=shapes_graph,
        inference="rdfs",
    )

    return conforms, results_text


def check_shacl_all(context: WikiConfig, verbose: bool = False) -> tuple[bool, str]:
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
        shacl_graph=shapes_graph,
        inference="rdfs",
        abort_on_first=False,
    )

    if errors:
        results_text += f"\nParse errors encountered ({len(errors)}):\n"
        for name, err in errors:
            results_text += f"  - {name}: {err}\n"

    return conforms, results_text


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
    """Audit internal wikilinks and standard Markdown links in markdown files to ensure they point to existing documents.

    Returns a list of warnings.
    """
    warnings = []
    if not config.wiki_dir.exists():
        return warnings

    existing_files = {md_file.stem for md_file in config.wiki_dir.glob("*.md")}

    for md_file in sorted(config.wiki_dir.glob("*.md")):
        try:
            content = md_file.read_text(encoding="utf-8")
            
            # 1. Audit WikiLinks
            wikilinks = WIKILINK_REGEX.findall(content)
            for link in wikilinks:
                slug = link.strip().lower().replace(" ", "-")
                if slug not in existing_files:
                    warnings.append(
                        f"In {md_file.name}: Broken WikiLink [[{link}]] points to non-existent document."
                    )
            
            # 2. Audit standard Markdown links
            md_links = MARKDOWN_LINK_REGEX.findall(content)
            for target in md_links:
                decoded_target = unquote(target.split("#")[0].split("?")[0])
                slug = Path(decoded_target).stem.strip().lower().replace(" ", "-")
                if slug and slug not in existing_files:
                    warnings.append(
                        f"In {md_file.name}: Broken Markdown link [{target}] points to non-existent document."
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
        shacl_conforms, shacl_text = check_shacl_all(config)
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
