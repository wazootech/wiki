"""Dynamic SPARQL block rendering and wikilink-to-HTML conversion."""

from __future__ import annotations

import fnmatch
from pathlib import Path
import re
from typing import Any

import click
from markdown_it import MarkdownIt

from .format import run_query
from wiki.mdit_py_plugins.wikilink import wikilink_plugin
from .paths import iter_markdown_files, page_routes, route_for_document_file

# Matches SPARQL wrapper comments, fenced query, rendered table, and end comment.
SPARQL_BLOCK_REGEX = re.compile(
    r"(?P<start><!--\s*sparql:start\s*-->)(?P<prefix>\s*)"
    r"(?P<fence>```sparql\s*(?P<query>.*?)\s*```)(?P<mid>\s*)"
    r"(?P<table>.*?)(?P<suffix>\s*)(?P<end><!--\s*sparql:end\s*-->)",
    re.DOTALL | re.IGNORECASE,
)


def has_sparql_blocks(md_file: Path) -> bool:
    """Return True if the markdown file contains at least one SPARQL block."""
    try:
        content = md_file.read_text(encoding="utf-8")
    except OSError:
        return False
    return SPARQL_BLOCK_REGEX.search(content) is not None


def select_markdown_files_for_render(
    context: Any,
    *,
    file_filter: Path | None = None,
    glob_filters: tuple[str, ...] = (),
) -> list[Path]:
    """Choose markdown files to process for SPARQL rendering."""
    candidates = _select_markdown_files(context, file_filter=file_filter, glob_filters=glob_filters)
    return [md_file for md_file in candidates if has_sparql_blocks(md_file)]


def _replace_sparql_table(match: re.Match[str], rendered_markdown: str) -> str:
    """Rebuild a SPARQL block, preserving the on-disk query fence and surrounding whitespace."""
    suffix = match.group("suffix")
    if not suffix:
        suffix = "\n"
    return (
        f"{match.group('start')}{match.group('prefix')}{match.group('fence')}"
        f"{match.group('mid')}{rendered_markdown}{suffix}{match.group('end')}"
    )


def _is_table_divider_row(cells: list[str]) -> bool:
    return bool(cells) and all(re.fullmatch(r"-+", cell) for cell in cells)


def _normalize_markdown_table(text: str) -> str:
    """Normalize GFM table padding so compact and mdformat-padded tables compare equal."""
    lines = [line.strip() for line in text.strip().splitlines() if line.strip()]
    normalized: list[str] = []
    for index, line in enumerate(lines):
        if not line.startswith("|"):
            normalized.append(line)
            continue
        cells = [cell.strip() for cell in line.strip("|").split("|")]
        if index == 0:
            cells = [cell.casefold() for cell in cells]
        elif _is_table_divider_row(cells):
            cells = ["---"] * len(cells)
        normalized.append("| " + " | ".join(cells) + " |")
    return "\n".join(normalized)


def _sparql_table_matches(existing: str, rendered: str) -> bool:
    """Return True when the on-disk table already matches the rendered output."""
    return _normalize_markdown_table(existing) == _normalize_markdown_table(rendered)


def render_markdown_files(
    context: Any,
    graph: Any,
    dry_run: bool = False,
    file_filter: Path | None = None,
    glob_filters: tuple[str, ...] = (),
) -> tuple[int, int, list[str]]:
    """Iterate over markdown files, parse and replace dynamic SPARQL sections inline.

    Returns (success_count, error_count, stale_files).
    """
    success_count = 0
    error_count = 0
    stale_files: list[str] = []
    markdown_files = select_markdown_files_for_render(
        context,
        file_filter=file_filter,
        glob_filters=glob_filters,
    )

    known_slugs = {pr.route for pr in page_routes(context)}

    for md_file in markdown_files:
        content = md_file.read_text(encoding="utf-8")
        modified = False
        file_errors = 0

        def replacer(match: re.Match[str]) -> str:
            nonlocal modified, file_errors
            query = match.group("query").strip()
            try:
                rendered_markdown = run_query(
                    graph,
                    query,
                    output_format="markdown",
                    wiki_base=context.wiki_base,
                    known_slugs=known_slugs,
                )
                existing_table = match.group("table")
                if _sparql_table_matches(existing_table, rendered_markdown):
                    return match.group(0)
                modified = True
                return _replace_sparql_table(match, rendered_markdown)
            except Exception as e:
                click.echo(f"Error rendering query in {md_file.name}: {e}", err=True)
                file_errors += 1
                return match.group(0)

        new_content = SPARQL_BLOCK_REGEX.sub(replacer, content)
        if modified:
            if new_content == content:
                continue
            try:
                rel = str(md_file.relative_to(Path.cwd()))
            except ValueError:
                rel = str(md_file)
            stale_files.append(rel)

            if not dry_run:
                md_file.write_text(new_content, encoding="utf-8")
                success_count += 1
        error_count += file_errors

    return (success_count, error_count, stale_files)


def _select_markdown_files(context: Any, file_filter: Path | None, glob_filters: tuple[str, ...]) -> list[Path]:
    markdown_files = iter_markdown_files(context)
    if file_filter is None and not glob_filters:
        return markdown_files

    normalized_file = file_filter.resolve() if file_filter is not None else None
    selected: list[Path] = []
    for md_file in markdown_files:
        if normalized_file is not None and md_file.resolve() == normalized_file:
            selected.append(md_file)
            continue
        if glob_filters and _matches_any_glob(context, md_file, glob_filters):
            selected.append(md_file)
    return selected


def _matches_any_glob(context: Any, md_file: Path, glob_filters: tuple[str, ...]) -> bool:
    route = route_for_document_file(context, md_file)
    candidates = {
        md_file.name,
        md_file.as_posix(),
        context.relative_to_root(md_file),
        route,
        f"{route}.md" if route else "index.md",
    }
    return any(fnmatch.fnmatchcase(candidate, pattern) for pattern in glob_filters for candidate in candidates)


def render_markdown(text: str) -> str:
    """Render wikilinks in *text* to HTML anchor tags, leaving all other markdown intact."""
    md = MarkdownIt("gfm-like", {"linkify": False})
    md.use(wikilink_plugin)
    return md.render(text)
