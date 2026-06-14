"""Wiki-wide link graph: broken-link detection and backlink indexing."""

from __future__ import annotations

import re
from collections import defaultdict
from pathlib import Path
from typing import Any
from urllib.parse import unquote

from .assets import asset_reference_issue, audit_assets
from .config import Config
from .document import (
    MARKDOWN_LINK_FULL_REGEX,
    WIKILINK_FULL_REGEX,
    protected_inline_code_spans,
    span_overlaps,
    split_frontmatter_text,
    strip_inline_code,
)
from .headings import parse_headings
from .links import (
    fragment_id,
    is_external_link,
    markdown_link_is_page,
    resolve_page_route,
    split_target,
)
from .parser import document_data_from_path
from .paths import iter_document_files, route_for_document_file
from .schemas import BrokenLink

# Microdata attributes that may hold wiki: CURIE entity references.
MICRODATA_WIKI_CURIE_ATTR = re.compile(
    r'(?:itemid|href|src)\s*=\s*["\'](wiki:[^"\']+)["\']',
    re.IGNORECASE,
)

WIKI_CURIE_RE = re.compile(r"^wiki:[^\s]+$")

_METADATA_SKIP_KEYS = frozenset({"@context", "@id", "id", "@type", "type"})


class LinkIndex:
    """Link graph of a wiki: routes, broken links, and backlinks."""

    def __init__(
        self,
        config: Config,
        *,
        existing_routes: set[str],
        heading_ids_by_route: dict[str, set[str]],
        backlinks_by_route: dict[str, list[str]],
    ) -> None:
        self._config = config
        self._existing_routes = existing_routes
        self._heading_ids_by_route = heading_ids_by_route
        self._backlinks_by_route = backlinks_by_route

    @classmethod
    def from_config(cls, config: Config) -> LinkIndex:
        existing_routes: set[str] = set()
        heading_ids_by_route: dict[str, set[str]] = {}
        backlinks: dict[str, list[str]] = defaultdict(list)

        for file_path in iter_document_files(config):
            route = route_for_document_file(config, file_path)
            existing_routes.add(route)
            if file_path.suffix.lower() == ".md":
                content = file_path.read_text(encoding="utf-8")
                heading_ids_by_route[route] = _heading_ids(content)
                _index_page_links(config, file_path, route, content, backlinks)
            else:
                heading_ids_by_route[route] = set()

        return cls(
            config,
            existing_routes=existing_routes,
            heading_ids_by_route=heading_ids_by_route,
            backlinks_by_route=dict(backlinks),
        )

    def backlinks_to(self, route: str) -> list[str]:
        return list(self._backlinks_by_route.get(route, []))

    def broken_links(self, file_filter: set[str] | None = None) -> list[BrokenLink]:
        issues: list[BrokenLink] = []

        for file_path in iter_document_files(self._config):
            file_slug = route_for_document_file(self._config, file_path)
            if file_filter is not None and file_slug not in file_filter:
                continue
            try:
                data = document_data_from_path(file_path)

                if file_path.suffix.lower() == ".md":
                    content = file_path.read_text(encoding="utf-8")
                    split = split_frontmatter_text(content)
                    body = split.body
                    body_offset = len(split.prefix)
                    protected = protected_inline_code_spans(body)

                    for match in WIKILINK_FULL_REGEX.finditer(body):
                        start, end = match.span()
                        if span_overlaps(start, end, protected):
                            continue
                        link_target = match.group(1).strip()
                        issue = _page_target_issue(
                            self._existing_routes,
                            self._heading_ids_by_route,
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
                        if span_overlaps(start, end, protected):
                            continue
                        target = unquote(match.group(2).split("?")[0])
                        if is_external_link(target):
                            continue
                        if markdown_link_is_page(target):
                            issue = _page_target_issue(
                                self._existing_routes,
                                self._heading_ids_by_route,
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
                            asset_issue = asset_reference_issue(self._config, file_path, target)
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

                    link_scan = strip_inline_code(body)
                    for curie in MICRODATA_WIKI_CURIE_ATTR.findall(link_scan):
                        _append_wiki_curie_issue(
                            issues, self._existing_routes, file_slug, file_path, curie, "Microdata reference"
                        )

                for curie in _wiki_curies_in_metadata(data or {}):
                    _append_wiki_curie_issue(
                        issues, self._existing_routes, file_slug, file_path, curie, "Metadata reference"
                    )

                for target in _frontmatter_asset_targets(data or {}):
                    asset_issue = asset_reference_issue(self._config, file_path, target)
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

        for warning in audit_assets(self._config):
            issues.append(
                BrokenLink(
                    source_route="",
                    source_path=self._config.config_root,
                    link_kind="Asset directory",
                    raw_target="",
                    issue_kind="missing_asset",
                    message=warning,
                )
            )

        return issues


def _index_page_links(
    config: Config,
    file_path: Path,
    source_route: str,
    content: str,
    backlinks: dict[str, list[str]],
) -> None:
    split = split_frontmatter_text(content)
    body = split.body
    protected = protected_inline_code_spans(body)

    for match in WIKILINK_FULL_REGEX.finditer(body):
        start, end = match.span()
        if span_overlaps(start, end, protected):
            continue
        target = resolve_page_route(source_route, match.group(1).strip())
        if target is None:
            continue
        if source_route not in backlinks[target]:
            backlinks[target].append(source_route)

    for match in MARKDOWN_LINK_FULL_REGEX.finditer(body):
        start, end = match.span()
        if span_overlaps(start, end, protected):
            continue
        raw_target = unquote(match.group(2).split("?")[0])
        if is_external_link(raw_target) or not markdown_link_is_page(raw_target):
            continue
        target = resolve_page_route(source_route, raw_target)
        if target is None:
            continue
        if source_route not in backlinks[target]:
            backlinks[target].append(source_route)


def _heading_ids(markdown: str) -> set[str]:
    ids: set[str] = set()
    for heading in parse_headings(markdown):
        ids.add(heading.slug)
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


def _wiki_curies_in_metadata(data: dict[str, Any]) -> list[str]:
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
