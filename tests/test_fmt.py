import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

import mdformat
from click.testing import CliRunner

from wiki.cli import main


class TestWikiFmt(unittest.TestCase):
    def test_mdformat_preserves_wikilinks(self) -> None:
        """Test that mdformat with our plugin preserves Obsidian-style wikilinks."""
        # Simple wikilink
        content = "See [[Wiki_CLI]] for details."
        formatted = mdformat.text(content, extensions=["wikilink", "frontmatter", "gfm"])
        self.assertEqual(formatted.strip(), "See [[Wiki_CLI]] for details.")

        # Wikilink with alias/display name
        content_alias = "See [[Wiki_CLI|the CLI]] for details."
        formatted_alias = mdformat.text(content_alias, extensions=["wikilink", "frontmatter", "gfm"])
        self.assertEqual(formatted_alias.strip(), "See [[Wiki_CLI|the CLI]] for details.")

    def test_mdformat_aligns_tables(self) -> None:
        """Test that mdformat aligns and pads markdown tables with spaces."""
        unaligned = "| LongHeader | Short |\n|---|---|\n| cell | verylongcell |\n"
        expected = "| LongHeader | Short        |\n| ---------- | ------------ |\n| cell       | verylongcell |\n"
        formatted = mdformat.text(unaligned, extensions=["wikilink", "frontmatter", "gfm"])
        self.assertEqual(formatted, expected)

    def test_cli_fmt_in_place(self) -> None:
        """Test that the wiki fmt command reformats files in place."""
        runner = CliRunner()
        with TemporaryDirectory() as tmpdir:
            wiki_dir = Path(tmpdir)
            file_path = wiki_dir / "unformatted.md"
            # Write unformatted markdown (extra spacing and unformatted headers)
            file_path.write_text(
                "---\ntype: schema:WebPage\nname: Test\n---\n\n# Header\n\nSome text  \nwith extra spaces.\n",
                encoding="utf-8"
            )

            result = runner.invoke(main, ["--input-dir", str(wiki_dir), "fmt", "-v"])
            self.assertEqual(result.exit_code, 0)
            self.assertIn("Formatted unformatted.md", result.output)

            # Check that the file was indeed formatted (extra trailing spaces stripped)
            formatted_content = file_path.read_text(encoding="utf-8")
            self.assertNotIn("Some text  \n", formatted_content)

    def test_cli_fmt_check(self) -> None:
        """Test that wiki fmt --check flags unformatted files and passes on formatted ones."""
        runner = CliRunner()
        with TemporaryDirectory() as tmpdir:
            wiki_dir = Path(tmpdir)
            file_path = wiki_dir / "unformatted.md"
            file_path.write_text(
                "---\ntype: schema:WebPage\nname: Test\n---\n\n# Header\n\nSome text  \n",
                encoding="utf-8"
            )

            # 1. Run with --check: should fail since it's not formatted
            result_stale = runner.invoke(main, ["--input-dir", str(wiki_dir), "fmt", "--check", "-v"])
            self.assertEqual(result_stale.exit_code, 1)
            self.assertIn("Error: The following files are not correctly formatted:", result_stale.output)
            self.assertIn("unformatted.md", result_stale.output)

            # File should be unmodified
            self.assertEqual(file_path.read_text(encoding="utf-8"), "---\ntype: schema:WebPage\nname: Test\n---\n\n# Header\n\nSome text  \n")

            # 2. Run without --check to format it
            runner.invoke(main, ["--input-dir", str(wiki_dir), "fmt"])

            # 3. Run with --check again: should succeed
            result_clean = runner.invoke(main, ["--input-dir", str(wiki_dir), "fmt", "--check", "-v"])
            self.assertEqual(result_clean.exit_code, 0)
            self.assertIn("All files are correctly formatted.", result_clean.output)


if __name__ == "__main__":
    unittest.main()
