"""A UTF-8 BOM must not change what any part of the read surface sees (wiki#312).

Windows editors (Notepad, PowerShell ``>`` redirection, VS Code's "UTF-8 with
BOM") save text with a UTF-8 BOM. Every text read in the CLI now goes through
``parser.read_text_tolerant`` (utf-8-sig), so a vault authored with BOMs has to
produce exactly the same gate results and the same built site as the same vault
authored without them.
"""

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from click.testing import CliRunner

from wiki.cli import main

WIKI_YML = """wiki:
  input: [wiki]
  assets: [assets]

graph:
  content_predicate: schema:articleBody
  context:
    schema: https://schema.org/

site:
  layout: layouts/default.html.j2
  base_url: /
  url_style: dir

check:
  frontmatter_schema: off

lint:
  link_style: off
"""

PAGE = (
    "---\n"
    "type: schema:Person\n"
    "name: Page One\n"
    "schema:givenName: Ada\n"
    "---\n"
    "\n"
    "# Page One\n"
    "\n"
    "Body text.\n"
)

OTHER = (
    "---\n"
    "type: schema:Person\n"
    "name: Other page\n"
    "---\n"
    "\n"
    "# Other page\n"
    "\n"
    "A link to [Page One](Page.md).\n"
)

LAYOUT = "<html><body>%wiki.body%</body></html>"

MINIMAL_YML = (
    "wiki:\n  input: [wiki]\ngraph:\n  content_predicate: schema:articleBody\n"
    "  context:\n    schema: https://schema.org/\n"
)


class TestBomTolerance(unittest.TestCase):
    def _write_vault(self, root: Path, encoding: str) -> None:
        wiki = root / "wiki"
        wiki.mkdir(parents=True)
        (root / "assets").mkdir()
        (root / "layouts").mkdir()
        (root / "layouts" / "default.html.j2").write_text(LAYOUT, encoding=encoding)
        (root / "wiki.yml").write_text(WIKI_YML, encoding=encoding)
        (wiki / "Page.md").write_text(PAGE, encoding=encoding)
        (wiki / "Other.md").write_text(OTHER, encoding=encoding)

    def _run(self, root: Path, *args: str):
        return CliRunner().invoke(main, ["--config", str(root), *args])

    def test_bom_vault_matches_plain_vault(self) -> None:
        """Config, graph, audit, render and site build all read BOMs the same way."""
        plain = Path(self.enterContext(TemporaryDirectory()))
        bommed = Path(self.enterContext(TemporaryDirectory()))
        self._write_vault(plain, "utf-8")
        self._write_vault(bommed, "utf-8-sig")

        for args in (
            ["check", "--strict", "-v"],
            ["lint", "--strict", "-v"],
            ["render", "--check", "-v"],
        ):
            plain_result = self._run(plain, *args)
            bommed_result = self._run(bommed, *args)
            self.assertEqual(plain_result.exit_code, 0, f"{args}: {bommed_result.output}")
            self.assertEqual(
                plain_result.output.replace(str(plain), "<root>"),
                bommed_result.output.replace(str(bommed), "<root>"),
                f"{args}: gate output differs between the plain and BOM vault",
            )

        plain_out = plain / "_site"
        bommed_out = bommed / "_site"
        self.assertEqual(self._run(plain, "build", "--output-dir", str(plain_out)).exit_code, 0)
        self.assertEqual(self._run(bommed, "build", "--output-dir", str(bommed_out)).exit_code, 0)

        plain_files = sorted(
            path.relative_to(plain_out).as_posix() for path in plain_out.rglob("*") if path.is_file()
        )
        bommed_files = sorted(
            path.relative_to(bommed_out).as_posix() for path in bommed_out.rglob("*") if path.is_file()
        )
        self.assertEqual(plain_files, bommed_files)
        self.assertIn("Page/index.html", bommed_files)
        for rel in plain_files:
            self.assertEqual((plain_out / rel).read_bytes(), (bommed_out / rel).read_bytes(), rel)

        rendered = (bommed_out / "Page" / "index.html").read_text(encoding="utf-8")
        self.assertIn("<p>Body text.</p>", rendered)
        self.assertNotIn("\ufeff", rendered)

        # The BOM page's frontmatter reached the graph as a typed resource, not
        # as prose: this is the silent data loss the issue reported.
        query = "SELECT ?p WHERE { ?p a <https://schema.org/Person> }"
        people = self._run(bommed, "query", query)
        self.assertEqual(people.exit_code, 0, people.output)
        self.assertEqual(people.output, self._run(plain, "query", query).output)
        self.assertGreaterEqual(people.output.count("/Page"), 1)

    def test_link_apply_rewrites_bom_page_without_losing_frontmatter(self) -> None:
        """The link writer reads tolerantly, so applying a link keeps the block intact."""
        root = Path(self.enterContext(TemporaryDirectory()))
        wiki = root / "wiki"
        wiki.mkdir(parents=True)
        (root / "wiki.yml").write_text(MINIMAL_YML, encoding="utf-8-sig")
        (wiki / "Target_Page.md").write_text(
            "---\ntype: schema:WebPage\nname: Target Page\n---\n\n# Target Page\n\nText.\n",
            encoding="utf-8-sig",
        )
        source = wiki / "Source_Page.md"
        source.write_text(
            "---\ntype: schema:WebPage\nname: Source Page\n---\n\n# Source Page\n\n"
            "This mentions Target Page without linking it.\n",
            encoding="utf-8-sig",
        )

        result = self._run(root, "link", "--apply", "-v")
        self.assertEqual(result.exit_code, 0, result.output)

        raw = source.read_bytes()
        self.assertFalse(raw.startswith(b"\xef\xbb\xbf"), "rewrite should drop the BOM, not keep it")
        content = raw.decode("utf-8")
        self.assertIn("[Target Page](Target_Page.md)", content)
        self.assertIn("type: schema:WebPage", content)
        self.assertIn("name: Source Page", content)
        self.assertNotIn("## \ufeff", content)


if __name__ == "__main__":
    unittest.main()
