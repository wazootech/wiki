"""Wikilink inline rule for markdown-it-py.

Converts [[slug]] and [[slug|display]] into HTML anchor tags.
"""

from __future__ import annotations

from typing import Any

from markdown_it import MarkdownIt
from markdown_it.rules_inline import StateInline


def wikilink_plugin(md: MarkdownIt) -> None:
    """Register the wikilink inline rule and its HTML renderer."""

    def _wikilink_rule(state: StateInline, silent: bool) -> bool:
        src = state.src
        pos = state.pos

        if src[pos : pos + 2] != "[[":
            return False

        end = src.find("]]", pos + 2)
        if end == -1:
            return False

        if silent:
            return True

        content = src[pos + 2 : end]
        if "|" in content:
            slug, display = content.split("|", 1)
        else:
            slug = content
            display = content

        token = state.push("wikilink", "a", 0)
        token.attrs = {"href": slug}
        token.content = display
        state.pos = end + 2
        return True

    md.inline.ruler.push("wikilink", _wikilink_rule)

    def _render_wikilink(self: Any, tokens: Any, idx: int, options: Any, env: Any) -> str:
        token = tokens[idx]
        href = token.attrs.get("href", "")
        content = token.content
        return f'<a href="{href}">{content}</a>'

    md.add_render_rule("wikilink", _render_wikilink)
