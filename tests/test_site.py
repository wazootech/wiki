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
    render_copyable_pre,
    render_outline_title,
    render_wiki_markdown,
    strip_leading_title_heading,
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
            self.assertNotIn('id="bob"', page.html)
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
            (wiki / "person.yaml").write_text("type: Person\nname: Gregory Davidson\n", encoding="utf-8")
            (wiki / "place.yml").write_text("type: Place\nname: Princeton\n", encoding="utf-8")
            (wiki / "index.md").write_text("# Home", encoding="utf-8")
            config = WikiConfig(input_dirs=[wiki], config_root=root)

            site = build_site(config)

            page_by_slug = {page.full_slug: page for page in site.pages}
            self.assertIn("person", page_by_slug)
            self.assertEqual(page_by_slug["person"].title, "Gregory Davidson")
            self.assertIn("Gregory Davidson", page_by_slug["person"].html + str(page_by_slug["person"].frontmatter))
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

    def test_render_outline_title_renders_inline_code(self) -> None:
        html = render_outline_title("`Accept`")
        self.assertIn("<code>Accept</code>", html)
        self.assertNotIn("`Accept`", html)

    def test_render_outline_title_renders_wikilinks_without_nested_anchors(self) -> None:
        html = render_outline_title("Importance in the [[Semantic_Web|semantic web]]")
        self.assertIn('<span class="wikilink">semantic web</span>', html)
        self.assertNotIn("[[", html)
        self.assertNotIn("<a ", html)

    def test_build_page_html_renders_toc_heading_markdown(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            wiki = root / "wiki"
            wiki.mkdir()
            (wiki / "page.md").write_text(
                "# Page\n\n## Request headers\n\n### `Accept`\n\n"
                "## Importance in the [[Semantic_Web|semantic web]]\n",
                encoding="utf-8",
            )
            config = WikiConfig(input_dirs=[wiki], config_root=root)
            site = build_site(config)
            page = site.pages[0]
            html_template = pkg_files("wiki").joinpath("templates/index.html").read_text(encoding="utf-8")
            html = build_page_html(page, site, html_template=html_template)

            self.assertIn('<a href="#accept"><code>Accept</code></a>', html)
            self.assertIn('<span class="wikilink">semantic web</span>', html)
            sidebar_start = html.index('id="p-contents"')
            sidebar_html = html[sidebar_start:sidebar_start + 1500]
            self.assertNotIn("`Accept`", sidebar_html)
            self.assertNotIn("[[Semantic_Web|semantic web]]", sidebar_html)

    def test_render_adds_github_heading_ids_to_all_heading_levels(self) -> None:
        html = render_wiki_markdown("# Title\n\n### API: read/write?\n")

        self.assertIn('id="title"', html)
        self.assertIn('id="api-readwrite"', html)

    def test_render_highlights_fenced_code_with_known_language(self) -> None:
        html = render_wiki_markdown('```python\nprint("<hello>")\n```\n')

        self.assertIn('class="highlight"', html)
        self.assertIn('class="language-python"', html)
        self.assertIn('data-copy="print(&quot;&lt;hello&gt;&quot;)\n"', html)
        self.assertIn("<span", html)
        self.assertIn("&lt;hello&gt;", html)

    def test_render_unknown_language_falls_back_to_plain_code(self) -> None:
        html = render_wiki_markdown("```not-a-real-language\n<tag>\n```\n")

        self.assertIn('class="language-not-a-real-language"', html)
        self.assertIn('data-copy="&lt;tag&gt;\n"', html)
        self.assertIn("&lt;tag&gt;", html)
        self.assertNotIn("<span", html)

    def test_render_unlabeled_fence_remains_plain_code(self) -> None:
        html = render_wiki_markdown("```\n<tag>\n```\n")

        self.assertIn('data-copy="&lt;tag&gt;\n"', html)
        self.assertIn("<pre data-copy=", html)
        self.assertIn("<code>", html)
        self.assertIn("&lt;tag&gt;", html)
        self.assertNotIn('class="highlight"', html)

    def test_render_copyable_pre_escapes_attribute_text(self) -> None:
        html = render_copyable_pre('line "one"\nline two', "&lt;tag&gt;")

        self.assertIn('data-copy="line &quot;one&quot;', html)
        self.assertIn('line two"', html)
        self.assertIn("<code>&lt;tag&gt;</code>", html)

    def test_seed_template_includes_code_copy_initialization(self) -> None:
        seed_template = pkg_files("wiki").joinpath("templates/index.html").read_text(encoding="utf-8")
        self.assertIn("initCodeCopyButtons", seed_template)
        self.assertIn("pre[data-copy]", seed_template)
        self.assertIn("copyPreContent", seed_template)

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

            self.assertIn("Metadata</a>", html)
            self.assertIn('href="#view-metadata-content"', html)
            self.assertIn('metadata-format-panel-json-ld-compacted', html)
            self.assertNotIn('metadata-format-panel-json-ld-expanded', html)
            self.assertIn('metadata-format-panel-turtle', html)
            self.assertIn('value="json-ld-compacted" checked="checked"', html)
            self.assertIn('class="language-json"', html)
            self.assertIn('class="language-turtle"', html)
            self.assertIn('class="highlight"', html)
            self.assertIn('data-copy="', html)
            self.assertIn('&quot;@context&quot;', html)
            self.assertGreater(html.count('data-copy="'), 1)
            self.assertIn("<span", html)
            self.assertIn('&quot;@id&quot;', html)
            self.assertIn('&quot;@type&quot;', html)
            self.assertNotIn('&quot;type&quot;', html)
            self.assertLess(html.index('&quot;@context&quot;'), html.index('&quot;@id&quot;'))
            self.assertLess(html.index('&quot;@id&quot;'), html.index('&quot;@type&quot;'))
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

    def test_strip_leading_title_heading_removes_matching_h1(self) -> None:
        markdown = "# My Article\n\nLead paragraph."
        self.assertEqual(
            strip_leading_title_heading(markdown, "My Article"),
            "Lead paragraph.",
        )

    def test_strip_leading_title_heading_keeps_non_matching_h1(self) -> None:
        markdown = "# Different Title\n\nLead paragraph."
        self.assertEqual(
            strip_leading_title_heading(markdown, "My Article"),
            markdown,
        )

    def test_build_site_strips_duplicate_title_from_rendered_html(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            wiki = root / "wiki"
            wiki.mkdir()
            (wiki / "page.md").write_text(
                "---\nname: Content negotiation\ntype: TechArticle\n---\n\n"
                "# Content negotiation\n\nLead paragraph.\n",
                encoding="utf-8",
            )
            config = WikiConfig(input_dirs=[wiki], config_root=root)
            site = build_site(config)
            page = site.pages[0]
            self.assertIn("Lead paragraph.", page.html)
            self.assertNotIn("<h1", page.html)
            self.assertIn("# Content negotiation", page.markdown)

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
            self.assertNotIn("<h1>My Article</h1>", page.html)
            self.assertIn("Content.", html)
            self.assertNotIn("<style>", html)
            self.assertNotIn("infobox page-meta", html)
            self.assertNotIn("Backlinks", html)
            self.assertNotIn("On this page", html)

    def test_read_view_does_not_include_generic_site_sub(self) -> None:
        seed_template = pkg_files("wiki").joinpath("templates/index.html").read_text(encoding="utf-8")
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            wiki = root / "wiki"
            wiki.mkdir()
            (wiki / "page.md").write_text("# Page\n\nBody.", encoding="utf-8")
            config = WikiConfig(input_dirs=[wiki], config_root=root)
            site = build_site(config)
            page = site.pages[0]
            html = build_page_html(page, site, html_template=seed_template)
            self.assertNotIn("From Wiki CLI, the semantic knowledge base", html)

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

    def test_page_content_does_not_expand_documented_placeholder_tokens(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            wiki = root / "wiki"
            wiki.mkdir()
            (wiki / "Placeholders.md").write_text(
                "---\nname: Placeholders\ntype: TechArticle\n---\n\n"
                "| Placeholder | Description |\n"
                "| --- | --- |\n"
                "| `{metadata_pane_html}` | Metadata pane |\n",
                encoding="utf-8",
            )
            config = WikiConfig(input_dirs=[wiki], config_root=root)
            site = build_site(config)
            page = site.pages[0]
            html = build_page_html(page, site, html_template=_FULL_TEST_TEMPLATE)
            self.assertIn("{metadata_pane_html}", html)
            self.assertNotIn("metadata-format-switch", html)

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
