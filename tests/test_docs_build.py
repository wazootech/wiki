import importlib.util
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory


def _load_docs_build_module():
    build_path = Path(__file__).resolve().parents[1] / "docs" / "build.py"
    spec = importlib.util.spec_from_file_location("docs_build", build_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("Could not load docs/build.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class TestDocsBuild(unittest.TestCase):
    def test_redirect_pages_do_not_poison_following_page_layouts(self) -> None:
        docs_build = _load_docs_build_module()

        with TemporaryDirectory() as tmpdir:
            output_dir = Path(tmpdir) / "_site"

            docs_build.build(output_dir)

            redirect_html = (output_dir / "Wiki_CLI" / "index.html").read_text(encoding="utf-8")
            self.assertIn('http-equiv="refresh" content="0; url=/wiki/"', redirect_html)

            wiki_html = (output_dir / "wiki" / "index.html").read_text(encoding="utf-8")
            self.assertIn("This page is the", wiki_html)
            self.assertNotIn('http-equiv="refresh"', wiki_html)
            self.assertNotIn("Redirecting to", wiki_html)


if __name__ == "__main__":
    unittest.main()
