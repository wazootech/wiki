"""Markdown formatting helpers for wiki fmt (mdformat config + SPARQL shields)."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import mdformat
from mdformat._conf import DEFAULT_OPTS, read_toml_opts
import mdformat.plugins

DEFAULT_FMT_EXTENSIONS = ("wikilink", "frontmatter", "gfm")

SPARQL_REGION_RE = re.compile(
    r"<!--\s*sparql:start\s*-->.*?<!--\s*sparql:end\s*-->",
    re.DOTALL | re.IGNORECASE,
)
_SPARQL_PLACEHOLDER = "WIKI_FMT_SPARQL_BLOCK_{index}"


def _shield_sparql_blocks(text: str) -> tuple[str, list[str]]:
    blocks: list[str] = []

    def repl(match: re.Match[str]) -> str:
        blocks.append(match.group(0))
        return f"\n\n<!-- {_SPARQL_PLACEHOLDER.format(index=len(blocks) - 1)} -->\n\n"

    return SPARQL_REGION_RE.sub(repl, text), blocks


def _restore_sparql_blocks(text: str, blocks: list[str]) -> str:
    for index, block in enumerate(blocks):
        placeholder = f"<!-- {_SPARQL_PLACEHOLDER.format(index=index)} -->"
        text = text.replace(placeholder, block, 1)
    return text


def _mdformat_options(file_path: Path) -> tuple[dict[str, Any], tuple[str, ...]]:
    toml_opts, _ = read_toml_opts(file_path.parent)
    opts: dict[str, Any] = {**DEFAULT_OPTS, **toml_opts}
    if opts.get("extensions") is None:
        return opts, DEFAULT_FMT_EXTENSIONS
    return opts, tuple(opts["extensions"])


def format_markdown(original: str, file_path: Path) -> str:
    """Format markdown, honoring .mdformat.toml and preserving SPARQL render blocks."""
    shielded, blocks = _shield_sparql_blocks(original)
    opts, extensions = _mdformat_options(file_path)
    try:
        enabled_parserplugins = {
            name: mdformat.plugins.PARSER_EXTENSIONS[name] for name in extensions
        }
    except KeyError as exc:
        raise ValueError(
            f"The required {exc.args[0]!r} mdformat extension is not installed."
        ) from exc
    formatted = mdformat.text(
        shielded,
        options=opts,
        extensions=enabled_parserplugins,
        _filename=str(file_path),
    )
    return _restore_sparql_blocks(formatted, blocks)
