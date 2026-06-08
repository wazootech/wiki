import json
import os
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
import yaml
from rdflib import Graph, Namespace

from wiki.config import Context, WikiConfig, DEFAULT_CHECK_RULES, DEFAULT_LINT_RULES, DEFAULT_NAMESPACES


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
        self.assertEqual(config.asset_dirs, [])
        self.assertFalse(config.uri_ext)
        self.assertEqual(config.base_url, "/wiki")
        self.assertEqual(config.url_style, "dir")
        self.assertIsNone(config.filename_pattern)
        self.assertEqual(config.check, DEFAULT_CHECK_RULES)
        self.assertEqual(config.lint, DEFAULT_LINT_RULES)
        self.assertIsNotNone(config.context)
        self.assertFalse(config.sparql_service_enabled)
        self.assertEqual(config.sparql_service_path, "/api/sparql")
        self.assertEqual(config.link_style, "markdown")

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
                "asset_dirs": ["assets", "media/photos"],
                "exclude": ["wiki/drafts/**", "assets/private/**"],
                "check": {
                    "missing_layout_file": "error"
                },
                "lint": {
                    "broken_links": "error",
                    "filename_pattern": "error"
                },
                "filename_pattern": "[A-Za-z0-9_()-]+\\.md",
                "base_url": "/docs",
                "url_style": "file",
                "sparql_service": {"enabled": False, "path": "/sparql"},
                "context": {
                    "custom_pref": "http://custom-pref.org/"
                }
            }
            (base_path / "wiki.yaml").write_text(yaml.dump(yaml_content), encoding="utf-8")
            
            config = WikiConfig.load(base_path)
            self.assertEqual(config.input_dirs, [base_path.absolute() / "custom_wiki"])
            self.assertEqual(config.asset_dirs, [base_path.absolute() / "assets", base_path.absolute() / "media/photos"])
            self.assertEqual(config.exclude, ["wiki/drafts/**", "assets/private/**"])
            self.assertEqual(config.check.get("missing_layout_file"), "error")
            self.assertEqual(config.lint.get("broken_links"), "error")
            self.assertEqual(config.lint.get("filename_pattern"), "error")
            self.assertEqual(config.filename_pattern, "[A-Za-z0-9_()-]+\\.md")
            self.assertEqual(config.base_url, "/docs")
            self.assertEqual(config.url_style, "file")
            self.assertFalse(config.sparql_service_enabled)
            self.assertEqual(config.sparql_service_path, "/sparql")
            self.assertIn("custom_pref", config.namespaces)

    def test_wikiconfig_load_link_style(self) -> None:
        with TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)
            (base_path / "wiki.yaml").write_text("link_style: markdown\n", encoding="utf-8")
            config = WikiConfig.load(base_path)
            self.assertEqual(config.link_style, "markdown")

    def test_wikiconfig_rejects_invalid_link_style(self) -> None:
        with self.assertRaisesRegex(ValueError, "Invalid link_style"):
            WikiConfig(link_style="obsidian")

    def test_wikiconfig_load_json(self) -> None:
        """Test WikiConfig.load correctly parses wiki.json."""
        with TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)
            json_content = {
                "input_dirs": "json_wiki",
                "@context": {
                    "json_pref": "http://json-pref.org/"
                }
            }
            (base_path / "wiki.json").write_text(json.dumps(json_content), encoding="utf-8")
            
            config = WikiConfig.load(base_path)
            self.assertEqual(config.input_dirs, [base_path.absolute() / "json_wiki"])
            self.assertIn("json_pref", config.namespaces)

    def test_wikiconfig_load_camel_case_top_level_keys_raise_error(self) -> None:
        with TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)
            yaml_content = {
                "inputDirs": "camel_wiki",
                "assetDirs": ["assets"],
                "wikiBase": "https://example.org/wiki/",
                "baseUrl": "/docs",
                "urlStyle": "file",
                "contentPredicate": "schema:text",
                "uriExt": True,
                "filenamePattern": "[a-z]+",
                "serveApi": {"enabled": True, "path": "/sparql"},
            }
            (base_path / "assets").mkdir()
            (base_path / "wiki.yaml").write_text(yaml.dump(yaml_content), encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "unknown top-level keys"):
                WikiConfig.load(base_path)

    def test_wikiconfig_load_unknown_check_keys_raise_error(self) -> None:
        with TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)
            (base_path / "wiki.yaml").write_text(
                yaml.dump({"input_dirs": "wiki", "check": {"brokenLinks": "error"}}),
                encoding="utf-8",
            )

            with self.assertRaisesRegex(ValueError, "unknown check keys"):
                WikiConfig.load(base_path)

    def test_wikiconfig_load_unknown_sparql_service_keys_raise_error(self) -> None:
        with TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)
            (base_path / "wiki.yaml").write_text(
                yaml.dump({"input_dirs": "wiki", "sparql_service": {"enable": True}}),
                encoding="utf-8",
            )

            with self.assertRaisesRegex(ValueError, "unknown sparql_service keys"):
                WikiConfig.load(base_path)

    def test_wikiconfig_rejects_renamed_serve_api_key(self) -> None:
        with TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)
            (base_path / "wiki.yaml").write_text(
                yaml.dump({"input_dirs": "wiki", "serve_api": {"enabled": True}}),
                encoding="utf-8",
            )

            with self.assertRaisesRegex(ValueError, "serve_api was renamed to sparql_service"):
                WikiConfig.load(base_path)

    def test_wikiconfig_default_asset_dir_when_present(self) -> None:
        with TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)
            (base_path / "assets").mkdir()
            (base_path / "wiki.yaml").write_text("input_dirs: wiki\n", encoding="utf-8")

            config = WikiConfig.load(base_path)
            self.assertEqual(config.asset_dirs, [base_path.absolute() / "assets"])

    def test_wikiconfig_exclude_matches_config_root_relative_paths(self) -> None:
        with TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir).absolute()
            config = WikiConfig(config_root=base_path, exclude=["wiki/drafts/**", "**/.env*"])

            self.assertTrue(config.is_excluded(base_path / "wiki" / "drafts" / "note.md"))
            self.assertTrue(config.is_excluded(base_path / "assets" / ".env.local"))
            self.assertFalse(config.is_excluded(base_path / "wiki" / "published.md"))

    def test_wikiconfig_load_rejects_legacy_check_keys(self) -> None:
        with TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)
            (base_path / "wiki.yaml").write_text(
                yaml.dump(
                    {
                        "input_dirs": "wiki",
                        "check": {"filename_pattern": "warning", "broken_links": "warning"},
                    }
                ),
                encoding="utf-8",
            )

            with self.assertRaisesRegex(ValueError, "unknown check keys"):
                WikiConfig.load(base_path)

    def test_wikiconfig_rejects_legacy_check_keys_at_init(self) -> None:
        with self.assertRaisesRegex(ValueError, "Invalid check keys"):
            WikiConfig(check={"filename_pattern": "[A-Za-z]+"})

    def test_wikiconfig_load_lint_broken_links(self) -> None:
        with TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)
            (base_path / "wiki.yaml").write_text(
                yaml.dump({"input_dirs": "wiki", "lint": {"broken_links": "error"}}),
                encoding="utf-8",
            )

            config = WikiConfig.load(base_path)
            self.assertEqual(config.lint.get("broken_links"), "error")

    def test_wikiconfig_load_unknown_lint_keys_raise_error(self) -> None:
        with TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)
            (base_path / "wiki.yaml").write_text(
                yaml.dump({"input_dirs": "wiki", "lint": {"brokenLinks": "error"}}),
                encoding="utf-8",
            )

            with self.assertRaisesRegex(ValueError, "unknown lint keys"):
                WikiConfig.load(base_path)

    def test_wikiconfig_rejects_check_broken_links_at_init(self) -> None:
        with self.assertRaisesRegex(ValueError, "Invalid check keys: broken_links"):
            WikiConfig(check={"broken_links": "error"})

    def test_wikiconfig_invalid_severity_raises(self) -> None:
        with self.assertRaisesRegex(ValueError, "Invalid lint.broken_links severity"):
            WikiConfig(lint={"broken_links": "maybe"})

    def test_wikiconfig_load_invalid_syntax_raises_error(self) -> None:
        """Test WikiConfig.load raises on config syntax errors."""
        with TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)
            (base_path / "wiki.yaml").write_text("[invalid_yaml", encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "Failed to load config file wiki.yaml"):
                WikiConfig.load(base_path)

    def test_wikiconfig_load_inline_fmt(self) -> None:
        with TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)
            (base_path / "wiki.yaml").write_text(
                yaml.dump(
                    {
                        "input_dirs": "wiki",
                        "fmt": {
                            "wrap": "no",
                            "extensions": ["gfm", "frontmatter", "wikilink"],
                        },
                    }
                ),
                encoding="utf-8",
            )
            config = WikiConfig.load(base_path)
            self.assertIsInstance(config.fmt, dict)
            self.assertEqual(config.fmt["wrap"], "no")

    def test_wikiconfig_load_fmt_pointer_relative(self) -> None:
        with TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)
            (base_path / "wiki.yaml").write_text(
                yaml.dump({"input_dirs": "wiki", "fmt": "custom.toml"}),
                encoding="utf-8",
            )
            config = WikiConfig.load(base_path)
            self.assertEqual(config.fmt, base_path / "custom.toml")

    def test_wikiconfig_rejects_absolute_fmt_path(self) -> None:
        absolute_fmt = (
            "C:/etc/mdformat.toml" if os.name == "nt" else "/etc/mdformat.toml"
        )
        with TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)
            (base_path / "wiki.yaml").write_text(
                yaml.dump({"input_dirs": "wiki", "fmt": absolute_fmt}),
                encoding="utf-8",
            )
            with self.assertRaisesRegex(ValueError, "fmt path must be relative"):
                WikiConfig.load(base_path)

    def test_wikiconfig_rejects_invalid_fmt_type(self) -> None:
        with TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)
            (base_path / "wiki.yaml").write_text(
                yaml.dump({"input_dirs": "wiki", "fmt": True}),
                encoding="utf-8",
            )
            with self.assertRaisesRegex(ValueError, "fmt must be a mapping or path string"):
                WikiConfig.load(base_path)

    def test_wikiconfig_rejects_unknown_inline_fmt_key(self) -> None:
        with TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)
            (base_path / "wiki.yaml").write_text(
                yaml.dump({"input_dirs": "wiki", "fmt": {"typo_key": True}}),
                encoding="utf-8",
            )
            with self.assertRaisesRegex(ValueError, "Invalid key 'typo_key'"):
                WikiConfig.load(base_path)

    def test_wikiconfig_load_inline_fmt_from_json(self) -> None:
        with TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)
            (base_path / "wiki.json").write_text(
                json.dumps(
                    {
                        "input_dirs": ["wiki"],
                        "fmt": {
                            "wrap": "no",
                            "extensions": ["gfm", "frontmatter", "wikilink"],
                        },
                    }
                ),
                encoding="utf-8",
            )
            config = WikiConfig.load(base_path)
            self.assertIsInstance(config.fmt, dict)
            self.assertEqual(config.fmt["extensions"], ["gfm", "frontmatter", "wikilink"])


if __name__ == "__main__":
    unittest.main()
