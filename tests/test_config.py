import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
import yaml
from rdflib import Graph, Namespace

from wiki_cli.config import Context, WikiConfig, DEFAULT_NAMESPACES


class TestContext(unittest.TestCase):
    def test_context_default_initialization(self) -> None:
        """Test Context is initialized with default namespaces when none are passed."""
        context = Context()
        self.assertIn("schema", context.namespaces)
        self.assertEqual(context.namespaces["schema"], DEFAULT_NAMESPACES["schema"])

    def test_context_custom_initialization(self) -> None:
        """Test Context correctly registers custom namespace mappings."""
        custom_prefixes = {
            "ex": "http://example.org/",
            "another": Namespace("http://another.org/")
        }
        context = Context(custom_prefixes)
        self.assertIn("ex", context.namespaces)
        self.assertIn("another", context.namespaces)
        self.assertEqual(str(context.namespaces["ex"]), "http://example.org/")
        self.assertEqual(context.namespaces["another"], Namespace("http://another.org/"))

    def test_context_bind_namespaces(self) -> None:
        """Test Context binds registered namespaces to an RDFLib Graph."""
        context = Context({"ex": "http://example.org/"})
        graph = Graph()
        context.bind_namespaces(graph)
        
        # Verify ex is bound
        namespaces = dict(graph.namespaces())
        self.assertIn("ex", namespaces)
        self.assertEqual(str(namespaces["ex"]), "http://example.org/")


class TestWikiConfig(unittest.TestCase):
    def test_wikiconfig_default_init(self) -> None:
        """Test WikiConfig has proper defaults."""
        config = WikiConfig()
        self.assertEqual(config.input_dirs, [Path("wiki")])
        self.assertFalse(config.uri_ext)
        self.assertEqual(config.check.get("filenameStyle"), "warning")
        self.assertIsNotNone(config.context)

    def test_wikiconfig_load_no_files(self) -> None:
        """Test WikiConfig.load falls back to defaults when no files exist."""
        with TemporaryDirectory() as tmpdir:
            config = WikiConfig.load(Path(tmpdir))
            self.assertEqual(config.input_dirs, [Path("wiki")])

    def test_wikiconfig_load_yaml(self) -> None:
        """Test WikiConfig.load correctly parses wiki.yaml."""
        with TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)
            yaml_content = {
                "input_dirs": "custom_wiki",
                "check": {
                    "filenameStyle": "error"
                },
                "context": {
                    "custom_pref": "http://custom-pref.org/"
                }
            }
            (base_path / "wiki.yaml").write_text(yaml.dump(yaml_content), encoding="utf-8")
            
            config = WikiConfig.load(base_path)
            self.assertEqual(config.input_dirs, [base_path.absolute() / "custom_wiki"])
            self.assertEqual(config.check.get("filenameStyle"), "error")
            self.assertIn("custom_pref", config.namespaces)

    def test_wikiconfig_load_json(self) -> None:
        """Test WikiConfig.load correctly parses wiki.json."""
        with TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)
            json_content = {
                "inputDirs": "json_wiki",
                "@context": {
                    "json_pref": "http://json-pref.org/"
                }
            }
            (base_path / "wiki.json").write_text(json.dumps(json_content), encoding="utf-8")
            
            config = WikiConfig.load(base_path)
            self.assertEqual(config.input_dirs, [base_path.absolute() / "json_wiki"])
            self.assertIn("json_pref", config.namespaces)

    def test_wikiconfig_load_invalid_syntax_fallback(self) -> None:
        """Test WikiConfig.load falls back to defaults when config has invalid syntax."""
        with TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)
            # Write invalid yaml
            (base_path / "wiki.yaml").write_text("[invalid_yaml", encoding="utf-8")
            
            config = WikiConfig.load(base_path)
            self.assertEqual(config.input_dirs, [Path("wiki")])


if __name__ == "__main__":
    unittest.main()
