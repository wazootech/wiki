"""Tests for layout shell token substitution."""

from __future__ import annotations

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from wiki.config import Config
from wiki.site import build_index_html, build_site
from wiki.site.layout_context import build_layout_context
from wiki.site.layout_tokens import (
    load_packaged_layout_text,
    render_packaged_minimal,
    substitute,
    validate_shell_template,
)


class TestLayoutTokens(unittest.TestCase):
    def test_substitute_replaces_tokens(self) -> None:
        tokens = {"%wiki.page.title%": "Hello", "%wiki.base_url%": "/wiki"}
        html = substitute("<title>%wiki.page.title%</title><a href='%wiki.base_url%/'>", tokens)
        self.assertIn("<title>Hello</title>", html)
        self.assertIn("href='/wiki/'", html)

    def test_validate_shell_requires_head_and_body(self) -> None:
        with self.assertRaises(ValueError):
            validate_shell_template("<html>%wiki.head%</html>")

    def test_packaged_shell_matches_token_contract(self) -> None:
        shell = load_packaged_layout_text("shell.html")
        validate_shell_template(shell)
        self.assertIn("wikipedia.css", shell)

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
                url_style="dir",
                content="<ul></ul>",
                body_class="wiki-index",
                kind="index",
                layout_class="index",
            )
            html = render_packaged_minimal(context)
            self.assertIn('href="/wiki/assets/wikipedia.css"', html)
            self.assertIn("<title>All Pages - Wiki CLI</title>", html)
            self.assertNotIn("%wiki.", html)

    def test_shell_layout_injects_chrome(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            wiki = root / "wiki"
            wiki.mkdir()
            (wiki / "Page.md").write_text("# Page\n", encoding="utf-8")
            shell = load_packaged_layout_text("shell.html")
            (root / "layouts").mkdir()
            (root / "layouts" / "shell.html").write_text(shell, encoding="utf-8")
            config = Config(
                wiki={"inputs": [wiki]},
                site={"layout": "layouts/shell.html"},
                config_root=root,
            )
            site = build_site(config)
            html = build_index_html(site, root, default_layout=root / "layouts" / "shell.html")
            self.assertIn('id="mw-navigation"', html)
            self.assertIn('href="/wiki/assets/wikipedia.css"', html)


if __name__ == "__main__":
    unittest.main()
