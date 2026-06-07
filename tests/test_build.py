import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from click.testing import CliRunner

from wiki.cli import main


class TestWikiBuild(unittest.TestCase):
    def test_build_copies_configured_assets(self) -> None:
        runner = CliRunner()
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            wiki = root / "wiki"
            assets = root / "assets" / "items"
            wiki.mkdir()
            assets.mkdir(parents=True)
            (root / "wiki.yaml").write_text("input_dirs: wiki\nasset_dirs: assets\n", encoding="utf-8")
            (wiki / "Item.md").write_text("# Item\n\n![label](../assets/items/label.jpg)", encoding="utf-8")
            (assets / "label.jpg").write_text("image", encoding="utf-8")
            output_dir = root / "_site"

            result = runner.invoke(main, ["--config", str(root), "build", "--output-dir", str(output_dir)])

            self.assertEqual(result.exit_code, 0, result.output)
            self.assertTrue((output_dir / "wiki" / "Item" / "index.html").exists())
            self.assertEqual((output_dir / "wiki" / "assets" / "items" / "label.jpg").read_text(encoding="utf-8"), "image")

    def test_build_runs_check_before_cleaning_output(self) -> None:
        runner = CliRunner()
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            wiki = root / "wiki"
            output_dir = root / "_site"
            owned = output_dir / "wiki"
            wiki.mkdir()
            owned.mkdir(parents=True)
            (owned / "old.html").write_text("old", encoding="utf-8")
            (root / "wiki.yaml").write_text("input_dirs: wiki\ncheck:\n  broken_links: error\n", encoding="utf-8")
            (wiki / "Page.md").write_text("# Page\n\n[[Missing]]", encoding="utf-8")

            result = runner.invoke(main, ["--config", str(root), "build", "--output-dir", str(output_dir)])

            self.assertEqual(result.exit_code, 1)
            self.assertEqual((owned / "old.html").read_text(encoding="utf-8"), "old")

    def test_build_no_check_skips_configurable_checks_but_cleans_output(self) -> None:
        runner = CliRunner()
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            wiki = root / "wiki"
            output_dir = root / "_site"
            owned = output_dir / "wiki"
            wiki.mkdir()
            owned.mkdir(parents=True)
            (owned / "old.html").write_text("old", encoding="utf-8")
            (root / "wiki.yaml").write_text("input_dirs: wiki\ncheck:\n  broken_links: error\n", encoding="utf-8")
            (wiki / "Page.md").write_text("# Page\n\n[[Missing]]", encoding="utf-8")

            result = runner.invoke(main, ["--config", str(root), "build", "--output-dir", str(output_dir), "--no-check"])

            self.assertEqual(result.exit_code, 0, result.output)
            self.assertFalse((owned / "old.html").exists())
            self.assertTrue((owned / "Page" / "index.html").exists())

    def test_root_index_md_replaces_generated_index(self) -> None:
        runner = CliRunner()
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            wiki = root / "wiki"
            output_dir = root / "_site"
            wiki.mkdir()
            (root / "wiki.yaml").write_text("input_dirs: wiki\n", encoding="utf-8")
            (wiki / "index.md").write_text("# Custom Home\n\nWelcome.", encoding="utf-8")
            (wiki / "Page.md").write_text("# Page", encoding="utf-8")

            result = runner.invoke(main, ["--config", str(root), "build", "--output-dir", str(output_dir)])

            self.assertEqual(result.exit_code, 0, result.output)
            index_content = (output_dir / "wiki" / "index.html").read_text(encoding="utf-8")
            self.assertIn("Custom Home", index_content)
            self.assertNotIn("All Pages", index_content)

    def test_build_writes_pages_for_yaml_documents(self) -> None:
        runner = CliRunner()
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            wiki = root / "wiki"
            output_dir = root / "_site"
            wiki.mkdir()
            (root / "wiki.yaml").write_text("input_dirs: wiki\n", encoding="utf-8")
            (wiki / "person.yaml").write_text("type: Person\nname: Gregory Davidson\n", encoding="utf-8")
            (wiki / "place.yml").write_text("type: Place\nname: Princeton\n", encoding="utf-8")

            result = runner.invoke(main, ["--config", str(root), "build", "--output-dir", str(output_dir)])

            self.assertEqual(result.exit_code, 0, result.output)
            self.assertTrue((output_dir / "wiki" / "person" / "index.html").exists())
            self.assertTrue((output_dir / "wiki" / "place" / "index.html").exists())

    def test_build_renders_infobox_links_for_typed_pages(self) -> None:
        runner = CliRunner()
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            wiki = root / "wiki"
            output_dir = root / "_site"
            wiki.mkdir()
            test_template = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>{page_title}</title>
</head>
<body>
<h1>{page_title}</h1>
{infobox_html}
{page_content}
</body>
</html>"""
            (root / "wiki.yaml").write_text("input_dirs: wiki\nhtml_template: test_shell.html\n", encoding="utf-8")
            (root / "test_shell.html").write_text(test_template, encoding="utf-8")
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

            result = runner.invoke(main, ["--config", str(root), "build", "--output-dir", str(output_dir)])

            self.assertEqual(result.exit_code, 0, result.output)
            html = (output_dir / "wiki" / "Gregory_Davidson" / "index.html").read_text(encoding="utf-8")
            self.assertIn('class="infobox page-meta"', html)
            self.assertIn('>Ethan Davidson</a>', html)
            self.assertIn('>Bella Davidson</a>', html)
            self.assertIn('href="/wiki/Bella_Davidson/"', html)
            self.assertIn('href="https://example.com/gregory-davidson"', html)

    def test_build_embeds_all_metadata_format_views(self) -> None:
        runner = CliRunner()
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            wiki = root / "wiki"
            output_dir = root / "_site"
            wiki.mkdir()
            template = """<!DOCTYPE html>
<html lang=\"en\">
<head>
<meta charset=\"UTF-8\">
<meta name=\"viewport\" content=\"width=device-width,initial-scale=1.0\">
<title>{page_title}</title>
</head>
<body>
<h1>{page_title}</h1>
{page_content}
{metadata_pane_html}
</body>
</html>"""
            (root / "wiki.yaml").write_text("input_dirs: wiki\nhtml_template: test_shell.html\n", encoding="utf-8")
            (root / "test_shell.html").write_text(template, encoding="utf-8")
            (wiki / "Page.md").write_text(
                """---
type: Person
name: Alice
about: wiki:Alice_Theory
---
# Alice
""",
                encoding="utf-8",
            )

            result = runner.invoke(main, ["--config", str(root), "build", "--output-dir", str(output_dir)])

            self.assertEqual(result.exit_code, 0, result.output)
            html = (output_dir / "wiki" / "Page" / "index.html").read_text(encoding="utf-8")
            self.assertIn("metadata-format-heading", html)
            self.assertIn("Format</span>", html)
            self.assertIn('metadata-format-panel-json-ld-compacted', html)
            self.assertNotIn('metadata-format-panel-json-ld-expanded', html)
            self.assertIn('metadata-format-panel-turtle', html)
            self.assertIn('metadata-format-panel-xml', html)
            self.assertIn('value="json-ld-compacted" checked="checked"', html)
            self.assertIn('value="turtle"', html)

    def test_missing_configured_template_falls_back_silently(self) -> None:
        runner = CliRunner()
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            wiki = root / "wiki"
            output_dir = root / "_site"
            wiki.mkdir()
            (root / "wiki.yaml").write_text("input_dirs: wiki\nhtml_template: nonexistent.html\n", encoding="utf-8")
            (wiki / "Page.md").write_text("# Page\n\nContent.", encoding="utf-8")
            result = runner.invoke(main, ["--config", str(root), "build", "--output-dir", str(output_dir)])
            self.assertEqual(result.exit_code, 0, result.output)
            html = (output_dir / "wiki" / "Page" / "index.html").read_text(encoding="utf-8")
            self.assertIn("<h1 id=\"firstHeading\">Page</h1>", html)
            self.assertIn("Content.", html)
            self.assertNotIn("<style>", html)

    def test_seed_template_parity(self) -> None:
        from pathlib import Path
        import sys
        repo_root = Path(__file__).resolve().parent.parent
        docs_html = repo_root / "docs" / "index.html"
        pkg_html = repo_root / "src" / "wiki" / "templates" / "index.html"
        self.assertTrue(docs_html.is_file(), f"docs/index.html not found at {docs_html}")
        self.assertTrue(pkg_html.is_file(), f"templates/index.html not found at {pkg_html}")
        self.assertEqual(
            docs_html.read_text(encoding="utf-8"),
            pkg_html.read_text(encoding="utf-8"),
            "docs/index.html and src/wiki/templates/index.html must be identical",
        )


if __name__ == "__main__":
    unittest.main()
