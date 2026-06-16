"""Layout slot and context contract tests (#106 alignment)."""

from __future__ import annotations

import re
import unittest
from pathlib import Path
from typing import Any

from markupsafe import Markup

from wiki.init_scaffold import load_packaged_official_layout
from wiki.schemas.layout import LAYOUT_MARKUP_PATHS, LayoutContext
from wiki.schemas.site import VirtualPage, WikiSite
from wiki.site.layout_context import build_layout_context
from wiki.site.layout_tokens import (
    build_layout_token_map,
    build_token_map,
    unknown_tokens,
)

_TOKEN_PATTERN = re.compile(r"%wiki\.[a-z0-9_.]+%", re.IGNORECASE)

_FORBIDDEN_TOP_LEVEL_KEYS = frozenset(
    {
        "page_title",
        "site_manifest_name",
        "site_manifest_theme_color",
        "manifest_json",
    }
)

# Token spellings → context leaf paths (%wiki.head% is synthesized; not a context leaf).
_TOKEN_CONTEXT_PATHS: dict[str, tuple[str, ...]] = {
    "%wiki.base_url%": ("site", "base_url"),
    "%wiki.assets%": ("site", "base_url"),
    "%wiki.site.url_style%": ("site", "url_style"),
    "%wiki.page.title%": ("page", "title"),
    "%wiki.page.content%": ("page", "content"),
    "%wiki.page.source%": ("page", "source"),
    "%wiki.page.body_class%": ("page", "body_class"),
    "%wiki.page.kind%": ("page", "kind"),
    "%wiki.page.type_label%": ("page", "type_label"),
    "%wiki.page.layout.class%": ("page", "layout", "class"),
    "%wiki.page.layout.label%": ("page", "layout", "label"),
    "%wiki.nav.infobox%": ("page", "nav", "infobox"),
    "%wiki.nav.toc%": ("page", "nav", "toc"),
    "%wiki.nav.backlinks%": ("page", "nav", "backlinks"),
    "%wiki.nav.categories%": ("page", "nav", "categories"),
    "%wiki.nav.sidebar%": ("page", "nav", "sidebar"),
    "%wiki.page.metadata.tool%": ("page", "metadata", "tool"),
    "%wiki.page.metadata.tab%": ("page", "metadata", "tab"),
    "%wiki.page.metadata.pane%": ("page", "metadata", "pane"),
    "%wiki.wiki.pages_json%": ("wiki", "pages_json"),
    "%wiki.page.slug_json%": ("page", "slug_json"),
}


def _sample_context() -> dict[str, Any]:
    site = WikiSite(
        pages=[
            VirtualPage(
                file_slug="Sample",
                title="Sample",
                markdown="# Sample",
                html="<h1>Sample</h1>",
                frontmatter={},
            )
        ]
    )
    return build_layout_context(
        site=site,
        base_url="/wiki",
        url_style="dir",
        page=site.pages[0],
        content="<p>Body</p>",
        body_class="wiki-page",
        kind="article",
        slug="Sample",
        layout_label="<span>custom</span>",
        type_label="<span>Article</span>",
        nav_infobox="<div>infobox</div>",
        nav_toc="<nav>toc</nav>",
        nav_backlinks="<ul>back</ul>",
        nav_categories="<ul>cat</ul>",
        nav_sidebar="<aside>side</aside>",
        metadata_tool="<div>tool</div>",
        metadata_tab="<div>tab</div>",
        metadata_pane="<div>pane</div>",
    )


def _key_tree(value: Any) -> object:
    if isinstance(value, dict):
        return {key: _key_tree(child) for key, child in sorted(value.items())}
    return None


def _context_leaf(context: dict[str, Any], path: tuple[str, ...]) -> Any:
    node: Any = context
    for key in path:
        node = node[key]
    return node


class TestLayoutContract(unittest.TestCase):
    def test_packaged_wikipedia_tokens_are_known(self) -> None:
        template = load_packaged_official_layout("wikipedia")
        tokens = build_layout_token_map(_sample_context())
        unknown = unknown_tokens(template, tokens)
        self.assertEqual(unknown, [], msg=f"Unknown layout slots: {unknown}")

    def test_docs_wikipedia_layout_slots_are_known(self) -> None:
        docs_layout = Path(__file__).resolve().parents[1] / "docs" / "layouts" / "wikipedia.html"
        if not docs_layout.is_file():
            self.skipTest("docs layout not present")
        template = docs_layout.read_text(encoding="utf-8")
        tokens = build_layout_token_map(_sample_context())
        found = sorted(set(_TOKEN_PATTERN.findall(template)))
        missing = [token for token in found if token not in tokens]
        self.assertEqual(missing, [])

    def test_context_key_tree_matches_layout_model(self) -> None:
        context = _sample_context()
        expected = _key_tree(
            LayoutContext.model_validate(_unwrap_markup(context)).model_dump(by_alias=True)
        )
        actual = _key_tree(context)
        self.assertEqual(actual, expected)

    def test_forbidden_legacy_keys_absent(self) -> None:
        context = _sample_context()
        site = context.get("site", {})
        self.assertNotIn("manifest", site)
        self.assertNotIn("inline_css", site)
        for key in _FORBIDDEN_TOP_LEVEL_KEYS:
            self.assertNotIn(key, context)

    def test_markup_paths_shared_registry(self) -> None:
        from wiki.site import layout_context as layout_context_module
        from wiki.site import layout_tokens as layout_tokens_module

        self.assertIs(layout_context_module.LAYOUT_CONTEXT_MARKUP_PATHS, LAYOUT_MARKUP_PATHS)
        self.assertEqual(len(LAYOUT_MARKUP_PATHS), 12)

        for path in LAYOUT_MARKUP_PATHS:
            context = _sample_context()
            value = _context_leaf(context, path)
            self.assertIsInstance(value, Markup, msg=f"expected Markup at {path}")
            formatted = layout_tokens_module._format_leaf(value, path=path)
            self.assertEqual(formatted, str(value), msg=f"markup path should pass through at {path}")

    def test_token_map_covers_documented_context_paths(self) -> None:
        context = _sample_context()
        tokens = build_token_map(context)
        for token, path in _TOKEN_CONTEXT_PATHS.items():
            self.assertIn(token, tokens)
            _context_leaf(context, path)
        self.assertIn("%wiki.head%", tokens)


def _unwrap_markup(context: dict[str, Any]) -> dict[str, Any]:
    """Convert Markup leaves to plain strings for Pydantic validation."""
    if isinstance(context, Markup):
        return str(context)
    if not isinstance(context, dict):
        return context
    return {key: _unwrap_markup(value) for key, value in context.items()}


if __name__ == "__main__":
    unittest.main()
