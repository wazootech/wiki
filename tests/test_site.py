import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from wiki.config import WikiConfig
from wiki.site import build_page_html, build_site, render_wiki_markdown


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

    def test_build_site_creates_pages_for_data_documents(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            wiki = root / "wiki"
            wiki.mkdir()
            (wiki / "person.yaml").write_text("type: Person\nname: Gregory House\n", encoding="utf-8")
            (wiki / "index.md").write_text("# Home", encoding="utf-8")
            config = WikiConfig(input_dirs=[wiki], config_root=root)

            site = build_site(config)

            page_by_slug = {page.full_slug: page for page in site.pages}
            self.assertIn("person", page_by_slug)
            self.assertEqual(page_by_slug["person"].title, "Gregory House")
            self.assertIn("Gregory House", page_by_slug["person"].html + str(page_by_slug["person"].frontmatter))

    def test_build_page_html_uses_person_template_and_clickable_infobox_links(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            wiki = root / "wiki"
            wiki.mkdir()
            (wiki / "Gregory_Davidson.yaml").write_text(
                """id: wiki:Gregory_Davidson
type: schema:Person
name: Gregory Davidson
knows: wiki:Ethan_Davidson
owns: wiki:Bella_Davidson
url: https://example.com/gregory-davidson
""",
                encoding="utf-8",
            )
            (wiki / "Ethan_Davidson.yaml").write_text(
                """id: wiki:Ethan_Davidson
type: schema:Person
name: Ethan Davidson
""",
                encoding="utf-8",
            )
            (wiki / "Bella_Davidson.yaml").write_text(
                """id: wiki:Bella_Davidson
type: schema:Thing
name: Bella Davidson
""",
                encoding="utf-8",
            )
            config = WikiConfig(input_dirs=[wiki], config_root=root)

            site = build_site(config, base_url="/wiki", url_style="dir")
            page = next(page for page in site.pages if page.full_slug == "Gregory_Davidson")
            html = build_page_html(page, site, base_url="/wiki", url_style="dir")

            self.assertEqual(page.template_name, "Person.html")
            self.assertIn('class="page-shell template-person"', html)
            self.assertIn('>Ethan Davidson</a>', html)
            self.assertIn('>Bella Davidson</a>', html)
            self.assertNotIn('>wiki:Ethan_Davidson</a>', html)
            self.assertNotIn('>wiki:Bella_Davidson</a>', html)
            self.assertIn('href="/wiki/Ethan_Davidson/"', html)
            self.assertIn('href="/wiki/Bella_Davidson/"', html)
            self.assertIn('href="https://example.com/gregory-davidson"', html)
            self.assertIn("Infobox", html)

    def test_template_frontmatter_override_is_applied(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            wiki = root / "wiki"
            wiki.mkdir()
            (wiki / "project.md").write_text(
                """---
type: schema:CreativeWork
template: Thing.html
name: Project Atlas
related:
  - wiki:Project_Atlas
---
# Project Atlas
""",
                encoding="utf-8",
            )
            (wiki / "Project_Atlas.yaml").write_text(
                """id: wiki:Project_Atlas
type: schema:CreativeWork
name: Project Atlas Record
""",
                encoding="utf-8",
            )
            config = WikiConfig(input_dirs=[wiki], config_root=root)

            site = build_site(config, base_url="/wiki", url_style="dir")
            page = next(page for page in site.pages if page.full_slug == "project")
            html = build_page_html(page, site, base_url="/wiki", url_style="dir")

            self.assertEqual(page.template_name, "Thing.html")
            self.assertIn('class="page-shell template-thing"', html)
            self.assertIn('href="/wiki/Project_Atlas/"', html)

    def test_wiki_template_frontmatter_override_takes_precedence(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            wiki = root / "wiki"
            wiki.mkdir()
            (wiki / "project.md").write_text(
                """---
type: schema:CreativeWork
template: default.html
wiki:template: Person.html
name: Project Atlas
---
# Project Atlas
""",
                encoding="utf-8",
            )
            config = WikiConfig(input_dirs=[wiki], config_root=root)

            site = build_site(config, base_url="/wiki", url_style="dir")
            page = next(page for page in site.pages if page.full_slug == "project")
            html = build_page_html(page, site, base_url="/wiki", url_style="dir")

            self.assertEqual(page.template_name, "Person.html")
            self.assertIn('class="page-shell template-person"', html)
            self.assertNotIn("Wiki:Template", html)

    def test_render_adds_github_heading_ids_to_all_heading_levels(self) -> None:
        html = render_wiki_markdown("# Title\n\n### API: read/write?\n")

        self.assertIn('id="title"', html)
        self.assertIn('id="api-readwrite"', html)

    def test_obsidian_wikilinks_resolve_relative_to_current_file(self) -> None:
        html = render_wiki_markdown(
            "See [[../games/Pokemon_Diamond#Release History|history]].",
            base_url="/wiki",
            url_style="dir",
            markdown_flavor="obsidian",
            current_route="people/Ethan_Davidson",
        )

        self.assertIn('href="/wiki/games/Pokemon_Diamond/#release-history"', html)
        self.assertIn('>history</a>', html)

    def test_gfm_leaves_wikilinks_literal(self) -> None:
        html = render_wiki_markdown(
            "See [[Pokemon_Diamond]].",
            markdown_flavor="gfm",
            current_route="people/Ethan_Davidson",
        )

        self.assertIn("[[Pokemon_Diamond]]", html)
        self.assertNotIn('class="wikilink"', html)

    def test_markdown_links_normalize_to_canonical_page_urls(self) -> None:
        html = render_wiki_markdown(
            "See [game](../games/Pokemon_Diamond.md#Release%20History).",
            base_url="/wiki",
            url_style="dir",
            markdown_flavor="gfm",
            current_route="people/Ethan_Davidson",
        )

        self.assertIn('href="/wiki/games/Pokemon_Diamond/#release-history"', html)


if __name__ == "__main__":
    unittest.main()
