"""SHACL checking logic using pyshacl against loaded constraint shapes and custom style/hygiene audits."""

from __future__ import annotations

import logging
import re
from functools import lru_cache
from pathlib import Path
from typing import Any, Optional
from urllib.parse import unquote
from rdflib import Graph
import pyshacl
from markdown_it import MarkdownIt

from .assets import asset_reference_issue, audit_assets, build_asset_manifest
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
from .parser import document_data_from_path, split_document_body
from .graph import frontmatter_to_graph, load_graph
from .layout import (
    LAYOUT_FRONTMATTER_KEY,
    layout_file_is_valid,
    resolve_layout_path,
)
from .schemas import BrokenLink, CheckConfig, LintConfig

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

WIKILINK_FULL_REGEX = re.compile(r"\[\[([^\]|]+)(?:\|([^\]]*))?\]\]")
MARKDOWN_LINK_FULL_REGEX = re.compile(r"!?\[([^\]]*)\]\(([^)]+)\)")
FENCED_CODE_RE = re.compile(r"```[\s\S]*?```")


def format_broken_link(issue: BrokenLink) -> str:
    return issue.message


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
    data_graph = frontmatter_to_graph(data, context, file_id=route_for_document_file(context, file_path))

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


def lint_filenames(config: WikiConfig, file_filter: set[str] | None = None) -> list[str]:
    """Lint filenames in the wiki directory against the optional filename_pattern.

    If file_filter is set, only check files whose stem is in the set.

    Returns a list of warnings.
    """
    warnings = []
    for file_path in iter_document_files(config):
        slug = route_for_document_file(config, file_path)
        if file_filter is not None and slug not in file_filter:
            continue
        issue = validate_filename_pattern(config, file_path)
        if issue:
            warnings.append(issue)
    return warnings


def collect_broken_links(config: WikiConfig, file_filter: set[str] | None = None) -> list[BrokenLink]:
    """Collect structured broken-link issues for wikilinks, markdown links, assets, and wiki: CURIEs."""
    issues: list[BrokenLink] = []

    existing_files: set[str] = set()
    heading_ids_by_route: dict[str, set[str]] = {}
    for file_path in iter_document_files(config):
        route = route_for_document_file(config, file_path)
        existing_files.add(route)
        if file_path.suffix.lower() == ".md":
            heading_ids_by_route[route] = _heading_ids(file_path.read_text(encoding="utf-8"))
        else:
            heading_ids_by_route[route] = set()

    for file_path in iter_document_files(config):
        file_slug = route_for_document_file(config, file_path)
        if file_filter is not None and file_slug not in file_filter:
            continue
        try:
            data = document_data_from_path(file_path)

            if file_path.suffix.lower() == ".md":
                content = file_path.read_text(encoding="utf-8")
                prefix, body = _split_frontmatter(content)
                body_offset = len(prefix)
                protected = _protected_inline_code_spans(body)

                for match in WIKILINK_FULL_REGEX.finditer(body):
                    start, end = match.span()
                    if _span_overlaps(start, end, protected):
                        continue
                    link_target = match.group(1).strip()
                    issue = _page_target_issue(
                        existing_files,
                        heading_ids_by_route,
                        file_slug,
                        link_target,
                        "WikiLink",
                    )
                    if issue is not None:
                        issues.append(
                            BrokenLink(
                                source_route=file_slug,
                                source_path=file_path,
                                link_kind="WikiLink",
                                raw_target=link_target,
                                issue_kind=issue,
                                message=_page_target_message(file_slug, link_target, "WikiLink", issue),
                                match_start=body_offset + start,
                                match_end=body_offset + end,
                                full_match=match.group(0),
                            )
                        )

                for match in MARKDOWN_LINK_FULL_REGEX.finditer(body):
                    start, end = match.span()
                    if _span_overlaps(start, end, protected):
                        continue
                    target = unquote(match.group(2).split("?")[0])
                    if is_external_link(target):
                        continue
                    if markdown_link_is_page(target):
                        issue = _page_target_issue(
                            existing_files,
                            heading_ids_by_route,
                            file_slug,
                            target,
                            "Markdown link",
                        )
                        if issue is not None:
                            issues.append(
                                BrokenLink(
                                    source_route=file_slug,
                                    source_path=file_path,
                                    link_kind="Markdown link",
                                    raw_target=target,
                                    issue_kind=issue,
                                    message=_page_target_message(file_slug, target, "Markdown link", issue),
                                    match_start=body_offset + start,
                                    match_end=body_offset + end,
                                    full_match=match.group(0),
                                )
                            )
                    else:
                        asset_issue = asset_reference_issue(config, file_path, target)
                        if asset_issue:
                            issues.append(
                                BrokenLink(
                                    source_route=file_slug,
                                    source_path=file_path,
                                    link_kind="Asset link",
                                    raw_target=target,
                                    issue_kind="missing_asset",
                                    message=f"In {file_path.name}: Broken asset link [{target}] {asset_issue}.",
                                    match_start=body_offset + start,
                                    match_end=body_offset + end,
                                    full_match=match.group(0),
                                )
                            )

                link_scan = _strip_inline_code(body)
                for curie in MICRODATA_WIKI_CURIE_ATTR.findall(link_scan):
                    _append_wiki_curie_issue(issues, existing_files, file_slug, file_path, curie, "Microdata reference")

            for curie in _wiki_curies_in_metadata(data or {}):
                _append_wiki_curie_issue(issues, existing_files, file_slug, file_path, curie, "Metadata reference")

            for target in _frontmatter_asset_targets(data or {}):
                asset_issue = asset_reference_issue(config, file_path, target)
                if asset_issue:
                    issues.append(
                        BrokenLink(
                            source_route=file_slug,
                            source_path=file_path,
                            link_kind="Frontmatter asset",
                            raw_target=target,
                            issue_kind="missing_asset",
                            message=f"In {file_path.name}: Broken frontmatter asset [{target}] {asset_issue}.",
                        )
                    )
        except Exception as e:
            issues.append(
                BrokenLink(
                    source_route=file_slug,
                    source_path=file_path,
                    link_kind="Read error",
                    raw_target="",
                    issue_kind="read_error",
                    message=f"Failed to read {file_path.name} for link audit: {e}",
                )
            )

    for warning in audit_assets(config):
        issues.append(
            BrokenLink(
                source_route="",
                source_path=config.config_root,
                link_kind="Asset directory",
                raw_target="",
                issue_kind="missing_asset",
                message=warning,
            )
        )

    return issues


def lint_broken_links(config: WikiConfig, file_filter: set[str] | None = None) -> list[str]:
    """Lint wikilinks, markdown links, assets, and wiki: CURIE references in metadata and microdata.

    If file_filter is set, only check files whose route is in the set.

    Returns a list of warnings.
    """
    return [format_broken_link(issue) for issue in collect_broken_links(config, file_filter=file_filter)]


HEADING_LINE_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$", re.MULTILINE)
NUMBERED_HEADING_RE = re.compile(r"^\d+[\.)]\s+")
THEMATIC_BREAK_RE = re.compile(r"^(\-{3,}|\*{3,}|_{3,})\s*$", re.MULTILINE)
SETEXT_H1_UNDERLINE_RE = re.compile(r"^={3,}\s*$")
SETEXT_H2_UNDERLINE_RE = re.compile(r"^-{3,}\s*$")
MARKDOWN_LINK_IN_HEADING_RE = re.compile(r"!?\[[^\]]*\]\([^)]*\)")
SETEXT_ATX_HINT = "use ATX headings (# ...) so title, TOC, and fragment links work."


def _markdown_body(content: str) -> str:
    _, body = _split_frontmatter(content)
    return body


def _split_frontmatter(content: str) -> tuple[str, str]:
    if content.startswith("---"):
        parts = content.split("---", 2)
        if len(parts) > 2:
            return f"---{parts[1]}---", parts[2]
    return "", content


def _protected_inline_code_spans(markdown: str) -> list[tuple[int, int]]:
    spans: list[tuple[int, int]] = []
    for match in re.finditer(r"`[^`\n]*`", markdown):
        spans.append(match.span())
    return spans


def _span_overlaps(start: int, end: int, spans: list[tuple[int, int]]) -> bool:
    return any(start < span_end and end > span_start for span_start, span_end in spans)


def _strip_inline_code(markdown: str) -> str:
    """Remove inline code spans so literal `[[...]]` in prose is not treated as wikilinks."""
    return re.sub(r"`[^`\n]*`", "", markdown)


def _body_code_spans(body: str) -> list[tuple[int, int]]:
    spans = _protected_inline_code_spans(body)
    for match in FENCED_CODE_RE.finditer(body):
        spans.append(match.span())
    return spans


def _heading_plain_text(text: str) -> str:
    """Remove markdown links from heading text before title-case analysis."""
    plain = MARKDOWN_LINK_IN_HEADING_RE.sub("", text)
    return re.sub(r"\s+", " ", plain).strip(" ,;:")


def _normalize_heading_word(word: str) -> str:
    return word.strip(".,;:!?")


def _is_proper_noun_token(word: str) -> bool:
    word = _normalize_heading_word(word)
    if not word:
        return True
    if word.isupper() and len(word) > 1:
        return True
    if any(ch.isdigit() for ch in word) or "-" in word:
        return True
    if word[0].isupper() and any(ch.islower() for ch in word) and any(ch.isupper() for ch in word[1:]):
        return True
    return False


def _is_setext_text_line(line: str) -> bool:
    """True when a line can be the text row of a Setext heading (not ATX or HR)."""
    stripped = line.strip()
    if not stripped:
        return False
    if HEADING_LINE_RE.match(line):
        return False
    if THEMATIC_BREAK_RE.match(stripped):
        return False
    return True


def _format_setext_warning(file_name: str, line_no: int, title: str, underline: str) -> str:
    return (
        f"In {file_name}:{line_no}: Setext heading {title!r} with {underline} underline; "
        f"{SETEXT_ATX_HINT}"
    )


def _title_case_words_after_first(text: str) -> list[str]:
    plain = _heading_plain_text(text)
    words = [_normalize_heading_word(w) for w in re.split(r"\s+", plain) if w]
    if len(words) < 2:
        return []
    return [
        w
        for w in words[1:]
        if len(w) > 2
        and w[0].isupper()
        and any(ch.islower() for ch in w)
        and not _is_proper_noun_token(w)
    ]


def lint_thematic_breaks(config: WikiConfig, file_filter: set[str] | None = None) -> list[str]:
    """Lint horizontal rules (thematic breaks) in markdown body text."""
    warnings: list[str] = []
    for file_path in iter_markdown_files(config):
        route = route_for_document_file(config, file_path)
        if file_filter is not None and route not in file_filter:
            continue
        content = file_path.read_text(encoding="utf-8")
        body = _markdown_body(content)
        protected = _body_code_spans(body)
        lines = body.splitlines()
        offset = 0
        prev_line: str | None = None
        prev_line_start = 0
        prev_line_end = 0
        for line_no, line in enumerate(lines, start=1):
            line_start = offset
            line_end = offset + len(line)
            stripped = line.strip()
            in_code = _span_overlaps(line_start, line_end, protected)
            prev_in_code = (
                prev_line is not None
                and _span_overlaps(prev_line_start, prev_line_end, protected)
            )
            is_setext = False
            if (
                prev_line is not None
                and _is_setext_text_line(prev_line)
                and not in_code
                and not prev_in_code
            ):
                if SETEXT_H2_UNDERLINE_RE.match(stripped):
                    is_setext = True
            if (
                not is_setext
                and THEMATIC_BREAK_RE.match(stripped)
                and not in_code
            ):
                warnings.append(
                    f"In {file_path.name}:{line_no}: Thematic break '{stripped}' in body; "
                    "use headings instead of horizontal rules."
                )
            prev_line = line
            prev_line_start = line_start
            prev_line_end = line_end
            offset = line_end + 1
    return warnings


@lru_cache(maxsize=1)
def _lint_markdown_parser() -> MarkdownIt:
    return MarkdownIt("gfm-like", {"linkify": False})


def _parse_body_headings(body: str) -> list[tuple[int, int, str]]:
    """Return (line_no, level, raw_text) from heading_open + inline tokens."""
    tokens = _lint_markdown_parser().parse(body)
    headings: list[tuple[int, int, str]] = []
    for index, token in enumerate(tokens):
        if token.type != "heading_open":
            continue
        level = int(token.tag[1:])
        line_no = token.map[0] + 1 if token.map else 0
        text = ""
        if index + 1 < len(tokens) and tokens[index + 1].type == "inline":
            text = tokens[index + 1].content
        headings.append((line_no, level, text))
    return headings


def _normalize_heading_for_duplicate(text: str) -> str:
    plain = _heading_plain_text(text)
    plain = re.sub(r"`([^`\n]+)`", r"\1", plain)
    return " ".join(plain.strip().casefold().split())


def lint_heading_levels(config: WikiConfig, file_filter: set[str] | None = None) -> list[str]:
    """Lint heading depth increments (markdownlint MD001-inspired).

    Each heading must be at most one level deeper than the previous heading.
    """
    warnings: list[str] = []
    for file_path in iter_markdown_files(config):
        route = route_for_document_file(config, file_path)
        if file_filter is not None and route not in file_filter:
            continue
        body = _markdown_body(file_path.read_text(encoding="utf-8"))
        previous_level = 0
        for line_no, level, _text in _parse_body_headings(body):
            if previous_level > 0 and level > previous_level + 1:
                warnings.append(
                    f"In {file_path.name}:{line_no}: Heading h{level} skips level h{previous_level + 1}; "
                    "increase depth by one at a time."
                )
            previous_level = level
    return warnings


def lint_duplicate_headings(config: WikiConfig, file_filter: set[str] | None = None) -> list[str]:
    """Lint duplicate H2+ heading text in one document (markdownlint MD024-inspired)."""
    warnings: list[str] = []
    for file_path in iter_markdown_files(config):
        route = route_for_document_file(config, file_path)
        if file_filter is not None and route not in file_filter:
            continue
        body = _markdown_body(file_path.read_text(encoding="utf-8"))
        seen: dict[str, int] = {}
        for line_no, level, text in _parse_body_headings(body):
            if level <= 1:
                continue
            key = _normalize_heading_for_duplicate(text)
            if not key:
                continue
            if key in seen:
                warnings.append(
                    f"In {file_path.name}:{line_no}: Duplicate heading h{level} {text!r} "
                    f"(first at line {seen[key]})."
                )
            else:
                seen[key] = line_no
    return warnings


def lint_headings(config: WikiConfig, file_filter: set[str] | None = None) -> list[str]:
    """Lint editorial heading style (H2+ sentence case, no numbering).

    ATX heading syntax is enforced by ``wiki fmt`` (mdformat); Setext headings
    are converted there rather than reported here.
    """
    warnings: list[str] = []
    for file_path in iter_markdown_files(config):
        route = route_for_document_file(config, file_path)
        if file_filter is not None and route not in file_filter:
            continue
        content = file_path.read_text(encoding="utf-8")
        body = _markdown_body(content)
        for match in HEADING_LINE_RE.finditer(body):
            level, text = match.group(1), match.group(2).strip()
            if NUMBERED_HEADING_RE.match(text):
                warnings.append(
                    f"In {file_path.name}: Numbered heading {level} {text!r}; use unnumbered headings."
                )
                continue
            if len(level) > 1 and len(_title_case_words_after_first(text)) >= 2:
                warnings.append(
                    f"In {file_path.name}: H2+ heading {level} {text!r} looks like title case; "
                    "use sentence case (capitalize only the first word and proper nouns)."
                )
    return warnings


def _line_number_for_offset(content: str, offset: int) -> int:
    return content[:offset].count("\n") + 1


def lint_link_style(config: WikiConfig, file_filter: set[str] | None = None) -> list[str]:
    """Flag Obsidian wikilinks in body prose when vault link_style is markdown."""
    if config.link.style != "markdown":
        return []
    warnings: list[str] = []
    for file_path in iter_markdown_files(config):
        route = route_for_document_file(config, file_path)
        if file_filter is not None and route not in file_filter:
            continue
        content = file_path.read_text(encoding="utf-8")
        prefix, body = _split_frontmatter(content)
        body_offset = len(prefix)
        protected = _body_code_spans(body)
        for match in WIKILINK_FULL_REGEX.finditer(body):
            start, end = match.span()
            if _span_overlaps(start, end, protected):
                continue
            line_no = _line_number_for_offset(content, body_offset + start)
            warnings.append(
                f"In {file_path.name}:{line_no}: Wikilink {match.group(0)!r}; "
                "use Markdown links ([display](Page.md)) per link_style."
            )
    return warnings


def _heading_ids(markdown: str) -> set[str]:
    slugger = GitHubHeadingSlugger()
    ids: set[str] = set()
    for m in re.finditer(r"^(#{1,6})\s+(.+)$", markdown, flags=re.MULTILINE):
        ids.add(slugger.slug(m.group(2).strip()))
    return ids


def _page_target_issue(
    existing_files: set[str],
    heading_ids_by_route: dict[str, set[str]],
    current_route: str,
    target: str,
    label: str,
) -> str | None:
    page_part, fragment = split_target(target)
    route = current_route if page_part == "" else resolve_page_route(current_route, target)
    if route is None or route not in existing_files:
        return "missing_document"
    if fragment:
        target_fragment = fragment_id(fragment)
        if target_fragment not in heading_ids_by_route.get(route, set()):
            return "missing_heading"
    return None


def _page_target_message(current_route: str, target: str, label: str, issue_kind: str) -> str:
    if issue_kind == "missing_document":
        return f"In {current_route}: Broken {label} [{target}] points to non-existent document."
    _, fragment = split_target(target)
    target_fragment = fragment_id(fragment)
    return (
        f"In {current_route}: Broken {label} [{target}] "
        f"points to missing heading '#{target_fragment}'."
    )


def _append_wiki_curie_issue(
    issues: list[BrokenLink],
    existing_files: set[str],
    current_route: str,
    file_path: Path,
    curie: str,
    label: str,
) -> None:
    route = _wiki_route_from_curie(curie)
    if route is None:
        return
    if route not in existing_files:
        issues.append(
            BrokenLink(
                source_route=current_route,
                source_path=file_path,
                link_kind=label,
                raw_target=curie,
                issue_kind="missing_document",
                message=(
                    f"In {current_route}: Broken {label} [{curie}] points to non-existent wiki document."
                ),
            )
        )


def _wiki_route_from_curie(curie: str) -> str | None:
    if not WIKI_CURIE_RE.match(curie):
        return None
    local = curie.split(":", 1)[1]
    local = local.split("#", 1)[0]
    if local.endswith(".md"):
        local = local[:-3]
    return local


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


def _apply_issues(
    results: dict[str, Any],
    rule_key: str,
    issues: list[str],
    rules: CheckConfig | LintConfig,
) -> None:
    severity = getattr(rules, rule_key, "warning")
    if severity == "off":
        return
    if severity == "error":
        if issues:
            results["conforms"] = False
            results["errors"].extend(issues)
    else:
        results["warnings"].extend(issues)


def _empty_results() -> dict[str, Any]:
    return {"conforms": True, "errors": [], "warnings": []}


def check_layout_frontmatter(
    config: WikiConfig,
    file_filter: set[str] | None = None,
) -> list[str]:
    """Check that wazoo:layout paths resolve to readable HTML files."""
    missing: list[str] = []
    config_root = config.config_root.resolve()

    for file_path in iter_markdown_files(config):
        try:
            route = route_for_document_file(config, file_path)
        except ValueError:
            continue
        if file_filter is not None and route not in file_filter:
            continue
        fm_data, _ = split_document_body(file_path)
        if fm_data is None:
            continue

        raw_layout = fm_data.get(LAYOUT_FRONTMATTER_KEY)
        if not isinstance(raw_layout, str) or not raw_layout.strip():
            continue
        layout_path = resolve_layout_path(raw_layout, config_root)
        if not layout_file_is_valid(layout_path, config_root):
            missing.append(
                f"In {route}: {LAYOUT_FRONTMATTER_KEY} {raw_layout!r} must resolve to a readable .html file under the wiki config root."
            )

    return missing


def run_check(config: WikiConfig, file_filter: set[str] | None = None) -> dict[str, Any]:
    """Run integrity checks: SHACL, route safety, collisions, and layout frontmatter."""
    results = _empty_results()

    try:
        shacl_conforms, shacl_text = check_shacl_all(config)
        if not shacl_conforms:
            results["conforms"] = False
            results["errors"].append(f"SHACL Validation Violation:\n{shacl_text}")
    except Exception as e:
        results["conforms"] = False
        results["errors"].append(f"SHACL validation system error: {e}")

    safety_issues = validate_route_safety(config)
    if safety_issues:
        results["conforms"] = False
        results["errors"].extend(safety_issues)
    else:
        owned_output_dir = Path("_site") / config.site.base_url.strip("/") if config.site.base_url else Path("_site")
        collision_issues = detect_output_collisions(
            build_page_manifest(config, owned_output_dir, config.site.base_url, config.site.url_style)
            + build_asset_manifest(config, owned_output_dir, config.site.base_url)
        )
        if collision_issues:
            results["conforms"] = False
            results["errors"].extend(collision_issues)

    layout_issues = check_layout_frontmatter(config, file_filter=file_filter)
    _apply_issues(results, "missing_layout_file", layout_issues, config.check)

    return results


def run_lint(config: WikiConfig, file_filter: set[str] | None = None) -> dict[str, Any]:
    """Run lint rules: broken links, filename pattern, heading style, and link style."""
    results = _empty_results()

    safety_issues = validate_route_safety(config)
    if safety_issues:
        results["conforms"] = False
        results["errors"].extend(safety_issues)
        return results

    link_issues = lint_broken_links(config, file_filter=file_filter)
    _apply_issues(results, "broken_links", link_issues, config.lint)

    filename_issues = lint_filenames(config, file_filter=file_filter)
    _apply_issues(results, "filename_pattern", filename_issues, config.lint)

    heading_issues = lint_headings(config, file_filter=file_filter)
    _apply_issues(results, "headings", heading_issues, config.lint)

    heading_level_issues = lint_heading_levels(config, file_filter=file_filter)
    _apply_issues(results, "heading_levels", heading_level_issues, config.lint)

    duplicate_heading_issues = lint_duplicate_headings(config, file_filter=file_filter)
    _apply_issues(results, "duplicate_headings", duplicate_heading_issues, config.lint)

    thematic_break_issues = lint_thematic_breaks(config, file_filter=file_filter)
    _apply_issues(results, "thematic_breaks", thematic_break_issues, config.lint)

    link_style_issues = lint_link_style(config, file_filter=file_filter)
    _apply_issues(results, "link_style", link_style_issues, config.lint)

    return results


def merge_results(first: dict[str, Any], second: dict[str, Any]) -> dict[str, Any]:
    """Merge two audit result dicts from run_check and run_lint."""
    return {
        "conforms": first["conforms"] and second["conforms"],
        "errors": first["errors"] + second["errors"],
        "warnings": first["warnings"] + second["warnings"],
    }
