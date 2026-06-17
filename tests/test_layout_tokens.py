"""Tests for layout slot substitution."""

from __future__ import annotations

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from wiki.config import Config
from wiki.site import build_site
from wiki.site.layout_context import build_layout_context
from wiki.site.layout_tokens import (
    load_packaged_layout_text,
    render_packaged_minimal,
    substitute,
)


class TestLayoutTokens(unittest.TestCase):
    def test_substitute_replaces_tokens(self) -> None:
        tokens = {"%wiki.head%": "<title>Hello</title>", "%wiki.base_url%": "/wiki"}
        html = substitute("%wiki.head%<a href='%wiki.base_url%/'>", tokens)
        self.assertIn("<title>Hello</title>", html)
        self.assertIn("href='/wiki/'", html)

    def test_packaged_index_is_full_page(self) -> None:
        layout = load_packaged_layout_text("index.html")
        self.assertIn("<!DOCTYPE html>", layout)
        self.assertIn("%wiki.head%", layout)
        self.assertIn("%wiki.body%", layout)
        self.assertNotIn("mw-navigation", layout)

    def test_minimal_fallback_renders_linked_css(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            wiki = root / "wiki"
            wiki.mkdir()
            (wiki / "Page.md").write_text("# Page\n", encoding="utf-8")
            config = Config(wiki={"inputs": [wiki]}, config_root=root)
            site = build_site(config)
            context = build_layout_context(
                site=site,
                base_url="/wiki",
                content="<ul></ul>",
            )
            html = render_packaged_minimal(context)
            self.assertIn("<title>All Pages - Wiki CLI</title>", html)
            self.assertNotIn("%wiki.", html)

if __name__ == "__main__":
    unittest.main()
