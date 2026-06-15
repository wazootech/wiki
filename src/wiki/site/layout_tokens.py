"""Token substitution for wiki page layout templates."""

from __future__ import annotations

import html as html_module
import re
from functools import lru_cache
from importlib.resources import files
from typing import Any

from markupsafe import Markup

PACKAGED_MINIMAL_LAYOUT = "index.html"
PACKAGED_WIKIPEDIA_LAYOUT = "wikipedia.html"

_TOKEN_PATTERN = re.compile(r"%wiki\.[a-z0-9_.]+%", re.IGNORECASE)

# Context leaf paths: True = inject as Markup/raw HTML, False = HTML-escape text.
_MARKUP_LEAVES: frozenset[tuple[str, ...]] = frozenset(
    {
        ("page", "content"),
        ("page", "layout", "label"),
        ("page", "type_label"),
        ("page", "nav", "infobox"),
        ("page", "nav", "toc"),
        ("page", "nav", "backlinks"),
        ("page", "nav", "categories"),
        ("page", "nav", "sidebar"),
        ("page", "metadata", "tool"),
        ("page", "metadata", "tab"),
        ("page", "metadata", "pane"),
        ("wiki", "pages_json"),
    }
)

_RAW_JSON_LEAVES: frozenset[tuple[str, ...]] = frozenset(
    {
        ("wiki", "pages_json"),
        ("page", "slug_json"),
    }
)


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
    if path in _MARKUP_LEAVES or isinstance(value, Markup):
        return str(value)
    return html_module.escape(str(value))


def build_head_markup(context: dict[str, Any]) -> str:
    title = _context_leaf(context, ("page", "title"))
    safe_title = html_module.escape(str(title))
    return f"<title>{safe_title} - Wiki CLI</title>"


def build_token_map(context: dict[str, Any]) -> dict[str, str]:
    """Flatten layout context into %wiki.*% replacement strings."""
    site = context["site"]
    page = context["page"]
    wiki = context["wiki"]
    nav = page["nav"]
    metadata = page["metadata"]
    layout = page["layout"]

    return {
        "%wiki.base_url%": _format_leaf(site["base_url"], path=("site", "base_url")),
        "%wiki.assets%": _format_leaf(site["base_url"], path=("site", "base_url")),
        "%wiki.site.url_style%": _format_leaf(site["url_style"], path=("site", "url_style")),
        "%wiki.page.title%": _format_leaf(page["title"], path=("page", "title")),
        "%wiki.page.content%": _format_leaf(page["content"], path=("page", "content")),
        "%wiki.page.source%": _format_leaf(page["source"], path=("page", "source")),
        "%wiki.page.body_class%": _format_leaf(page["body_class"], path=("page", "body_class")),
        "%wiki.page.kind%": _format_leaf(page["kind"], path=("page", "kind")),
        "%wiki.page.type_label%": _format_leaf(page["type_label"], path=("page", "type_label")),
        "%wiki.page.layout.class%": _format_leaf(layout["class"], path=("page", "layout", "class")),
        "%wiki.page.layout.label%": _format_leaf(layout["label"], path=("page", "layout", "label")),
        "%wiki.nav.infobox%": _format_leaf(nav["infobox"], path=("page", "nav", "infobox")),
        "%wiki.nav.toc%": _format_leaf(nav["toc"], path=("page", "nav", "toc")),
        "%wiki.nav.backlinks%": _format_leaf(nav["backlinks"], path=("page", "nav", "backlinks")),
        "%wiki.nav.categories%": _format_leaf(nav["categories"], path=("page", "nav", "categories")),
        "%wiki.nav.sidebar%": _format_leaf(nav["sidebar"], path=("page", "nav", "sidebar")),
        "%wiki.page.metadata.tool%": _format_leaf(metadata["tool"], path=("page", "metadata", "tool")),
        "%wiki.page.metadata.tab%": _format_leaf(metadata["tab"], path=("page", "metadata", "tab")),
        "%wiki.page.metadata.pane%": _format_leaf(metadata["pane"], path=("page", "metadata", "pane")),
        "%wiki.wiki.pages_json%": _format_leaf(wiki["pages_json"], path=("wiki", "pages_json")),
        "%wiki.page.slug_json%": _format_leaf(page["slug_json"], path=("page", "slug_json")),
        "%wiki.head%": build_head_markup(context),
    }


@lru_cache(maxsize=8)
def load_packaged_layout_text(name: str) -> str:
    return files("wiki").joinpath(f"layouts/{name}").read_text(encoding="utf-8")


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
