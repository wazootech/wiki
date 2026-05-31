import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from wiki.config import WikiConfig
from wiki.site import build_site, render_wiki_markdown


class TestWikiSite(unittest.TestCase):
    def test_build_site_creates_one_page_per_markdown_file(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            wiki = root / "wiki"
            wiki.mkdir()
            (wiki / "Bob.md").write_text("# Bob\n\n## Early Life\n\nBorn.\n\n## Early Life\n\nAgain.", encoding="utf-8")
            config = WikiConfig(input_dirs=[wiki], config_root=root)

            site = build_site(config, base_url="/wiki", url_style="dir")

            self.assertEqual(len(site.pages), 1)
            page = site.pages[0]
            self.assertEqual(page.full_slug, "Bob")
            self.assertIn('id="bob"', page.html)
            self.assertIn('id="early-life"', page.html)
            self.assertIn('id="early-life-1"', page.html)
            self.assertEqual([item.slug for item in page.outline], ["early-life", "early-life-1"])

    def test_title_falls_back_to_humanized_route(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            wiki = root / "wiki"
            wiki.mkdir()
            (wiki / "Pokemon_Diamond_(copy_1).md").write_text("No heading.", encoding="utf-8")
            config = WikiConfig(input_dirs=[wiki], config_root=root)

            site = build_site(config)

            self.assertEqual(site.pages[0].title, "Pokemon Diamond (copy 1)")

    def test_render_adds_github_heading_ids_to_all_heading_levels(self) -> None:
        html = render_wiki_markdown("# Title\n\n### API: read/write?\n")

        self.assertIn('id="title"', html)
        self.assertIn('id="api-readwrite"', html)


if __name__ == "__main__":
    unittest.main()
