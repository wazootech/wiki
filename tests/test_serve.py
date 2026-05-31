"""Tests for the wiki serve subcommand."""

from __future__ import annotations

import socket
import threading
import unittest
from http.client import HTTPConnection
from pathlib import Path
from tempfile import TemporaryDirectory
from time import sleep
from typing import Generator

from click.testing import CliRunner

from wiki.cli import main
from wiki.config import WikiConfig
from wiki.serve import build_site, create_server


def _free_port() -> int:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def _serve_in_thread(wiki_dir: Path) -> Generator[int, None, None]:
    port = _free_port()
    config = WikiConfig(input_dirs=[wiki_dir], config_root=wiki_dir)
    server = create_server(config, host="127.0.0.1", port=port)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    for _ in range(100):
        try:
            conn = HTTPConnection("127.0.0.1", port, timeout=1)
            conn.request("GET", "/")
            conn.getresponse()
            conn.close()
            break
        except ConnectionRefusedError:
            sleep(0.05)
    yield port
    server.shutdown()


class TestServe(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir = TemporaryDirectory()
        self.wiki_dir = Path(self.tmpdir.name)

    def tearDown(self) -> None:
        self.tmpdir.cleanup()

    def _write(self, name: str, content: str) -> Path:
        p = self.wiki_dir / name
        p.write_text(content, encoding="utf-8")
        return p

    def _get(self, port: int, path: str) -> tuple[int, str]:
        conn = HTTPConnection("127.0.0.1", port, timeout=5)
        conn.request("GET", path)
        resp = conn.getresponse()
        body = resp.read().decode("utf-8")
        conn.close()
        return resp.status, body

    def test_index_page(self) -> None:
        self._write("hello-world.md", "# Hello World\n\nSome content.")
        self._write("foo-bar.md", "# Foo Bar\n\nContent.")
        for port in _serve_in_thread(self.wiki_dir):
            status, body = self._get(port, "/")
        self.assertEqual(status, 200)
        self.assertIn("All Pages", body)
        self.assertIn("Hello World", body)
        self.assertIn("Foo Bar", body)
        self.assertIn("/wiki/hello-world", body)
        self.assertIn("/wiki/foo-bar", body)

    def test_render_page(self) -> None:
        self._write("hello.md", "# Hello\n\nParagraph text.")
        for port in _serve_in_thread(self.wiki_dir):
            status, body = self._get(port, "/wiki/hello")
        self.assertEqual(status, 200)
        self.assertIn("Hello", body)
        self.assertIn("Paragraph text.", body)

    def test_wikilinks_rendered(self) -> None:
        self._write("alpha.md", "# Alpha\n\nSee [[beta]] for details.")
        self._write("beta.md", "# Beta\n\nContent.")
        for port in _serve_in_thread(self.wiki_dir):
            status, body = self._get(port, "/wiki/alpha")
        self.assertEqual(status, 200)
        self.assertIn('class="wikilink"', body)
        self.assertIn("/wiki/beta", body)

    def test_wikilinks_with_display(self) -> None:
        self._write("alpha.md", "# Alpha\n\nSee [[beta|Beta]].")
        self._write("beta.md", "# Beta\n\nContent.")
        for port in _serve_in_thread(self.wiki_dir):
            status, body = self._get(port, "/wiki/alpha")
        self.assertEqual(status, 200)
        self.assertIn('class="wikilink"', body)
        self.assertIn("/wiki/beta", body)

    def test_h2_headings_are_in_page_anchors_not_virtual_pages(self) -> None:
        self._write("guide.md", "# Guide\n\nIntro.\n\n## Setup\n\nSetup content.\n\n## Usage\n\nUsage content.")
        for port in _serve_in_thread(self.wiki_dir):
            status, body = self._get(port, "/wiki/guide/setup")
            page_status, page_body = self._get(port, "/wiki/guide")
            self.assertEqual(status, 404)
            self.assertEqual(page_status, 200)
            self.assertIn('id="setup"', page_body)
            self.assertIn('id="usage"', page_body)

            status2, _ = self._get(port, "/wiki/guide/usage")
            self.assertEqual(status2, 404)

    def test_toc_h3_to_h6(self) -> None:
        self._write("doc.md", "# Doc\n\n## Section\n\n### Sub A\n\nContent A\n\n#### SubSub\n\nDeep.\n\n### Sub B\n\nContent B")
        for port in _serve_in_thread(self.wiki_dir):
            status, body = self._get(port, "/wiki/doc")
        self.assertEqual(status, 200)
        self.assertIn("On this page", body)
        self.assertIn("Sub A", body)
        self.assertIn("Sub B", body)
        self.assertIn("SubSub", body)
        self.assertIn("#sub-a", body)
        self.assertIn("#sub-b", body)
        self.assertIn("#subsub", body)

    def test_backlinks(self) -> None:
        self._write("alpha.md", "# Alpha\n\nLinks to [[beta]].")
        self._write("beta.md", "# Beta\n\nContent.")
        for port in _serve_in_thread(self.wiki_dir):
            status, body = self._get(port, "/wiki/beta")
        self.assertEqual(status, 200)
        self.assertIn("Backlinks", body)
        self.assertIn("Alpha", body)

    def test_frontmatter_metadata(self) -> None:
        self._write("page.md", "---\ntitle: My Page\ntype: Article\n---\n\n# My Page\n\nContent.")
        for port in _serve_in_thread(self.wiki_dir):
            status, body = self._get(port, "/wiki/page")
        self.assertEqual(status, 200)
        self.assertIn("Metadata", body)
        self.assertIn("My Page", body)
        self.assertIn("Article", body)

    def test_404(self) -> None:
        self._write("exists.md", "# Exists")
        for port in _serve_in_thread(self.wiki_dir):
            status, body = self._get(port, "/wiki/nonexistent")
        self.assertEqual(status, 404)

    def test_multiple_files_index(self) -> None:
        self._write("a.md", "# A Page")
        self._write("b.md", "# B Page")
        self._write("c.md", "# C Page")
        for port in _serve_in_thread(self.wiki_dir):
            status, body = self._get(port, "/")
        self.assertEqual(status, 200)
        for title in ["A Page", "B Page", "C Page"]:
            self.assertIn(title, body)
        for slug in ["a", "b", "c"]:
            self.assertIn(f"/wiki/{slug}", body)

    def test_no_wiki_dir(self) -> None:
        empty_dir = Path(self.tmpdir.name) / "empty"
        empty_dir.mkdir()
        site = build_site(empty_dir)
        self.assertEqual(len(site.pages), 0)

    def test_inline_css_present(self) -> None:
        self._write("style-test.md", "# Style")
        for port in _serve_in_thread(self.wiki_dir):
            _, body = self._get(port, "/")
        self.assertIn("<style>", body)

        for port in _serve_in_thread(self.wiki_dir):
            _, body = self._get(port, "/wiki/style-test")
        self.assertIn("<style>", body)

    def test_wikilinks_resolve_wiki_path(self) -> None:
        self._write("source.md", "# Source\n\nSee [[target-page]].")
        self._write("target-page.md", "# Target Page")
        for port in _serve_in_thread(self.wiki_dir):
            _, body = self._get(port, "/wiki/source")
        self.assertIn("/wiki/target-page", body)

    def test_case_preserved_routes_and_wikilinks(self) -> None:
        self._write("Source.md", "# Source\n\nSee [[Ethan_Davidson]].")
        self._write("Ethan_Davidson.md", "# Ethan Davidson")
        for port in _serve_in_thread(self.wiki_dir):
            status, body = self._get(port, "/wiki/Source")
            target_status, _ = self._get(port, "/wiki/Ethan_Davidson")
        self.assertEqual(status, 200)
        self.assertEqual(target_status, 200)
        self.assertIn("/wiki/Ethan_Davidson", body)

    def test_h1_page_as_full_document(self) -> None:
        self._write("full.md", "# Full Doc\n\nIntro.\n\n## Section A\n\nContent A.\n\n## Section B\n\nContent B.")
        for port in _serve_in_thread(self.wiki_dir):
            status, body = self._get(port, "/wiki/full")
        self.assertEqual(status, 200)
        self.assertIn("Full Doc", body)
        self.assertIn("Section A</h2>", body)
        self.assertIn("Section B</h2>", body)
        self.assertIn("Content A.", body)
        self.assertIn("Content B.", body)

    def test_page_without_frontmatter(self) -> None:
        self._write("plain.md", "# Plain Page\n\nJust content.")
        for port in _serve_in_thread(self.wiki_dir):
            status, body = self._get(port, "/wiki/plain")
        self.assertEqual(status, 200)
        self.assertIn("Plain Page", body)
        self.assertNotIn("Metadata", body)

    def test_index_empty_dir(self) -> None:
        for port in _serve_in_thread(self.wiki_dir):
            status, body = self._get(port, "/")
        self.assertEqual(status, 200)
        self.assertIn("All Pages", body)

    def test_serve_cli_help(self) -> None:
        runner = CliRunner()
        result = runner.invoke(main, ["serve", "--help"])
        self.assertEqual(result.exit_code, 0)
        self.assertIn("--host", result.output)
        self.assertIn("--port", result.output)
        self.assertIn("--base-url", result.output)

    def test_serve_cli_defaults(self) -> None:
        runner = CliRunner()
        result = runner.invoke(main, ["serve", "--help"])
        self.assertIn("[default: 8080]", result.output)
        self.assertIn("[default: 127.0.0.1]", result.output)
        self.assertIn("--base-url", result.output)


if __name__ == "__main__":
    unittest.main()
