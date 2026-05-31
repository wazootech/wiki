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
            (root / "wiki.yaml").write_text("inputDirs: wiki\nassetDirs: assets\n", encoding="utf-8")
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
            (root / "wiki.yaml").write_text("inputDirs: wiki\ncheck:\n  internalLinks: error\n", encoding="utf-8")
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
            (root / "wiki.yaml").write_text("inputDirs: wiki\ncheck:\n  internalLinks: error\n", encoding="utf-8")
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
            (root / "wiki.yaml").write_text("inputDirs: wiki\n", encoding="utf-8")
            (wiki / "index.md").write_text("# Custom Home\n\nWelcome.", encoding="utf-8")
            (wiki / "Page.md").write_text("# Page", encoding="utf-8")

            result = runner.invoke(main, ["--config", str(root), "build", "--output-dir", str(output_dir)])

            self.assertEqual(result.exit_code, 0, result.output)
            index_content = (output_dir / "wiki" / "index.html").read_text(encoding="utf-8")
            self.assertIn("Custom Home", index_content)
            self.assertNotIn("All Pages", index_content)


if __name__ == "__main__":
    unittest.main()
