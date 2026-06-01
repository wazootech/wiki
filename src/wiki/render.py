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
from .graph_cache import (
    file_stat_entry,
    load_render_state,
    save_render_state,
    vault_fingerprint,
)
from .paths import iter_markdown_files, page_routes, route_for_markdown_file

# Matches the starting comment, query inside, and ending comment block with SPARQL inside
SPARQL_BLOCK_REGEX = re.compile(
    r"<!--\s*sparql:start\s*-->\s*```sparql\s*(.*?)\s*```\s*(.*?)\s*<!--\s*sparql:end\s*-->",
    re.DOTALL | re.IGNORECASE
)


def has_sparql_blocks(md_file: Path) -> bool:
    """Return True if the markdown file contains at least one SPARQL block."""
    try:
        content = md_file.read_text(encoding="utf-8")
    except OSError:
        return False
    return SPARQL_BLOCK_REGEX.search(content) is not None


def _is_file_stale(
    context: Any,
    md_file: Path,
    vault_fp: str,
    state: dict[str, Any] | None,
) -> bool:
    if state is None or state.get("vault_fingerprint") != vault_fp:
        return True
    rel = context.relative_to_root(md_file)
    recorded = (state.get("files") or {}).get(rel)
    if not isinstance(recorded, dict):
        return True
    current = file_stat_entry(context, md_file)
    return (
        recorded.get("mtime_ns") != current["mtime_ns"]
        or recorded.get("size") != current["size"]
    )


def select_markdown_files_for_render(
    context: Any,
    *,
    file_filter: Path | None = None,
    glob_filters: tuple[str, ...] = (),
    render_all: bool = False,
) -> list[Path]:
    """Choose markdown files to process for SPARQL rendering."""
    candidates = _select_markdown_files(context, file_filter=file_filter, glob_filters=glob_filters)
    with_sparql = [md_file for md_file in candidates if has_sparql_blocks(md_file)]

    explicit_target = file_filter is not None or bool(glob_filters)
    if render_all or explicit_target:
        return with_sparql

    vault_fp = vault_fingerprint(context)
    state = load_render_state(context)
    return [md_file for md_file in with_sparql if _is_file_stale(context, md_file, vault_fp, state)]


def _commit_render_state(context: Any, processed_files: list[Path]) -> None:
    if not processed_files:
        return
    vault_fp = vault_fingerprint(context)
    state = load_render_state(context) or {"vault_fingerprint": vault_fp, "files": {}}
    files_state = dict(state.get("files") or {})
    state["vault_fingerprint"] = vault_fp
    for md_file in processed_files:
        rel = context.relative_to_root(md_file)
        files_state[rel] = file_stat_entry(context, md_file)
    state["files"] = files_state
    save_render_state(context, state)


def render_markdown_files(
    context: Any,
    graph: Any,
    dry_run: bool = False,
    file_filter: Path | None = None,
    glob_filters: tuple[str, ...] = (),
    render_all: bool = False,
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
        render_all=render_all,
    )

    known_slugs = {pr.route for pr in page_routes(context)}
    processed_files: list[Path] = []

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
        processed_files.append(md_file)
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

    if not dry_run:
        _commit_render_state(context, processed_files)

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
