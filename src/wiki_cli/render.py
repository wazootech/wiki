"""Dynamic SPARQL block rendering and wikilink-to-HTML conversion."""

from __future__ import annotations

import re
from typing import Any

import click
from markdown_it import MarkdownIt

from .format import run_query
from mdit_py_plugins.wikilink import wikilink_plugin

# Matches the starting comment, query inside, and ending comment block with SPARQL inside
SPARQL_BLOCK_REGEX = re.compile(
    r"<!--\s*sparql:start\s*-->\s*```sparql\s*(.*?)\s*```\s*(.*?)\s*<!--\s*sparql:end\s*-->",
    re.DOTALL | re.IGNORECASE
)


def render_markdown_files(context: Any, graph: Any) -> tuple[int, int]:
    """Iterate over all markdown files, parse and replace dynamic SPARQL sections inline.

    Returns (success_count, error_count).
    """
    success_count = 0
    error_count = 0

    for input_dir in context.input_dirs:
        if not input_dir.exists():
            continue
        for md_file in input_dir.glob("*.md"):
            content = md_file.read_text(encoding="utf-8")
            modified = False
            file_errors = 0

            def replacer(match: re.Match) -> str:
                nonlocal modified, file_errors
                query = match.group(1).strip()
                try:
                    rendered_markdown = run_query(graph, query, output_format="markdown", wiki_base=context.wiki_base)
                    modified = True
                    return f"<!-- sparql:start -->\n```sparql\n{query}\n```\n\n{rendered_markdown}\n<!-- sparql:end -->"
                except Exception as e:
                    click.echo(f"Error rendering query in {md_file.name}: {e}", err=True)
                    file_errors += 1
                    return str(match.group(0))

            new_content = SPARQL_BLOCK_REGEX.sub(replacer, content)
            if modified and new_content != content:
                md_file.write_text(new_content, encoding="utf-8")
                success_count += 1
            error_count += file_errors

    return (success_count, error_count)


def render_markdown(text: str) -> str:
    """Render wikilinks in *text* to HTML anchor tags, leaving all other markdown intact."""
    md = MarkdownIt("gfm-like", {"linkify": False})
    md.use(wikilink_plugin)
    return md.render(text)
