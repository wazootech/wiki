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
    iter_document_files,
    iter_markdown_files,
    route_for_document_file,
    validate_filename_pattern,
    validate_route_safety,
)
from .parser import document_data_from_path
from .graph import frontmatter_to_graph, load_graph

logger = logging.getLogger(__name__)

# WikiLink pattern: [[slug]] or [[slug|display]]
WIKILINK_REGEX = re.compile(r"\[\[([^\]|]+)(?:\|[^\]]*)?\]\]")

# Standard Markdown link pattern: [display](target) and ![alt](target).
MARKDOWN_LINK_REGEX = re.compile(r"!?\[[^\]]*\]\(([^)]+)\)")

# Microdata attributes that may hold wiki: CURIE entity references.
MICRODATA_WIKI_CURIE_ATTR = re.compile(
    r'(?:itemid|href|src)\s*=\s*["\'](wiki:[^"\']+)["\']',
    re.IGNORECASE,
)

WIKI_CURIE_RE = re.compile(r"^wiki:[^\s]+$")


def file_slug_for_path(config: WikiConfig, file_path: Path) -> str:
    """Return nested slug for a document file relative to an input dir."""
    return route_for_document_file(config, file_path)


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
    """Validate a single document file's metadata against loaded shapes.

    Returns None if no document metadata is found, otherwise returns (conforms, results_text).
    """
    data = document_data_from_path(file_path)
    if not data:
        return None

    source_graph = load_graph(context, infer=False)
    shapes_graph = load_shapes(source_graph)
    data_graph = frontmatter_to_graph(data, context, file_id=file_slug_for_path(context, file_path))

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
    for file_path in iter_document_files(config):
        slug = file_slug_for_path(config, file_path)
        if file_filter is not None and slug not in file_filter:
            continue
        issue = validate_filename_pattern(config, file_path)
        if issue:
            warnings.append(issue)
    return warnings


def audit_broken_links(config: WikiConfig, file_filter: set[str] | None = None) -> list[str]:
    """Audit wikilinks, markdown links, assets, and wiki: CURIE references in metadata and microdata.

    If file_filter is set, only check files whose route is in the set.

    Returns a list of warnings.
    """
    warnings: list[str] = []

    existing_files: set[str] = set()
    heading_ids_by_route: dict[str, set[str]] = {}
    for file_path in iter_document_files(config):
        route = file_slug_for_path(config, file_path)
        existing_files.add(route)
        if file_path.suffix.lower() == ".md":
            heading_ids_by_route[route] = _heading_ids(file_path.read_text(encoding="utf-8"))
        else:
            heading_ids_by_route[route] = set()

    for file_path in iter_document_files(config):
        file_slug = file_slug_for_path(config, file_path)
        if file_filter is not None and file_slug not in file_filter:
            continue
        try:
            data = document_data_from_path(file_path)

            if file_path.suffix.lower() == ".md":
                content = file_path.read_text(encoding="utf-8")
                link_scan = _strip_inline_code(_markdown_body(content))
                wikilinks = WIKILINK_REGEX.findall(link_scan)
                for link in wikilinks:
                    _audit_page_target(warnings, existing_files, heading_ids_by_route, file_slug, link, "WikiLink")

                md_links = MARKDOWN_LINK_REGEX.findall(link_scan)
                for target in md_links:
                    target = unquote(target.split("?")[0])
                    if is_external_link(target):
                        continue
                    if markdown_link_is_page(target):
                        _audit_page_target(warnings, existing_files, heading_ids_by_route, file_slug, target, "Markdown link")
                    else:
                        issue = asset_reference_issue(config, file_path, target)
                        if issue:
                            warnings.append(f"In {file_path.name}: Broken asset link [{target}] {issue}.")

                for curie in MICRODATA_WIKI_CURIE_ATTR.findall(link_scan):
                    _audit_wiki_curie(warnings, existing_files, file_slug, curie, "Microdata reference")

            for curie in _wiki_curies_in_metadata(data or {}):
                _audit_wiki_curie(warnings, existing_files, file_slug, curie, "Metadata reference")

            for target in _frontmatter_asset_targets(data or {}):
                issue = asset_reference_issue(config, file_path, target)
                if issue:
                    warnings.append(f"In {file_path.name}: Broken frontmatter asset [{target}] {issue}.")
        except Exception as e:
            warnings.append(f"Failed to read {file_path.name} for link audit: {e}")

    warnings.extend(audit_asset_dirs(config))
    return warnings


def audit_internal_links(config: WikiConfig, file_filter: set[str] | None = None) -> list[str]:
    """Deprecated alias for audit_broken_links."""
    return audit_broken_links(config, file_filter=file_filter)


HEADING_LINE_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$", re.MULTILINE)
NUMBERED_HEADING_RE = re.compile(r"^\d+[\.)]\s+")
THEMATIC_BREAK_RE = re.compile(r"^(\-{3,}|\*{3,}|_{3,})\s*$", re.MULTILINE)


def _markdown_body(content: str) -> str:
    if content.startswith("---"):
        parts = content.split("---", 2)
        if len(parts) > 2:
            return parts[2]
    return content


def _strip_inline_code(markdown: str) -> str:
    """Remove inline code spans so literal `[[...]]` in prose is not treated as wikilinks."""
    return re.sub(r"`[^`\n]*`", "", markdown)


def audit_headings(config: WikiConfig, file_filter: set[str] | None = None) -> list[str]:
    """Audit markdown heading style (sentence case, no numbering, no body thematic breaks)."""
    warnings: list[str] = []
    for file_path in iter_markdown_files(config):
        route = file_slug_for_path(config, file_path)
        if file_filter is not None and route not in file_filter:
            continue
        content = file_path.read_text(encoding="utf-8")
        body = _markdown_body(content)
        for line_no, line in enumerate(body.splitlines(), start=1):
            if THEMATIC_BREAK_RE.match(line.strip()):
                warnings.append(
                    f"In {file_path.name}:{line_no}: Thematic break '{line.strip()}' in body; "
                    "use headings instead of horizontal rules."
                )
        for match in HEADING_LINE_RE.finditer(body):
            level, text = match.group(1), match.group(2).strip()
            if NUMBERED_HEADING_RE.match(text):
                warnings.append(
                    f"In {file_path.name}: Numbered heading {level} {text!r}; use unnumbered headings."
                )
                continue
            words = [w for w in re.split(r"\s+", text) if w]
            if len(words) >= 2:
                title_case_words = [
                    w
                    for w in words[1:]
                    if len(w) > 2 and w[0].isupper() and any(ch.islower() for ch in w)
                ]
                if len(title_case_words) >= 2:
                    warnings.append(
                        f"In {file_path.name}: Heading {level} {text!r} looks like title case; "
                        "use sentence case (capitalize only the first word and proper nouns)."
                    )
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
        warnings.append(f"In {current_route}: Broken {label} [{target}] points to non-existent document.")
        return
    if fragment:
        target_fragment = fragment_id(fragment)
        if target_fragment not in heading_ids_by_route.get(route, set()):
            warnings.append(f"In {current_route}: Broken {label} [{target}] points to missing heading '#{target_fragment}'.")


def _wiki_route_from_curie(curie: str) -> str | None:
    if not WIKI_CURIE_RE.match(curie):
        return None
    local = curie.split(":", 1)[1]
    local = local.split("#", 1)[0]
    if local.endswith(".md"):
        local = local[:-3]
    return local


def _audit_wiki_curie(
    warnings: list[str],
    existing_files: set[str],
    current_route: str,
    curie: str,
    label: str,
) -> None:
    route = _wiki_route_from_curie(curie)
    if route is None:
        return
    if route not in existing_files:
        warnings.append(
            f"In {current_route}: Broken {label} [{curie}] points to non-existent wiki document."
        )


_METADATA_SKIP_KEYS = frozenset({"@context", "@id", "id", "@type", "type"})


def _wiki_curies_in_metadata(data: dict[str, Any]) -> list[str]:
    """Collect wiki: CURIEs used as references to other vault documents (not subject id/type)."""
    curies: list[str] = []

    def walk(value: Any) -> None:
        if isinstance(value, str):
            if WIKI_CURIE_RE.match(value):
                curies.append(value)
        elif isinstance(value, dict):
            for key, item in value.items():
                if key in _METADATA_SKIP_KEYS:
                    continue
                walk(item)
        elif isinstance(value, list):
            for item in value:
                walk(item)

    for key, value in data.items():
        if key in _METADATA_SKIP_KEYS:
            continue
        walk(value)
    return curies


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



        link_issues = audit_broken_links(config)
        process_issues("brokenLinks", link_issues)

        heading_issues = audit_headings(config)
        process_issues("headings", heading_issues)

    return results
