"""mdformat plugin: preserve Obsidian-style wikilinks during formatting.

The upstream ``mdformat-wikilink`` package registers its inline rule with
``mdit.inline.ruler.push``, which appends to the end of the ruler. The
standard ``link`` rule runs earlier and matches ``[text]`` first, so
``[[Wiki_CLI]]`` gets parsed as a link reference and rendered with escaped
brackets. This plugin fixes that by registering the rule *before* ``link``.
"""
from __future__ import annotations

import re
from collections.abc import Mapping

from markdown_it import MarkdownIt
from markdown_it.rules_inline import StateInline
from mdformat.renderer import RenderContext, RenderTreeNode
from mdformat.renderer.typing import Render

WIKILINK_PATTERN = re.compile(
    r"\[\[(?P<target>[^[|\]\n]+)(\|(?P<alias>[^\]\n]+))?]]"
)


def _wikilink_inline(state: StateInline, silent: bool) -> bool:
    match = WIKILINK_PATTERN.match(state.src[state.pos :])
    if not match:
        return False
    token = state.push("wikilink", "", 0)
    token.content = match.group()
    state.pos += match.end()
    return True


def update_mdit(mdit: MarkdownIt) -> None:
    mdit.inline.ruler.before("link", "wikilink", _wikilink_inline)


def _render_wikilink(node: RenderTreeNode, context: RenderContext) -> str:
    return node.content


RENDERERS: Mapping[str, Render] = {"wikilink": _render_wikilink}
