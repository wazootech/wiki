"""Dynamic SPARQL block rendering in markdown files."""

from __future__ import annotations

import re
from typing import Any

import click

from .format import run_query

# Matches the starting comment, query inside, and ending comment block with SPARQL inside
SPARQL_BLOCK_REGEX = re.compile(
    r"<!--\s*sparql:start\s*-->\s*```sparql\s*(.*?)\s*```\s*(.*?)\s*<!--\s*sparql:end\s*-->",
    re.DOTALL | re.IGNORECASE
)


def render_markdown_files(context: Any, graph: Any) -> int:
    """Iterate over all markdown files, parse and replace dynamic SPARQL sections inline."""
    count = 0
    if not context.wiki_dir.exists():
        return 0

    for md_file in context.wiki_dir.glob("*.md"):
        content = md_file.read_text(encoding="utf-8")
        modified = False

        def replacer(match: re.Match) -> str:
            nonlocal modified
            query = match.group(1).strip()
            try:
                rendered_markdown = run_query(graph, query, output_format="markdown", wiki_base=context.wiki_base)
                modified = True
                return f"<!-- sparql:start -->\n```sparql\n{query}\n```\n\n{rendered_markdown}\n<!-- sparql:end -->"
            except Exception as e:
                click.echo(f"Error rendering query in {md_file.name}: {e}", err=True)
                return str(match.group(0))

        new_content = SPARQL_BLOCK_REGEX.sub(replacer, content)
        if modified and new_content != content:
            md_file.write_text(new_content, encoding="utf-8")
            count += 1

    return count
