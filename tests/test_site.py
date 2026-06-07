import unittest
from importlib.resources import files as pkg_files
from pathlib import Path
from tempfile import TemporaryDirectory

from wiki.config import WikiConfig
from wiki.site import (
    DEFAULT_HTML_TEMPLATE,
    build_index_html,
    build_page_html,
    build_site,
    render_wiki_markdown,
)

_FULL_TEST_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>{page_title}</title>
</head>
<body>
<h1 id="firstHeading">{page_title}</h1>
{infobox_html}
{page_content}
{toc_html}
{backlinks_html}
{categories_html}
</body>
</html>"""


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
            html = build_page_html(page, site, base_url="/wiki", url_style="dir", html_template=_FULL_TEST_TEMPLATE)
            self.assertIn('class="toc"', html)
            self.assertIn('href="#early-life"', html)
            self.assertIn('href="#firstHeading"', html)

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
            (wiki / "place.yml").write_text("type: Place\nname: Princeton\n", encoding="utf-8")
            (wiki / "index.md").write_text("# Home", encoding="utf-8")
            config = WikiConfig(input_dirs=[wiki], config_root=root)

            site = build_site(config)

            page_by_slug = {page.full_slug: page for page in site.pages}
            self.assertIn("person", page_by_slug)
            self.assertEqual(page_by_slug["person"].title, "Gregory House")
            self.assertIn("Gregory House", page_by_slug["person"].html + str(page_by_slug["person"].frontmatter))
            self.assertIn("place", page_by_slug)
            self.assertEqual(page_by_slug["place"].title, "Princeton")

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
softwareVersion: 1.2
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
            html = build_page_html(page, site, base_url="/wiki", url_style="dir", html_template=_FULL_TEST_TEMPLATE)

            self.assertEqual(page.template_name, "Person.html")
            self.assertIn('class="infobox page-meta"', html)
            self.assertIn('>Ethan Davidson</a>', html)
            self.assertIn('>Bella Davidson</a>', html)
            self.assertNotIn('>wiki:Ethan_Davidson</a>', html)
            self.assertNotIn('>wiki:Bella_Davidson</a>', html)
            self.assertIn('href="/wiki/Ethan_Davidson/"', html)
            self.assertIn('href="/wiki/Bella_Davidson/"', html)
            self.assertIn('href="https://example.com/gregory-davidson"', html)
            self.assertIn('<dt>softwareVersion</dt>', html)
            self.assertNotIn('<dt>Softwareversion</dt>', html)
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
            html = build_page_html(page, site, base_url="/wiki", url_style="dir", html_template=_FULL_TEST_TEMPLATE)

            self.assertEqual(page.template_name, "Thing.html")
            self.assertIn('class="infobox page-meta"', html)
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
            html = build_page_html(page, site, base_url="/wiki", url_style="dir", html_template=_FULL_TEST_TEMPLATE)

            self.assertEqual(page.template_name, "Person.html")
            self.assertIn('class="infobox page-meta"', html)
            self.assertNotIn("Wiki:Template", html)

    def test_render_adds_github_heading_ids_to_all_heading_levels(self) -> None:
        html = render_wiki_markdown("# Title\n\n### API: read/write?\n")

        self.assertIn('id="title"', html)
        self.assertIn('id="api-readwrite"', html)

    def test_render_highlights_fenced_code_with_known_language(self) -> None:
        html = render_wiki_markdown('```python\nprint("<hello>")\n```\n')

        self.assertIn('class="highlight"', html)
        self.assertIn('class="language-python"', html)
        self.assertIn("<span", html)
        self.assertIn("&lt;hello&gt;", html)

    def test_render_unknown_language_falls_back_to_plain_code(self) -> None:
        html = render_wiki_markdown("```not-a-real-language\n<tag>\n```\n")

        self.assertIn('class="language-not-a-real-language"', html)
        self.assertIn("&lt;tag&gt;", html)
        self.assertNotIn("<span", html)

    def test_render_unlabeled_fence_remains_plain_code(self) -> None:
        html = render_wiki_markdown("```\n<tag>\n```\n")

        self.assertIn("<pre><code>", html)
        self.assertIn("&lt;tag&gt;", html)
        self.assertNotIn('class="highlight"', html)

    def test_build_page_html_highlights_metadata_json(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            wiki = root / "wiki"
            wiki.mkdir()
            (wiki / "person.md").write_text(
                """---
type: schema:Person
name: Gregory Davidson
specialty: Diagnostics
---
# Gregory Davidson
""",
                encoding="utf-8",
            )
            config = WikiConfig(input_dirs=[wiki], config_root=root)

            site = build_site(config, base_url="/wiki", url_style="dir")
            page = next(page for page in site.pages if page.full_slug == "person")
            html_template = pkg_files("wiki").joinpath("templates/index.html").read_text(encoding="utf-8")
            html = build_page_html(page, site, base_url="/wiki", url_style="dir", html_template=html_template)

            self.assertIn("Metadata (JSON-LD)", html)
            self.assertIn('href="#view-metadata-content"', html)
            self.assertIn('metadata-mode-panel-expanded', html)
            self.assertIn('metadata-mode-panel-compacted', html)
            self.assertIn('value="expanded" checked="checked"', html)
            self.assertIn('class="language-json"', html)
            self.assertIn('class="highlight"', html)
            self.assertIn("<span", html)
            self.assertIn('&quot;@id&quot;', html)
            self.assertIn('&quot;@type&quot;', html)
            self.assertNotIn('&quot;type&quot;', html)
            self.assertLess(html.index('&quot;@id&quot;'), html.index('&quot;@type&quot;'))
            self.assertLess(html.index('&quot;@type&quot;'), html.index('&quot;https://schema.org/name&quot;'))
            self.assertIn('&quot;@context&quot;', html)
            self.assertIn('schema:Person', html)
            self.assertIn('schema:name', html)

    def test_obsidian_wikilinks_resolve_relative_to_current_file(self) -> None:
        html = render_wiki_markdown(
            "See [[../games/Pokemon_Diamond#Release History|history]].",
            base_url="/wiki",
            url_style="dir",
            current_route="people/Ethan_Davidson",
        )

        self.assertIn('href="/wiki/games/Pokemon_Diamond/#release-history"', html)
        self.assertIn('>history</a>', html)



    def test_markdown_links_normalize_to_canonical_page_urls(self) -> None:
        html = render_wiki_markdown(
            "See [game](../games/Pokemon_Diamond.md#Release%20History).",
            base_url="/wiki",
            url_style="dir",
            current_route="people/Ethan_Davidson",
        )

        self.assertIn('href="/wiki/games/Pokemon_Diamond/#release-history"', html)

    def test_fallback_index_uses_minimal_template(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            wiki = root / "wiki"
            wiki.mkdir()
            (wiki / "Alice.md").write_text("# Alice\n", encoding="utf-8")
            config = WikiConfig(input_dirs=[wiki], config_root=root)
            site = build_site(config)
            html = build_index_html(site)
            self.assertIn("<h1 id=\"firstHeading\">All Pages</h1>", html)
            self.assertIn("<ul>", html)
            self.assertIn("Alice", html)
            self.assertNotIn("<style>", html)
            self.assertNotIn("infobox page-meta", html)

    def test_fallback_article_uses_minimal_template(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            wiki = root / "wiki"
            wiki.mkdir()
            (wiki / "page.md").write_text("---\ntype: Article\n---\n\n# My Article\n\nContent.", encoding="utf-8")
            config = WikiConfig(input_dirs=[wiki], config_root=root)
            site = build_site(config)
            page = site.pages[0]
            html = build_page_html(page, site)
            self.assertIn("<h1 id=\"firstHeading\">My Article</h1>", html)
            self.assertIn("Content.", html)
            self.assertNotIn("<style>", html)
            self.assertNotIn("infobox page-meta", html)
            self.assertNotIn("Backlinks", html)
            self.assertNotIn("On this page", html)

    def test_fallback_has_page_kind(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            wiki = root / "wiki"
            wiki.mkdir()
            (wiki / "page.md").write_text("# Page\n", encoding="utf-8")
            config = WikiConfig(input_dirs=[wiki], config_root=root)
            site = build_site(config)
            index_html = build_index_html(site)
            self.assertIn("All Pages", index_html)
            page = site.pages[0]
            article_html = build_page_html(page, site)
            self.assertIn("Page", article_html)

    def test_build_index_html_respects_url_style(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            wiki = root / "wiki"
            wiki.mkdir()
            (wiki / "alice.md").write_text("# Alice\n", encoding="utf-8")
            (wiki / "bob.md").write_text("# Bob\n", encoding="utf-8")

            dir_config = WikiConfig(input_dirs=[wiki], config_root=root, url_style="dir")
            dir_site = build_site(dir_config)
            dir_index = build_index_html(dir_site, base_url="/wiki", url_style=dir_config.url_style)
            self.assertIn('href="/wiki/alice/"', dir_index)
            self.assertIn('href="/wiki/bob/"', dir_index)
            self.assertNotIn(".html", dir_index)

            file_config = WikiConfig(input_dirs=[wiki], config_root=root, url_style="file")
            file_site = build_site(file_config)
            file_index = build_index_html(file_site, base_url="/wiki", url_style=file_config.url_style)
            self.assertIn('href="/wiki/alice.html"', file_index)
            self.assertIn('href="/wiki/bob.html"', file_index)


if __name__ == "__main__":
    unittest.main()
