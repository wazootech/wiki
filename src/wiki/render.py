"""Dynamic SPARQL block rendering and wikilink-to-HTML conversion."""

from __future__ import annotations

from pathlib import Path
import re
from typing import Any

import click
from markdown_it import MarkdownIt

from .format import run_query
from wiki.mdit_py_plugins.wikilink import wikilink_plugin
from .paths import iter_markdown_files, page_routes, select_markdown_paths

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
    explicit_files: tuple[Path, ...] = (),
) -> list[Path]:
    """Choose markdown files to process for SPARQL rendering."""
    if explicit_files:
        candidates = select_markdown_paths(context, explicit_files)
    else:
        candidates = iter_markdown_files(context)
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
    explicit_files: tuple[Path, ...] = (),
) -> tuple[int, int, list[str]]:
    """Iterate over markdown files, parse and replace dynamic SPARQL sections inline.

    Returns (success_count, error_count, stale_files).
    """
    success_count = 0
    error_count = 0
    stale_files: list[str] = []
    markdown_files = select_markdown_files_for_render(context, explicit_files=explicit_files)

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


def render_markdown(text: str) -> str:
    """Render wikilinks in *text* to HTML anchor tags, leaving all other markdown intact."""
    md = MarkdownIt("gfm-like", {"linkify": False})
    md.use(wikilink_plugin)
    return md.render(text)
