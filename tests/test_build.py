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


if __name__ == "__main__":
    unittest.main()
