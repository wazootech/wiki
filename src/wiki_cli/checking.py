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
from .rdf import frontmatter_to_graph, load_graph

logger = logging.getLogger(__name__)

# Filename pattern: lowercase kebab-case
FILENAME_REGEX = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")

# WikiLink pattern: [[slug]] or [[slug|display]]
WIKILINK_REGEX = re.compile(r"\[\[([^\]|]+)(?:\|[^\]]*)?\]\]")

# Standard Markdown link pattern: [display](target)
# Excludes external URLs (http/https, mailto) and internal anchor-only links (starting with #)
MARKDOWN_LINK_REGEX = re.compile(r"\[[^\]]+\]\((?!(?:https?://|mailto:|#))([^)]+)\)")


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
