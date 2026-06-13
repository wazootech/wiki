"""Tests for nested layout template context."""

from __future__ import annotations

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from markupsafe import Markup

from wiki.config import Config
from wiki.site import build_site
from wiki.site.layout_context import (
    LAYOUT_CONTEXT_MARKUP_PATHS,
    build_layout_context,
    build_layout_manifest,
)
from wiki.site.manifest import DEFAULT_THEME_COLOR


class TestLayoutContext(unittest.TestCase):
    def test_index_context_shape(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            wiki = root / "wiki"
            wiki.mkdir()
            (wiki / "page.md").write_text("# Page\n", encoding="utf-8")
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

            self.assertIn("site", context)
            self.assertIn("page", context)
            self.assertIn("wiki", context)
            self.assertEqual(context["site"]["base_url"], "/wiki")
            self.assertEqual(context["page"]["title"], "All Pages")
            self.assertEqual(context["page"]["kind"], "index")
            self.assertIsInstance(context["site"]["inline_css"], Markup)
            self.assertIsInstance(context["site"]["manifest"]["json"], Markup)
            self.assertIsInstance(context["wiki"]["pages_json"], Markup)

    def test_article_context_includes_slug(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            wiki = root / "wiki"
            wiki.mkdir()
            (wiki / "Bob.md").write_text("# Bob\n", encoding="utf-8")
            config = Config(wiki={"inputs": [wiki]}, config_root=root)
            site = build_site(config)
            page = site.pages[0]

            context = build_layout_context(
                site=site,
                base_url="/wiki",
                url_style="dir",
                page=page,
                content=page.html,
                body_class="wiki-page layout-default",
                kind="article",
                slug=page.full_slug,
                layout_class="default",
            )

            self.assertEqual(context["page"]["title"], "Bob")
            self.assertEqual(context["page"]["slug"], "Bob")
            self.assertIn("Bob", context["page"]["slug_json"])

    def test_manifest_theme_color_fallback(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            wiki = root / "wiki"
            wiki.mkdir()
            (wiki / "page.md").write_text("# Page\n", encoding="utf-8")
            config = Config(wiki={"inputs": [wiki]}, config_root=root)
            site = build_site(config)

            manifest = build_layout_manifest(site=site, base_url="/wiki")
            self.assertEqual(manifest["theme_color"], DEFAULT_THEME_COLOR)

    def test_manifest_respects_config_theme_color(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            wiki = root / "wiki"
            wiki.mkdir()
            (wiki / "page.md").write_text("# Page\n", encoding="utf-8")
            config = Config(
                wiki={"inputs": [wiki]},
                site={"manifest": {"name": "Acme", "theme_color": "#6366f1"}},
                config_root=root,
            )
            site = build_site(config)

            manifest = build_layout_manifest(site=site, base_url="/wiki")
            self.assertEqual(manifest["name"], "Acme")
            self.assertEqual(manifest["theme_color"], "#6366f1")
            self.assertEqual(manifest["url"], "/wiki/manifest.webmanifest")

    def test_markup_paths_registered(self) -> None:
        self.assertIn(("page", "content"), LAYOUT_CONTEXT_MARKUP_PATHS)
        self.assertIn(("site", "manifest", "json"), LAYOUT_CONTEXT_MARKUP_PATHS)


if __name__ == "__main__":
    unittest.main()
