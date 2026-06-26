"""Layout slot and context contract tests (#106 alignment)."""

from __future__ import annotations

import re
import unittest
from typing import Any

from markupsafe import Markup

from wiki.init_scaffold import load_packaged_official_layout
from wiki.schemas.layout import LAYOUT_MARKUP_PATHS, LayoutContext
from wiki.schemas.site import VirtualPage, WikiSite
from wiki.site.layout_context import build_layout_context
from wiki.site.layout_tokens import (
    LAYOUT_TOKEN_CONTEXT_PATHS,
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
        base_url="/wiki",
        page=site.pages[0],
        content="<p>Body</p>",
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
    def test_packaged_minimal_tokens_are_known(self) -> None:
        template = load_packaged_official_layout("minimal")
        tokens = build_layout_token_map(_sample_context())
        unknown = unknown_tokens(template, tokens)
        self.assertEqual(unknown, [], msg=f"Unknown layout slots: {unknown}")

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
        self.assertEqual(len(LAYOUT_MARKUP_PATHS), 1)

        for path in LAYOUT_MARKUP_PATHS:
            context = _sample_context()
            value = _context_leaf(context, path)
            self.assertIsInstance(value, Markup, msg=f"expected Markup at {path}")
            formatted = layout_tokens_module._format_leaf(value, path=path)
            self.assertEqual(formatted, str(value), msg=f"markup path should pass through at {path}")

    def test_token_map_covers_documented_context_paths(self) -> None:
        context = _sample_context()
        tokens = build_token_map(context)
        for token, path in LAYOUT_TOKEN_CONTEXT_PATHS.items():
            self.assertIn(token, tokens)
            _context_leaf(context, path)
        self.assertIn("%wiki.head%", tokens)
        self.assertEqual(set(tokens), {"%wiki.head%", "%wiki.base_url%", "%wiki.body%"})

    def test_old_page_content_slot_is_unknown(self) -> None:
        tokens = build_token_map(_sample_context())
        self.assertEqual(unknown_tokens("%wiki.page.content%", tokens), ["%wiki.page.content%"])


def _unwrap_markup(context: dict[str, Any]) -> dict[str, Any]:
    """Convert Markup leaves to plain strings for Pydantic validation."""
    if isinstance(context, Markup):
        return str(context)
    if not isinstance(context, dict):
        return context
    return {key: _unwrap_markup(value) for key, value in context.items()}


if __name__ == "__main__":
    unittest.main()
