import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from wiki.config import Config
from wiki.format import METADATA_VIEWS
from wiki.init_scaffold import load_packaged_default_layout
from wiki.site import (
    build_index_html,
    build_page_html,
    build_site,
    render_copyable_pre,
    render_outline_title,
    render_wiki_markdown,
    strip_leading_title_heading,
)

from tests.layout_helpers import jinja, write_layout

_FULL_TEST_TEMPLATE = jinja("""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>{page.title}</title>
</head>
<body>
{page.type_label}
<article id="article-top">
{page.nav.infobox}
{page.content}
</article>
{page.nav.toc}
{page.nav.backlinks}
{page.nav.categories}
</body>
</html>""")


def _full_test_layout(root: Path) -> Path:
    return write_layout(root, "layouts/full_test.html.j2", _FULL_TEST_TEMPLATE)


def _default_layout(root: Path) -> Path:
    return write_layout(root, "layouts/default.html.j2", load_packaged_default_layout())


class TestWikiSite(unittest.TestCase):
    def test_build_site_creates_one_page_per_markdown_file(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            wiki = root / "wiki"
            wiki.mkdir()
            (wiki / "Bob.md").write_text("# Bob\n\n## Early Life\n\nBorn.\n\n## Early Life\n\nAgain.", encoding="utf-8")
            config = Config(wiki={"inputs": [wiki]}, config_root=root)

            site = build_site(config, base_url="/wiki", url_style="dir")

            self.assertEqual(len(site.pages), 1)
            page = site.pages[0]
            self.assertEqual(page.full_slug, "Bob")
            self.assertNotIn('id="bob"', page.html)
            self.assertIn('id="early-life"', page.html)
            self.assertIn('id="early-life-1"', page.html)
            self.assertEqual([item.slug for item in page.outline], ["early-life", "early-life-1"])
            html = build_page_html(
                page, site, root, base_url="/wiki", url_style="dir", default_layout=_full_test_layout(root)
            )
            self.assertIn('class="toc"', html)
            self.assertIn('href="#early-life"', html)
            self.assertIn('href="#firstHeading"', html)

    def test_title_falls_back_to_humanized_route(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            wiki = root / "wiki"
            wiki.mkdir()
            (wiki / "Pokemon_Diamond_(copy_1).md").write_text("No heading.", encoding="utf-8")
            config = Config(wiki={"inputs": [wiki]}, config_root=root)

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
            config = Config(wiki={"inputs": [wiki]}, config_root=root)

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
givenName: Gregory
familyName: Davidson
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
givenName: Ethan
familyName: Davidson
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
            config = Config(wiki={"inputs": [wiki]}, config_root=root)

            site = build_site(config, base_url="/wiki", url_style="dir")
            page = next(page for page in site.pages if page.full_slug == "Gregory_Davidson")
            html = build_page_html(
                page, site, root, base_url="/wiki", url_style="dir", default_layout=_full_test_layout(root)
            )

            self.assertIsNone(page.layout_path)
            self.assertEqual(page.layout_stem, "default")
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

    def test_wazoo_layout_frontmatter_loads_custom_shell(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            wiki = root / "wiki"
            wiki.mkdir()
            layouts = root / "layouts"
            layouts.mkdir()
            custom_shell = jinja(
                """<!DOCTYPE html>
<html><body><div id="custom-shell">{page.title}{page.nav.infobox}{page.content}</div></body></html>"""
            )
            (layouts / "project.html.j2").write_text(custom_shell, encoding="utf-8")
            (wiki / "project.md").write_text(
                """---
type: schema:CreativeWork
wazoo:layout: layouts/project.html.j2
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
            config = Config(wiki={"inputs": [wiki]}, config_root=root)

            site = build_site(config, base_url="/wiki", url_style="dir")
            page = next(page for page in site.pages if page.full_slug == "project")
            html = build_page_html(
                page, site, root, base_url="/wiki", url_style="dir", default_layout=_full_test_layout(root)
            )

            self.assertEqual(page.layout_path, (layouts / "project.html.j2").resolve())
            self.assertEqual(page.layout_stem, "project")
            self.assertIn('id="custom-shell"', html)
            self.assertIn('class="infobox page-meta"', html)
            self.assertIn("<dt>wazoo:layout</dt>", html)
            self.assertIn('href="/wiki/Project_Atlas/"', html)

    def test_template_frontmatter_does_not_select_layout(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            wiki = root / "wiki"
            wiki.mkdir()
            (wiki / "project.md").write_text(
                """---
type: schema:CreativeWork
template: layouts/project.html
wiki:template: layouts/project.html
name: Project Atlas
---
# Project Atlas
""",
                encoding="utf-8",
            )
            config = Config(wiki={"inputs": [wiki]}, config_root=root)

            site = build_site(config, base_url="/wiki", url_style="dir")
            page = next(page for page in site.pages if page.full_slug == "project")
            html = build_page_html(
                page, site, root, base_url="/wiki", url_style="dir", default_layout=_full_test_layout(root)
            )

            self.assertIsNone(page.layout_path)
            self.assertEqual(page.layout_stem, "default")
            self.assertNotIn('id="custom-shell"', html)
            self.assertIn('id="article-top"', html)
            self.assertIn('class="layout-label">CreativeWork</div>', html)
            self.assertIn("<dt>template</dt>", html)
            self.assertIn("<dt>wiki:template</dt>", html)

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
            config = Config(wiki={"inputs": [wiki]}, config_root=root)
            site = build_site(config)
            page = site.pages[0]
            page_layout = _default_layout(root)
            html = build_page_html(page, site, root, default_layout=page_layout)

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

    def test_render_hidden_sparql_block_omits_query_from_html(self) -> None:
        markdown = (
            "<!-- sparql:start\n"
            "```sparql\nSELECT ?name WHERE { ?person foaf:name ?name }\n```\n"
            "-->\n\n"
            "| name |\n| --- |\n| Alice |\n\n"
            "<!-- sparql:end -->\n"
        )
        html = render_wiki_markdown(markdown)

        self.assertIn("Alice", html)
        self.assertIn("<table>", html)
        self.assertNotIn("language-sparql", html)
        self.assertNotIn('class="highlight"', html)
        self.assertNotIn("<pre data-copy=", html)

    def test_render_visible_sparql_block_shows_query_in_html(self) -> None:
        markdown = (
            "<!-- sparql:start -->\n"
            "```sparql\nSELECT ?name WHERE { ?person foaf:name ?name }\n```\n\n"
            "| name |\n| --- |\n| Alice |\n\n"
            "<!-- sparql:end -->\n"
        )
        html = render_wiki_markdown(markdown)

        self.assertIn("language-sparql", html)
        self.assertIn("SELECT ?name", html)

    def test_render_copyable_pre_escapes_attribute_text(self) -> None:
        html = render_copyable_pre('line "one"\nline two', "&lt;tag&gt;")

        self.assertIn('data-copy="line &quot;one&quot;', html)
        self.assertIn('line two"', html)
        self.assertIn("<code>&lt;tag&gt;</code>", html)

    def test_seed_template_includes_code_copy_initialization(self) -> None:
        seed_template = load_packaged_default_layout()
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
givenName: Gregory
familyName: Davidson
specialty: Diagnostics
---
# Gregory Davidson
""",
                encoding="utf-8",
            )
            config = Config(wiki={"inputs": [wiki]}, config_root=root)

            site = build_site(config, base_url="/wiki", url_style="dir")
            page = next(page for page in site.pages if page.full_slug == "person")
            page_layout = _default_layout(root)
            html = build_page_html(page, site, root, base_url="/wiki", url_style="dir", default_layout=page_layout)

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
            self.assertIn('schema:givenName', html)

            for view in METADATA_VIEWS:
                panel_marker = f'<div class="metadata-format-panel metadata-format-panel-{view.id}">'
                panel_start = html.index(panel_marker)
                panel_end = html.index("</div>", panel_start)
                panel_html = html[panel_start:panel_end]
                self.assertIn(
                    "<span",
                    panel_html,
                    msg=f"metadata panel {view.id} should be syntax-highlighted",
                )
                self.assertIn(
                    f'class="language-{view.lexer}"',
                    panel_html,
                    msg=f"metadata panel {view.id} should keep language-{view.lexer} class",
                )

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
            config = Config(wiki={"inputs": [wiki]}, config_root=root)
            site = build_site(config)
            html = build_index_html(site, root)
            self.assertIn("<h1 id=\"firstHeading\">All Pages</h1>", html)
            self.assertIn('<ul class="pages-list">', html)
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

    def test_strip_leading_title_heading_matches_inline_code_h1(self) -> None:
        markdown = "# `wiki lint`\n\nRun convention audits."
        self.assertEqual(
            strip_leading_title_heading(markdown, "wiki lint"),
            "Run convention audits.",
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
            config = Config(wiki={"inputs": [wiki]}, config_root=root)
            site = build_site(config)
            page = site.pages[0]
            self.assertIn("Lead paragraph.", page.html)
            self.assertNotIn("<h1", page.html)
            self.assertIn("# Content negotiation", page.markdown)

    def test_infobox_links_about_wiki_curie(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            wiki = root / "wiki"
            wiki.mkdir()
            (root / "wiki.yaml").write_text(
                "wiki:\n  inputs: [wiki]\ngraph:\n  context:\n    wiki: https://wiki.example.org/\n"
                "  context:\n    wiki: https://wiki.example.org/\n",
                encoding="utf-8",
            )
            (wiki / "Farzapedia.md").write_text(
                "---\ntype: TechArticle\nheadline: Farzapedia\nabout: wiki:Wiki_CLI\n---\n\nBody.\n",
                encoding="utf-8",
            )
            (wiki / "Wiki_CLI.md").write_text(
                "---\ntype: TechArticle\nname: Wiki CLI\n---\n\n# Wiki CLI\n",
                encoding="utf-8",
            )
            config = Config.load(root / "wiki.yaml")
            site = build_site(config, base_url="/wiki", url_style="dir")
            page = next(p for p in site.pages if p.full_slug == "Farzapedia")
            html = build_page_html(
                page, site, root, base_url="/wiki", url_style="dir", default_layout=_full_test_layout(root)
            )
            self.assertIn('href="/wiki/Wiki_CLI/"', html)
            self.assertIn(">Wiki CLI</a>", html)
            self.assertNotIn(">wiki:Wiki_CLI</a>", html)

    def test_fallback_article_uses_minimal_template(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            wiki = root / "wiki"
            wiki.mkdir()
            (wiki / "page.md").write_text("---\ntype: Article\n---\n\n# My Article\n\nContent.", encoding="utf-8")
            config = Config(wiki={"inputs": [wiki]}, config_root=root)
            site = build_site(config)
            page = site.pages[0]
            html = build_page_html(page, site, root)
            self.assertIn("<h1 id=\"firstHeading\">My Article</h1>", html)
            self.assertNotIn("<h1>My Article</h1>", page.html)
            self.assertIn("Content.", html)
            self.assertNotIn("<style>", html)
            self.assertNotIn("infobox page-meta", html)
            self.assertNotIn("Backlinks", html)
            self.assertNotIn("On this page", html)

    def test_default_layout_read_view_includes_first_heading(self) -> None:
        seed_template = load_packaged_default_layout()
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            wiki = root / "wiki"
            wiki.mkdir()
            (wiki / "Wiki_CLI.md").write_text(
                "---\ntype: schema:SoftwareApplication\nname: Wiki CLI\n---\n\n"
                "# Wiki CLI\n\nLead paragraph.\n",
                encoding="utf-8",
            )
            config = Config(wiki={"inputs": [wiki]}, config_root=root)
            site = build_site(config)
            page = site.pages[0]
            html = build_page_html(page, site, root, default_layout=_default_layout(root))
            self.assertIn('<h1 class="firstHeading" id="firstHeading">Wiki CLI</h1>', html)
            self.assertNotIn("<h1", page.html)
            self.assertIn("Lead paragraph.", html)

    def test_read_view_does_not_include_generic_site_sub(self) -> None:
        seed_template = load_packaged_default_layout()
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            wiki = root / "wiki"
            wiki.mkdir()
            (wiki / "page.md").write_text("# Page\n\nBody.", encoding="utf-8")
            config = Config(wiki={"inputs": [wiki]}, config_root=root)
            site = build_site(config)
            page = site.pages[0]
            html = build_page_html(page, site, root, default_layout=_default_layout(root))
            self.assertNotIn("From Wiki CLI, the semantic knowledge base", html)

    def test_fallback_has_page_kind(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            wiki = root / "wiki"
            wiki.mkdir()
            (wiki / "page.md").write_text("# Page\n", encoding="utf-8")
            config = Config(wiki={"inputs": [wiki]}, config_root=root)
            site = build_site(config)
            index_html = build_index_html(site, root)
            self.assertIn("All Pages", index_html)
            page = site.pages[0]
            article_html = build_page_html(page, site, root)
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
            config = Config(wiki={"inputs": [wiki]}, config_root=root)
            site = build_site(config)
            page = site.pages[0]
            html = build_page_html(page, site, root, default_layout=_full_test_layout(root))
            self.assertIn("{metadata_pane_html}", html)
            self.assertNotIn("metadata-format-switch", html)

    def test_build_index_html_respects_url_style(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            wiki = root / "wiki"
            wiki.mkdir()
            (wiki / "alice.md").write_text("# Alice\n", encoding="utf-8")
            (wiki / "bob.md").write_text("# Bob\n", encoding="utf-8")

            dir_config = Config(wiki={"inputs": [wiki]}, site={"url_style": "dir"}, config_root=root)
            dir_site = build_site(dir_config)
            dir_index = build_index_html(dir_site, root, base_url="/wiki", url_style=dir_config.site.url_style)
            self.assertIn('href="/wiki/alice/"', dir_index)
            self.assertIn('href="/wiki/bob/"', dir_index)
            self.assertNotIn(".html", dir_index)

            file_config = Config(wiki={"inputs": [wiki]}, site={"url_style": "file"}, config_root=root)
            file_site = build_site(file_config)
            file_index = build_index_html(file_site, root, base_url="/wiki", url_style=file_config.site.url_style)
            self.assertIn('href="/wiki/alice.html"', file_index)
            self.assertIn('href="/wiki/bob.html"', file_index)

    def test_build_index_html_substitutes_empty_type_label(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            wiki = root / "wiki"
            wiki.mkdir()
            (wiki / "Alice.md").write_text("# Alice\n", encoding="utf-8")
            config = Config(wiki={"inputs": [wiki]}, config_root=root)
            site = build_site(config)
            html = build_index_html(site, root, default_layout=_full_test_layout(root))
            self.assertNotIn("{page.type_label}", html)
            self.assertNotIn('class="layout-label"', html)

    def test_build_index_html_emits_pages_list_with_categories(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            wiki = root / "wiki"
            wiki.mkdir()
            (wiki / "Person_A.md").write_text("---\ntype: Person\n---\n# Person A\n", encoding="utf-8")
            (wiki / "Plain.md").write_text("# Plain\n", encoding="utf-8")
            config = Config(wiki={"inputs": [wiki]}, config_root=root)
            site = build_site(config)
            html = build_index_html(site, root, default_layout=_full_test_layout(root))
            article_start = html.index('<article id="article-top">')
            article_end = html.index("</article>", article_start)
            article = html[article_start:article_end]
            self.assertIn('<ul class="pages-list">', article)
            self.assertIn('data-categories="Person"', article)
            self.assertIn('data-categories=""', article)

    def test_inline_css_loads_packaged_layout_default_css(self) -> None:
        from wiki.site import INLINE_CSS

        self.assertIn("#mw-navigation", INLINE_CSS)
        self.assertIn(".metadata-format-switch", INLINE_CSS)
        self.assertIn(".highlight", INLINE_CSS)

    def test_build_logo_svg_uses_site_theme_color(self) -> None:
        from wiki.site import _build_logo_svg

        default = _build_logo_svg("W")
        themed = _build_logo_svg("W", "#6366f1")
        self.assertIn('stop-color="#3b82f6"', default)
        self.assertIn('stop-color="#6366f1"', themed)
        self.assertNotIn('stop-color="#3b82f6"', themed)

    def test_build_index_html_logo_reflects_config_theme_color(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            wiki = root / "wiki"
            wiki.mkdir()
            (wiki / "page.md").write_text("# Page\n", encoding="utf-8")
            config = Config(
                wiki={"inputs": [wiki]},
                site={"manifest": {"theme_color": "#6366f1"}},
                config_root=root,
            )
            site = build_site(config)
            html = build_index_html(site, root, default_layout=write_layout(root, "layouts/logo.html.j2", jinja("{site.logo_svg}")))
            self.assertIn('stop-color="#6366f1"', html)

    def test_build_index_html_emits_theme_color_meta_tags(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            wiki = root / "wiki"
            wiki.mkdir()
            (wiki / "page.md").write_text("# Page\n", encoding="utf-8")
            config = Config(wiki={"inputs": [wiki]}, config_root=root)
            site = build_site(config)
            html = build_index_html(
                site,
                root,
                default_layout=write_layout(
                    root,
                    "layouts/theme.html.j2",
                    jinja(
                        '<meta name="theme-color" content="{site.manifest.theme_color}">'
                        '<meta name="msapplication-TileColor" content="{site.manifest.theme_color}">'
                    ),
                ),
            )
            self.assertIn('<meta name="theme-color" content="#3b82f6">', html)
            self.assertIn('<meta name="msapplication-TileColor" content="#3b82f6">', html)

        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            wiki = root / "wiki"
            wiki.mkdir()
            (wiki / "page.md").write_text("# Page\n", encoding="utf-8")
            config = Config(
                wiki={"inputs": [wiki]},
                site={"manifest": {"theme_color": "#6366f1"}},
                config_root=root,
            )
            site = build_site(config)
            html = build_index_html(
                site,
                root,
                default_layout=write_layout(
                    root,
                    "layouts/theme_single.html.j2",
                    jinja('<meta name="theme-color" content="{site.manifest.theme_color}">'),
                ),
            )
            self.assertIn('<meta name="theme-color" content="#6366f1">', html)

    def test_build_web_manifest_uses_manifest_fields(self) -> None:
        from wiki.site import build_web_manifest

        config = Config(
            site={
                "manifest": {
                    "name": "Acme Docs",
                    "short_name": "Acme",
                    "theme_color": "#6366f1",
                    "display": "standalone",
                },
                "base_url": "/wiki",
            },
        )
        doc = build_web_manifest(config)
        self.assertEqual(doc["name"], "Acme Docs")
        self.assertEqual(doc["short_name"], "Acme")
        self.assertEqual(doc["theme_color"], "#6366f1")
        self.assertEqual(doc["display"], "standalone")
        self.assertEqual(doc["start_url"], "/wiki/")

    def test_build_index_html_includes_manifest_placeholders(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            wiki = root / "wiki"
            wiki.mkdir()
            (wiki / "page.md").write_text("# Page\n", encoding="utf-8")
            config = Config(
                wiki={"inputs": [wiki]},
                site={"manifest": {"name": "Acme Docs", "theme_color": "#6366f1"}},
                config_root=root,
            )
            site = build_site(config)
            html = build_index_html(
                site,
                root,
                default_layout=write_layout(
                    root,
                    "layouts/manifest.html.j2",
                    jinja("{site.manifest.url}|{site.manifest.json}"),
                ),
            )
            self.assertIn("/wiki/manifest.webmanifest", html)
            self.assertIn('"name":"Acme Docs"', html)
            self.assertIn('"theme_color":"#6366f1"', html)


if __name__ == "__main__":
    unittest.main()
