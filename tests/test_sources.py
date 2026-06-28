import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

import yaml

from wiki.config import Config
from wiki.schemas.sources import LOCKFILE_FILENAME, LockedSource, Lockfile, SourceConfig


class TestSourceConfig(unittest.TestCase):
    def test_minimal_source(self) -> None:
        source = SourceConfig(name="test", type="git", url="https://example.com/repo.git")
        self.assertEqual(source.name, "test")
        self.assertEqual(source.type, "git")
        self.assertEqual(source.url, "https://example.com/repo.git")
        self.assertIsNone(source.ref)
        self.assertIsNone(source.path)
        self.assertIsNone(source.description)

    def test_full_source(self) -> None:
        source = SourceConfig(
            name="test",
            type="git",
            url="https://example.com/repo.git",
            ref="v1.0.0",
            path="wiki",
            description="My source",
        )
        self.assertEqual(source.ref, "v1.0.0")
        self.assertEqual(source.path, "wiki")
        self.assertEqual(source.description, "My source")

    def test_rejects_extra_fields(self) -> None:
        with self.assertRaises(ValueError):
            SourceConfig(name="test", type="git", url="https://example.com/repo.git", unknown="bad")

    def test_rejects_invalid_type(self) -> None:
        with self.assertRaises(ValueError):
            SourceConfig(name="test", type="http", url="https://example.com/repo.git")


class TestLockfile(unittest.TestCase):
    def test_empty_lockfile(self) -> None:
        lf = Lockfile()
        self.assertEqual(lf.version, 1)
        self.assertEqual(lf.sources, {})

    def test_load_non_existent(self) -> None:
        lf = Lockfile.load(Path("/nonexistent/wiki.lock"))
        self.assertEqual(lf.sources, {})

    def test_save_and_load_roundtrip(self) -> None:
        with TemporaryDirectory() as tmpdir:
            lock_path = Path(tmpdir) / "wiki.lock"
            lf = Lockfile(
                sources={
                    "test": LockedSource(
                        url="https://example.com/repo.git",
                        resolved_ref="abc123def456",
                        ref="v1.0.0",
                        content_hash="xyz789",
                        fetched_at="2025-01-01T00:00:00+00:00",
                    )
                }
            )
            lf.save(lock_path)
            self.assertTrue(lock_path.exists())

            loaded = Lockfile.load(lock_path)
            self.assertEqual(loaded.version, 1)
            self.assertIn("test", loaded.sources)
            self.assertEqual(loaded.sources["test"].url, "https://example.com/repo.git")
            self.assertEqual(loaded.sources["test"].resolved_ref, "abc123def456")
            self.assertEqual(loaded.sources["test"].ref, "v1.0.0")

    def test_load_corrupted(self) -> None:
        with TemporaryDirectory() as tmpdir:
            lock_path = Path(tmpdir) / "wiki.lock"
            lock_path.write_text("{invalid json", encoding="utf-8")
            lf = Lockfile.load(lock_path)
            self.assertEqual(lf.sources, {})


class TestConfigSources(unittest.TestCase):
    def test_sources_list_syntax(self) -> None:
        config = Config(
            config_root=Path("."),
            sources=[
                {"name": "src1", "type": "git", "url": "https://example.com/a.git"},
                {"name": "src2", "type": "git", "url": "https://example.com/b.git"},
            ],
        )
        self.assertEqual(len(config.sources), 2)
        self.assertEqual(config.sources[0].name, "src1")
        self.assertEqual(config.sources[1].name, "src2")

    def test_sources_dict_syntax(self) -> None:
        config = Config(
            config_root=Path("."),
            sources={
                "src1": {"type": "git", "url": "https://example.com/a.git"},
                "src2": {"type": "git", "url": "https://example.com/b.git"},
            },
        )
        self.assertEqual(len(config.sources), 2)
        names = {s.name for s in config.sources}
        self.assertIn("src1", names)
        self.assertIn("src2", names)

    def test_sources_none(self) -> None:
        config = Config(config_root=Path("."))
        self.assertEqual(config.sources, [])

    def test_sources_rejects_duplicate_names(self) -> None:
        with self.assertRaises(ValueError):
            Config(
                config_root=Path("."),
                sources=[
                    {"name": "src1", "type": "git", "url": "https://example.com/a.git"},
                    {"name": "src1", "type": "git", "url": "https://example.com/b.git"},
                ],
            )

    def test_sources_loaded_from_yaml(self) -> None:
        with TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)
            yaml_content = {
                "wiki": {"inputs": "wiki"},
                "sources": [
                    {"name": "taxonomy", "type": "git", "url": "https://example.com/taxonomy.git", "ref": "v1.0"},
                    {"name": "community", "type": "git", "url": "https://example.com/community.git"},
                ],
            }
            (base_path / "wiki.yaml").write_text(yaml.dump(yaml_content), encoding="utf-8")
            config = Config.load(base_path)
            self.assertEqual(len(config.sources), 2)
            self.assertEqual(config.sources[0].name, "taxonomy")
            self.assertEqual(config.sources[0].ref, "v1.0")
            self.assertEqual(config.sources[1].name, "community")

    def test_sources_unknown_keys_rejected(self) -> None:
        with TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)
            (base_path / "wiki.yaml").write_text(
                yaml.dump({
                    "wiki": {"inputs": "wiki"},
                    "sources": [{"name": "bad", "type": "git", "url": "https://x.com", "extra_key": True}],
                }),
                encoding="utf-8",
            )
            with self.assertRaises(ValueError):
                Config.load(base_path)

    def test_sources_unknown_type_rejected(self) -> None:
        with TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)
            (base_path / "wiki.yaml").write_text(
                yaml.dump({
                    "wiki": {"inputs": "wiki"},
                    "sources": [{"name": "bad", "type": "sparql", "url": "https://x.com/sparql"}],
                }),
                encoding="utf-8",
            )
            with self.assertRaises(ValueError):
                Config.load(base_path)


if __name__ == "__main__":
    unittest.main()
