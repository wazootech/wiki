"""Tests for token page layout rendering helpers."""

from __future__ import annotations

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from wiki.site.layout_template import layout_file_is_valid, layout_stem


class TestLayoutTemplate(unittest.TestCase):
    def test_layout_stem_html(self) -> None:
        self.assertEqual(layout_stem(Path("layouts/default.html")), "default")
        self.assertEqual(layout_stem(Path("custom.html")), "custom")
        self.assertEqual(layout_stem(Path("layouts/index.html")), "index")

    def test_layout_file_is_valid_accepts_html_layout(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            layout = root / "layouts" / "default.html"
            layout.parent.mkdir(parents=True)
            layout.write_text("<html>%wiki.page.title%</html>", encoding="utf-8")
            self.assertTrue(layout_file_is_valid(layout, root))


if __name__ == "__main__":
    unittest.main()
