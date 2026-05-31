"""SHACL checking logic using pyshacl against loaded constraint shapes and custom style/hygiene audits."""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Any, Optional
from urllib.parse import unquote
from rdflib import Graph
import pyshacl

from .assets import asset_reference_issue, audit_asset_dirs, build_asset_manifest
from .config import WikiConfig
from .headings import GitHubHeadingSlugger
from .links import is_external_link, markdown_link_is_page, resolve_page_route, split_target, fragment_id
from .paths import (
    build_page_manifest,
    detect_output_collisions,
    iter_markdown_files,
    route_for_markdown_file,
    validate_filename_pattern,
    validate_route_safety,
)
from .parser import frontmatter_from_path, split_frontmatter_body
from .graph import frontmatter_to_graph, load_graph

logger = logging.getLogger(__name__)

# WikiLink pattern: [[slug]] or [[slug|display]]
WIKILINK_REGEX = re.compile(r"\[\[([^\]|]+)(?:\|[^\]]*)?\]\]")

# Standard Markdown link pattern: [display](target) and ![alt](target).
MARKDOWN_LINK_REGEX = re.compile(r"!?\[[^\]]*\]\(([^)]+)\)")


def file_slug_for_path(config: WikiConfig, md_file: Path) -> str:
    """Return nested slug for a markdown file relative to an input dir."""
    return route_for_markdown_file(config, md_file)


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
    """Audit filenames in the wiki directory against the optional filenamePattern.

    If file_filter is set, only check files whose stem is in the set.

    Returns a list of warnings.
    """
    warnings = []
    for md_file in iter_markdown_files(config):
        slug = file_slug_for_path(config, md_file)
        if file_filter is not None and slug not in file_filter:
            continue
        issue = validate_filename_pattern(config, md_file)
        if issue:
            warnings.append(issue)
    return warnings


def audit_internal_links(config: WikiConfig, file_filter: set[str] | None = None) -> list[str]:
    """Audit internal wikilinks and standard Markdown links in markdown files to ensure they point to existing documents.

    If file_filter is set, only check files whose stem is in the set.

    Returns a list of warnings.
    """
    warnings = []

    existing_files: set[str] = set()
    heading_ids_by_route: dict[str, set[str]] = {}
    for md_file in iter_markdown_files(config):
        route = file_slug_for_path(config, md_file)
        existing_files.add(route)
        heading_ids_by_route[route] = _heading_ids(md_file.read_text(encoding="utf-8"))

    for md_file in iter_markdown_files(config):
        md_slug = file_slug_for_path(config, md_file)
        if file_filter is not None and md_slug not in file_filter:
            continue
        try:
            content = md_file.read_text(encoding="utf-8")
            
            if config.markdown_flavor == "obsidian":
                wikilinks = WIKILINK_REGEX.findall(content)
                for link in wikilinks:
                    _audit_page_target(warnings, existing_files, heading_ids_by_route, md_slug, link, "WikiLink")
            
            # 2. Audit standard Markdown links
            md_links = MARKDOWN_LINK_REGEX.findall(content)
            for target in md_links:
                target = unquote(target.split("?")[0])
                if is_external_link(target):
                    continue
                if markdown_link_is_page(target):
                    _audit_page_target(warnings, existing_files, heading_ids_by_route, md_slug, target, "Markdown link")
                else:
                    issue = asset_reference_issue(config, md_file, target)
                    if issue:
                        warnings.append(f"In {md_slug}.md: Broken asset link [{target}] {issue}.")

            fm_data, _ = split_frontmatter_body(content)
            for target in _frontmatter_asset_targets(fm_data or {}):
                issue = asset_reference_issue(config, md_file, target)
                if issue:
                    warnings.append(f"In {md_slug}.md: Broken frontmatter asset [{target}] {issue}.")
        except Exception as e:
            warnings.append(f"Failed to read {md_slug}.md for link audit: {e}")

    warnings.extend(audit_asset_dirs(config))
    return warnings


def audit_markdown_flavor(config: WikiConfig, file_filter: set[str] | None = None) -> list[str]:
    warnings: list[str] = []
    if config.markdown_flavor != "gfm":
        return warnings
    for md_file in iter_markdown_files(config):
        md_slug = file_slug_for_path(config, md_file)
        if file_filter is not None and md_slug not in file_filter:
            continue
        content = md_file.read_text(encoding="utf-8")
        if WIKILINK_REGEX.search(content):
            warnings.append(f"In {md_slug}.md: Wikilink syntax is not enabled in markdownFlavor: gfm.")
    return warnings


def _heading_ids(markdown: str) -> set[str]:
    slugger = GitHubHeadingSlugger()
    ids: set[str] = set()
    for m in re.finditer(r"^(#{1,6})\s+(.+)$", markdown, flags=re.MULTILINE):
        ids.add(slugger.slug(m.group(2).strip()))
    return ids


def _audit_page_target(
    warnings: list[str],
    existing_files: set[str],
    heading_ids_by_route: dict[str, set[str]],
    current_route: str,
    target: str,
    label: str,
) -> None:
    page_part, fragment = split_target(target)
    route = current_route if page_part == "" else resolve_page_route(current_route, target)
    if route is None or route not in existing_files:
        warnings.append(f"In {current_route}.md: Broken {label} [{target}] points to non-existent document.")
        return
    if fragment:
        target_fragment = fragment_id(fragment)
        if target_fragment not in heading_ids_by_route.get(route, set()):
            warnings.append(f"In {current_route}.md: Broken {label} [{target}] points to missing heading '#{target_fragment}'.")


def _frontmatter_asset_targets(data: dict[str, Any]) -> list[str]:
    targets: list[str] = []
    for key, value in data.items():
        normalized = str(key).lower()
        if normalized not in {"image", "thumbnail", "logo"} and not normalized.endswith("image"):
            continue
        if isinstance(value, str) and not is_external_link(value):
            targets.append(value)
        elif isinstance(value, list):
            targets.extend(item for item in value if isinstance(item, str) and not is_external_link(item))
    return targets


def _apply_wikilink_renames(content: str, renames: dict[str, str]) -> str:
    def repl(match: re.Match) -> str:
        target = match.group(1)
        normalized = target
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
    return {"renamed": [], "updated_wikilinks": False}



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

    safety_issues = validate_route_safety(config)
    if safety_issues:
        results["conforms"] = False
        results["errors"].extend(safety_issues)
    else:
        owned_output_dir = Path("_site") / config.base_url.strip("/") if config.base_url else Path("_site")
        collision_issues = detect_output_collisions(
            build_page_manifest(config, owned_output_dir, config.base_url, config.url_style)
            + build_asset_manifest(config, owned_output_dir, config.base_url)
        )
        if collision_issues:
            results["conforms"] = False
            results["errors"].extend(collision_issues)

    if not safety_issues:
        filename_issues = audit_filenames(config)
        process_issues("filenamePattern", filename_issues)

        flavor_issues = audit_markdown_flavor(config)
        process_issues("markdownFlavor", flavor_issues)

        link_issues = audit_internal_links(config)
        process_issues("internalLinks", link_issues)

    return results
