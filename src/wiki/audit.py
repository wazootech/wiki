"""SHACL checking logic using pyshacl against loaded constraint shapes and custom style/hygiene audits."""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Any, Optional
from urllib.parse import unquote
from rdflib import Graph
import pyshacl

from .config import WikiConfig
from .filename_style import (
    KEBAB_STYLE,
    filename_stem_is_valid,
    normalize_path,
    slugify_kebab_segment,
    style_description,
)
from .parser import frontmatter_from_path
from .graph import frontmatter_to_graph, load_graph

logger = logging.getLogger(__name__)

# WikiLink pattern: [[slug]] or [[slug|display]]
WIKILINK_REGEX = re.compile(r"\[\[([^\]|]+)(?:\|[^\]]*)?\]\]")

# Standard Markdown link pattern: [display](target)
# Excludes external URLs (http/https, mailto) and internal anchor-only links (starting with #)
MARKDOWN_LINK_REGEX = re.compile(r"\[[^\]]+\]\((?!(?:https?://|mailto:|#))([^)]+)\)")


def _slugify_segment(text: str) -> str:
    return slugify_kebab_segment(text)


def _slugify_path(text: str) -> str:
    return normalize_path(text)


def file_slug_for_path(config: WikiConfig, md_file: Path) -> str:
    """Return nested slug for a markdown file relative to an input dir."""
    for root in config.input_dirs:
        try:
            rel = md_file.relative_to(root)
            return normalize_path(rel.with_suffix("").as_posix(), config.filename_style)
        except ValueError:
            continue
    return normalize_path(md_file.with_suffix("").as_posix(), config.filename_style)


def iter_markdown_files(config: WikiConfig) -> list[Path]:
    md_files: list[Path] = []
    for input_dir in config.input_dirs:
        if input_dir.exists():
            md_files.extend(sorted(input_dir.rglob("*.md")))
    return md_files


def load_shapes(data_graph: Graph) -> Graph:
    """Extract all SHACL relevant triples from a central graph via SPARQL CONSTRUCT."""
    query = """
    PREFIX sh: <http://www.w3.org/ns/shacl#>
    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
    PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
    
    CONSTRUCT {
        ?s ?p ?o .
    }
    WHERE {
        {
            # Triples where predicate is in the SHACL namespace
            ?s ?p ?o .
            FILTER (STRSTARTS(STR(?p), "http://www.w3.org/ns/shacl#"))
        }
        UNION
        {
            # Explicitly typed Shapes and their direct properties
            ?s rdf:type ?type .
            FILTER (?type IN (sh:NodeShape, sh:PropertyShape))
            ?s ?p ?o .
        }
        UNION
        {
            # Nested anonymous/blank node configuration blocks for SHACL
            ?x ?shaclProp ?s .
            FILTER (STRSTARTS(STR(?shaclProp), "http://www.w3.org/ns/shacl#"))
            ?s ?p ?o .
        }
        UNION
        {
            # Recursively fetch entire RDF list structures referenced by SHACL properties
            ?x ?shaclProp ?listHead .
            FILTER (STRSTARTS(STR(?shaclProp), "http://www.w3.org/ns/shacl#"))
            ?listHead (rdf:rest)* ?s .
            ?s ?p ?o .
        }
        UNION
        {
            # Recursively fetch the contents/triples of elements inside those RDF lists
            ?x ?shaclProp ?listHead .
            FILTER (STRSTARTS(STR(?shaclProp), "http://www.w3.org/ns/shacl#"))
            ?listHead (rdf:rest)*/rdf:first ?s .
            ?s ?p ?o .
        }
    }
    """
    shapes_graph = data_graph.query(query).graph
    if shapes_graph is None:
        shapes_graph = Graph()
    shapes_graph.bind("sh", "http://www.w3.org/ns/shacl#")
    return shapes_graph


def check_shacl_file(file_path: Path, context: WikiConfig, verbose: bool = False) -> Optional[tuple[bool, str]]:
    """Validate a single markdown file's frontmatter against loaded shapes.

    Returns None if no frontmatter is found, otherwise returns (conforms, results_text).
    """
    data = frontmatter_from_path(file_path)
    if not data:
        return None

    source_graph = load_graph(context, infer=False) # Minimizing overhead for single file check, but loading pool shapes
    shapes_graph = load_shapes(source_graph)
    data_graph = frontmatter_to_graph(data, context, file_id=file_path.stem)

    conforms, _, results_text = pyshacl.validate(
        data_graph,
        shacl_graph=shapes_graph,
        inference="rdfs",
    )

    return conforms, results_text


def check_shacl_all(context: WikiConfig, verbose: bool = False) -> tuple[bool, str]:
    """Validate the unified graph against SHACL shapes extracted from that same graph."""
    data_graph = load_graph(context, infer=True)
    shapes_graph = load_shapes(data_graph)

    if len(data_graph) == 0:
        return True, "The data graph is empty. Nothing to validate."

    conforms, _, results_text = pyshacl.validate(
        data_graph,
        shacl_graph=shapes_graph,
        inference="rdfs",
        abort_on_first=False,
    )

    return conforms, results_text


def audit_filenames(config: WikiConfig, file_filter: set[str] | None = None) -> list[str]:
    """Audit filenames in the wiki directory to ensure they match the configured style.

    If file_filter is set, only check files whose stem is in the set.

    Returns a list of warnings.
    """
    warnings = []
    for md_file in iter_markdown_files(config):
        slug = file_slug_for_path(config, md_file)
        if file_filter is not None and slug not in file_filter:
            continue
        if not filename_stem_is_valid(md_file.stem, config.filename_style):
            # Include the original filename for clearer user feedback.
            warnings.append(f"Filename '{md_file.name}' is not {style_description(config.filename_style)}.")
    return warnings


def audit_internal_links(config: WikiConfig, file_filter: set[str] | None = None) -> list[str]:
    """Audit internal wikilinks and standard Markdown links in markdown files to ensure they point to existing documents.

    If file_filter is set, only check files whose stem is in the set.

    Returns a list of warnings.
    """
    warnings = []

    existing_files: set[str] = set()
    for md_file in iter_markdown_files(config):
        existing_files.add(file_slug_for_path(config, md_file))

    for md_file in iter_markdown_files(config):
        md_slug = file_slug_for_path(config, md_file)
        if file_filter is not None and md_slug not in file_filter:
            continue
        try:
            content = md_file.read_text(encoding="utf-8")
            
            # 1. Audit WikiLinks
            wikilinks = WIKILINK_REGEX.findall(content)
            for link in wikilinks:
                slug = normalize_path(link, config.filename_style)
                if slug not in existing_files:
                    warnings.append(
                        f"In {md_slug}.md: Broken WikiLink [[{link}]] points to non-existent document."
                    )
            
            # 2. Audit standard Markdown links
            md_links = MARKDOWN_LINK_REGEX.findall(content)
            for target in md_links:
                decoded_target = unquote(target.split("#")[0].split("?")[0])
                slug = normalize_path(Path(decoded_target).with_suffix("").as_posix(), config.filename_style)
                if slug and slug not in existing_files:
                    warnings.append(
                        f"In {md_slug}.md: Broken Markdown link [{target}] points to non-existent document."
                    )
        except Exception as e:
            warnings.append(f"Failed to read {md_slug}.md for link audit: {e}")

    return warnings


def _apply_wikilink_renames(content: str, renames: dict[str, str]) -> str:
    def repl(match: re.Match) -> str:
        target = match.group(1)
        normalized = normalize_path(target, KEBAB_STYLE)
        if normalized not in renames:
            return match.group(0)

        replacement = renames[normalized]
        full = match.group(0)
        if "|" in full:
            display = full.split("|", 1)[1]
            display = display[:-2] if display.endswith("]]") else display
            return f"[[{replacement}|{display}]]"
        return f"[[{replacement}]]"

    return WIKILINK_REGEX.sub(repl, content)


def autofix_hygiene(config: WikiConfig) -> dict[str, Any]:
    """Autofix style issues (currently: filename kebab-case + wikilink updates)."""
    if config.filename_style != KEBAB_STYLE:
        return {"renamed": [], "updated_wikilinks": False}

    renames: dict[str, str] = {}
    renamed_files: list[tuple[str, str]] = []

    # Rename files that violate kebab-case (filename only; directories unchanged)
    for md_file in iter_markdown_files(config):
        if filename_stem_is_valid(md_file.stem, KEBAB_STYLE):
            continue
        old_slug = file_slug_for_path(config, md_file)
        new_stem = _slugify_segment(md_file.stem)
        if not new_stem or new_stem == md_file.stem:
            continue
        new_path = md_file.with_name(new_stem + md_file.suffix)
        md_file.rename(new_path)
        new_slug = file_slug_for_path(config, new_path)
        renames[old_slug] = new_slug
        renamed_files.append((old_slug, new_slug))

    # Update wikilinks to renamed targets across the wiki
    if renames:
        for md_file in iter_markdown_files(config):
            original = md_file.read_text(encoding="utf-8")
            updated = _apply_wikilink_renames(original, renames)
            if updated != original:
                md_file.write_text(updated, encoding="utf-8")

    return {"renamed": renamed_files, "updated_wikilinks": bool(renames)}


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
