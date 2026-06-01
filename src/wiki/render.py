"""Dynamic SPARQL block rendering and wikilink-to-HTML conversion."""

from __future__ import annotations

import fnmatch
from pathlib import Path
import re
from typing import Any

import click
from markdown_it import MarkdownIt

from .format import run_query
from mdit_py_plugins.wikilink import wikilink_plugin
from .paths import iter_markdown_files, page_routes, route_for_markdown_file

# Matches the starting comment, query inside, and ending comment block with SPARQL inside
SPARQL_BLOCK_REGEX = re.compile(
    r"<!--\s*sparql:start\s*-->\s*```sparql\s*(.*?)\s*```\s*(.*?)\s*<!--\s*sparql:end\s*-->",
    re.DOTALL | re.IGNORECASE
)


def render_markdown_files(
    context: Any,
    graph: Any,
    dry_run: bool = False,
    file_filter: Path | None = None,
    glob_filters: tuple[str, ...] = (),
) -> tuple[int, int, list[str]]:
    """Iterate over all markdown files, parse and replace dynamic SPARQL sections inline.

    Returns (success_count, error_count, stale_files).
    """
    success_count = 0
    error_count = 0
    stale_files = []
    markdown_files = _select_markdown_files(context, file_filter=file_filter, glob_filters=glob_filters)

    known_slugs = {pr.route for pr in page_routes(context)}

    for md_file in markdown_files:
        content = md_file.read_text(encoding="utf-8")
        modified = False
        file_errors = 0

        def replacer(match: re.Match) -> str:
            nonlocal modified, file_errors
            query = match.group(1).strip()
            try:
                rendered_markdown = run_query(graph, query, output_format="markdown", wiki_base=context.wiki_base, known_slugs=known_slugs)
                modified = True
                return f"<!-- sparql:start -->\n```sparql\n{query}\n```\n\n{rendered_markdown}\n<!-- sparql:end -->"
            except Exception as e:
                click.echo(f"Error rendering query in {md_file.name}: {e}", err=True)
                file_errors += 1
                return str(match.group(0))

        new_content = SPARQL_BLOCK_REGEX.sub(replacer, content)
        if modified and new_content != content:
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
    route = route_for_markdown_file(context, md_file)
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
