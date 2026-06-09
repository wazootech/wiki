"""Detect plain-text page mentions that could be wikilinks."""

from __future__ import annotations

import re
from pathlib import Path
from .document import MARKDOWN_LINK_REGEX, WIKILINK_REGEX, markdown_body, split_frontmatter_text
from .schemas import LinkOpportunity
from .config import Config
from .parser import document_data_from_path
from .links import format_internal_link
from .paths import iter_markdown_files, route_for_document_file
from .site import extract_title, humanize_route

MIN_ALIAS_LENGTH = 4

FENCED_CODE_RE = re.compile(r"```[\s\S]*?```")
INLINE_CODE_RE = re.compile(r"`[^`\n]+`")


def find_link_opportunities(
    config: Config,
    file_filter: set[str] | None = None,
    *,
    min_alias_length: int = MIN_ALIAS_LENGTH,
) -> list[LinkOpportunity]:
    """Scan markdown bodies for unlinked mentions of other wiki pages."""
    pages: list[tuple[str, str, dict]] = []
    for file_path in iter_markdown_files(config):
        route = route_for_document_file(config, file_path)
        if file_filter is not None and route not in file_filter:
            continue
        data = document_data_from_path(file_path) or {}
        content = file_path.read_text(encoding="utf-8")
        body = markdown_body(content)
        title = data.get("name") if isinstance(data.get("name"), str) else None
        if not title:
            title = extract_title(body, route)
        pages.append((route, title, data))

    alias_entries: list[tuple[str, str, str]] = []
    for route, title, data in pages:
        for alias in _page_aliases(route, title, data, min_alias_length):
            alias_entries.append((alias, route, title))

    alias_entries.sort(key=lambda item: len(item[0]), reverse=True)
    if not alias_entries:
        return []

    pattern = re.compile(
        "|".join(re.escape(alias) for alias, _, _ in alias_entries),
        re.IGNORECASE,
    )
    alias_routes = {alias.casefold(): (route, title) for alias, route, title in alias_entries}

    opportunities: list[LinkOpportunity] = []
    for file_path in iter_markdown_files(config):
        source_route = route_for_document_file(config, file_path)
        if file_filter is not None and source_route not in file_filter:
            continue
        body = markdown_body(file_path.read_text(encoding="utf-8"))
        protected = _protected_spans(body)
        claimed: list[tuple[int, int]] = []

        for match in pattern.finditer(body):
            start, end = match.span()
            if not _word_boundaries_ok(body, start, end):
                continue
            if _overlaps_spans(start, end, protected):
                continue
            if _overlaps_spans(start, end, claimed):
                continue

            target_route, target_title = alias_routes[match.group(0).casefold()]
            if target_route == source_route:
                continue

            line, column = _line_column(body, start)
            opportunities.append(
                LinkOpportunity(
                    source_route=source_route,
                    source_file=file_path.name,
                    line=line,
                    column=column,
                    matched_text=body[start:end],
                    target_route=target_route,
                    target_title=target_title,
                )
            )
            claimed.append((start, end))

    opportunities.sort(key=lambda item: (item.source_route, item.line, item.column))
    return opportunities


def _page_aliases(route: str, title: str, data: dict, min_alias_length: int) -> list[str]:
    aliases: set[str] = set()
    for candidate in (title, humanize_route(route)):
        text = candidate.strip()
        if _alias_is_linkable(text, route, min_alias_length):
            aliases.add(text)
    name = data.get("name")
    if isinstance(name, str):
        text = name.strip()
        if _alias_is_linkable(text, route, min_alias_length):
            aliases.add(text)
    return sorted(aliases, key=len, reverse=True)


def _alias_is_linkable(text: str, route: str, min_alias_length: int) -> bool:
    if len(text) < min_alias_length:
        return False
    if " " in text:
        return True
    stem = route.split("/")[-1]
    if "_" in stem and humanize_route(route).casefold() == text.casefold():
        return True
    return len(text) >= 8


def _protected_spans(text: str) -> list[tuple[int, int]]:
    spans: list[tuple[int, int]] = []
    for regex in (FENCED_CODE_RE, INLINE_CODE_RE, WIKILINK_REGEX, MARKDOWN_LINK_REGEX):
        for match in regex.finditer(text):
            spans.append((match.start(), match.end()))
    return _merge_spans(spans)


def _merge_spans(spans: list[tuple[int, int]]) -> list[tuple[int, int]]:
    if not spans:
        return []
    ordered = sorted(spans)
    merged = [ordered[0]]
    for start, end in ordered[1:]:
        last_start, last_end = merged[-1]
        if start <= last_end:
            merged[-1] = (last_start, max(last_end, end))
        else:
            merged.append((start, end))
    return merged


def _overlaps_spans(start: int, end: int, spans: list[tuple[int, int]]) -> bool:
    return any(start < span_end and end > span_start for span_start, span_end in spans)


def _word_boundaries_ok(text: str, start: int, end: int) -> bool:
    before = text[start - 1] if start > 0 else " "
    after = text[end] if end < len(text) else " "
    return not (before.isalnum() or before in "_-") and not (after.isalnum() or after in "_-")


def _line_column(text: str, index: int) -> tuple[int, int]:
    line = text.count("\n", 0, index) + 1
    last_newline = text.rfind("\n", 0, index)
    column = index - last_newline if last_newline >= 0 else index + 1
    return line, column


def apply_link_opportunities(
    config: Config,
    opportunities: list[LinkOpportunity],
    *,
    dry_run: bool = False,
) -> list[Path]:
    """Insert suggested wikilinks into markdown bodies (never frontmatter)."""
    if not opportunities:
        return []

    route_paths: dict[str, Path] = {
        route_for_document_file(config, file_path): file_path
        for file_path in iter_markdown_files(config)
    }

    by_route: dict[str, list[LinkOpportunity]] = {}
    for opportunity in opportunities:
        by_route.setdefault(opportunity.source_route, []).append(opportunity)

    changed: list[Path] = []
    for route, route_opportunities in by_route.items():
        file_path = route_paths.get(route)
        if file_path is None:
            continue

        split = split_frontmatter_text(file_path.read_text(encoding="utf-8"))
        prefix, body = split.prefix, split.body
        lines = body.splitlines(keepends=True)
        for opportunity in sorted(route_opportunities, key=lambda item: (item.line, item.column), reverse=True):
            line_index = opportunity.line - 1
            if line_index < 0 or line_index >= len(lines):
                continue
            line = lines[line_index]
            line_content = line.rstrip("\n\r")
            column_index = opportunity.column - 1
            if column_index < 0:
                continue
            if line_content[column_index : column_index + len(opportunity.matched_text)] != opportunity.matched_text:
                continue
            link = format_internal_link(
                opportunity.target_route,
                opportunity.matched_text,
                config.link.style,
            )
            lines[line_index] = (
                line_content[:column_index]
                + link
                + line_content[column_index + len(opportunity.matched_text) :]
                + line[len(line_content) :]
            )

        new_content = prefix + "".join(lines)
        if dry_run:
            changed.append(file_path)
            continue
        file_path.write_text(new_content, encoding="utf-8")
        changed.append(file_path)

    return changed
