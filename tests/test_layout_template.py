"""Tests for Jinja page layout rendering helpers."""

from __future__ import annotations

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from wiki.site.layout_template import layout_file_is_valid, layout_stem


class TestLayoutTemplate(unittest.TestCase):
    def test_layout_stem_html_j2(self) -> None:
        self.assertEqual(layout_stem(Path("layouts/default.html.j2")), "default")
        self.assertEqual(layout_stem(Path("custom.html.j2")), "custom")

    def test_layout_file_is_valid_rejects_plain_html(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            plain = root / "layouts" / "legacy.html"
            plain.parent.mkdir(parents=True)
            plain.write_text("<html></html>", encoding="utf-8")
            self.assertFalse(layout_file_is_valid(plain, root))

    def test_layout_file_is_valid_accepts_html_j2(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            layout = root / "layouts" / "default.html.j2"
            layout.parent.mkdir(parents=True)
            layout.write_text("<html>{{ page.title }}</html>", encoding="utf-8")
            self.assertTrue(layout_file_is_valid(layout, root))


if __name__ == "__main__":
    unittest.main()
