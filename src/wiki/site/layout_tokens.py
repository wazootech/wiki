"""Token substitution for wiki page layout templates."""

from __future__ import annotations

import html as html_module
import re
from functools import lru_cache
from importlib.resources import files
from typing import Any

from markupsafe import Markup

from ..schemas.layout import LAYOUT_MARKUP_PATHS, LAYOUT_RAW_JSON_PATHS

PACKAGED_MINIMAL_LAYOUT = "index.html"

_TOKEN_PATTERN = re.compile(r"%wiki\.[a-z0-9_.]+%", re.IGNORECASE)

_RAW_JSON_LEAVES = LAYOUT_RAW_JSON_PATHS

# Token spellings -> context leaf paths. %wiki.head% is synthesized per page.
LAYOUT_TOKEN_CONTEXT_PATHS: dict[str, tuple[str, ...]] = {
    "%wiki.base_url%": ("site", "base_url"),
    "%wiki.body%": ("body",),
}


def _context_leaf(context: dict[str, Any], path: tuple[str, ...]) -> Any:
    node: Any = context
    for key in path:
        node = node[key]
    return node


def _format_leaf(value: Any, *, path: tuple[str, ...]) -> str:
    if value is None or value == "":
        return ""
    if path in _RAW_JSON_LEAVES:
        return str(value)
    if path in LAYOUT_MARKUP_PATHS or isinstance(value, Markup):
        return str(value)
    return html_module.escape(str(value))


def build_head_markup(context: dict[str, Any]) -> str:
    title = _context_leaf(context, ("page", "title"))
    safe_title = html_module.escape(str(title))
    return f"<title>{safe_title} - Wiki CLI</title>"


def build_layout_token_map(context: dict[str, Any]) -> dict[str, str]:
    """Public alias for layout slot contract boundary."""
    return build_token_map(context)


def build_token_map(context: dict[str, Any]) -> dict[str, str]:
    """Flatten layout context into %wiki.*% replacement strings."""
    tokens = {
        token: _format_leaf(_context_leaf(context, path), path=path)
        for token, path in LAYOUT_TOKEN_CONTEXT_PATHS.items()
    }
    tokens["%wiki.head%"] = build_head_markup(context)
    return tokens


@lru_cache(maxsize=8)
def load_packaged_layout_text(name: str) -> str:
    return files("wiki").joinpath(name).read_text(encoding="utf-8")


def substitute(template: str, tokens: dict[str, str]) -> str:
    """Replace %wiki.*% tokens in template text (longest keys first)."""
    if not tokens:
        return template
    ordered = sorted(tokens.items(), key=lambda item: len(item[0]), reverse=True)
    result = template
    for token, value in ordered:
        result = result.replace(token, value)
    return result


def unknown_tokens(template: str, tokens: dict[str, str]) -> list[str]:
    found = _TOKEN_PATTERN.findall(template)
    known = set(tokens.keys())
    return sorted({token for token in found if token not in known})


def render_layout(template: str, context: dict[str, Any]) -> str:
    """Substitute %wiki.*% tokens in a full-page layout template."""
    tokens = build_token_map(context)
    return substitute(template, tokens)


def render_packaged_minimal(context: dict[str, Any]) -> str:
    """Packaged index.html when site.layout is unset."""
    template = load_packaged_layout_text(PACKAGED_MINIMAL_LAYOUT)
    return render_layout(template, context)
