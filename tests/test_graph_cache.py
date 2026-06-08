"""Tests for vault fingerprinting and in-process graph cache."""

from __future__ import annotations

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from wiki.config import WikiConfig
from wiki import graph as graph_module
from wiki.graph import load_graph, graph_stats
from wiki.graph_cache import (
    cache_dir,
    clear_all_process_graphs,
    disk_cache_path,
    get_process_graph,
    vault_fingerprint,
)


class TestGraphCache(unittest.TestCase):
    def setUp(self) -> None:
        clear_all_process_graphs()

    def tearDown(self) -> None:
        clear_all_process_graphs()

    def _config(self, wiki_dir: Path) -> WikiConfig:
        return WikiConfig(vault={"inputs": [wiki_dir]}, config_root=wiki_dir)

    def test_second_load_reuses_cached_graph(self) -> None:
        with TemporaryDirectory() as tmpdir:
            wiki_dir = Path(tmpdir)
            (wiki_dir / "page.md").write_text(
                "---\ntype: Person\ngivenName: Ada\n---\n",
                encoding="utf-8",
            )
            config = self._config(wiki_dir)

            g1 = load_graph(config, infer=False)
            self.assertGreater(graph_stats(g1)["triples"], 0)
            g2 = load_graph(config, infer=False)
            self.assertIs(g1, g2)

    def test_reload_rebuilds_graph(self) -> None:
        with TemporaryDirectory() as tmpdir:
            wiki_dir = Path(tmpdir)
            page = wiki_dir / "page.md"
            page.write_text("---\ntype: Person\ngivenName: Ada\n---\n", encoding="utf-8")
            config = self._config(wiki_dir)

            g1 = load_graph(config, infer=False)
            page.write_text("---\ntype: Person\ngivenName: Grace\n---\n", encoding="utf-8")
            g2 = load_graph(config, infer=False, reload=True)
            self.assertIsNot(g1, g2)

    def test_fingerprint_change_invalidates_cache_lookup(self) -> None:
        with TemporaryDirectory() as tmpdir:
            wiki_dir = Path(tmpdir)
            page = wiki_dir / "page.md"
            page.write_text("---\ntype: Person\ngivenName: Ada\n---\n", encoding="utf-8")
            config = self._config(wiki_dir)

            fp1 = vault_fingerprint(config)
            load_graph(config, infer=False)
            self.assertIsNotNone(get_process_graph(config, infer=False))

            page.write_text("---\ntype: Person\ngivenName: Grace\n---\n", encoding="utf-8")
            fp2 = vault_fingerprint(config)
            self.assertNotEqual(fp1, fp2)
            self.assertIsNone(get_process_graph(config, infer=False))

    def test_infer_and_asserted_caches_are_separate(self) -> None:
        with TemporaryDirectory() as tmpdir:
            wiki_dir = Path(tmpdir)
            (wiki_dir / "page.md").write_text(
                "---\ntype: Person\ngivenName: Ada\n---\n",
                encoding="utf-8",
            )
            config = self._config(wiki_dir)

            asserted = load_graph(config, infer=False)
            inferred = load_graph(config, infer=True)
            self.assertIsNot(asserted, inferred)
            self.assertGreaterEqual(graph_stats(inferred)["triples"], graph_stats(asserted)["triples"])
            self.assertIsNotNone(get_process_graph(config, infer=False))
            self.assertIsNotNone(get_process_graph(config, infer=True))

    def test_config_change_changes_fingerprint(self) -> None:
        with TemporaryDirectory() as tmpdir:
            wiki_dir = Path(tmpdir)
            (wiki_dir / "page.md").write_text(
                "---\ntype: Person\ngivenName: Ada\n---\n",
                encoding="utf-8",
            )
            config_a = WikiConfig(vault={"inputs": [wiki_dir]}, graph={"wiki_base": "https://a.example/"}, config_root=wiki_dir)
            config_b = WikiConfig(vault={"inputs": [wiki_dir]}, graph={"wiki_base": "https://b.example/"}, config_root=wiki_dir)

            self.assertNotEqual(vault_fingerprint(config_a), vault_fingerprint(config_b))

    def test_disk_cache_reuses_graph_across_cleared_process_cache(self) -> None:
        with TemporaryDirectory() as tmpdir:
            wiki_dir = Path(tmpdir)
            (wiki_dir / "page.md").write_text(
                "---\ntype: Person\ngivenName: Ada\n---\n",
                encoding="utf-8",
            )
            config = self._config(wiki_dir)

            g1 = load_graph(config, infer=False, disk_cache=True)
            self.assertGreater(graph_stats(g1)["triples"], 0)
            self.assertTrue(disk_cache_path(config, infer=False).exists())

            clear_all_process_graphs()
            with patch("wiki.graph._build_graph_from_vault", side_effect=AssertionError("should not rebuild vault graph")):
                g2 = load_graph(config, infer=False, disk_cache=True)
            self.assertEqual(graph_stats(g1), graph_stats(g2))

    def test_disk_cache_invalidation_rebuilds_after_vault_change(self) -> None:
        with TemporaryDirectory() as tmpdir:
            wiki_dir = Path(tmpdir)
            page = wiki_dir / "page.md"
            page.write_text("---\ntype: Person\ngivenName: Ada\n---\n", encoding="utf-8")
            config = self._config(wiki_dir)

            load_graph(config, infer=False, disk_cache=True)
            old_cache = disk_cache_path(config, infer=False)
            self.assertTrue(old_cache.exists())

            page.write_text("---\ntype: Person\ngivenName: Grace\n---\n", encoding="utf-8")
            clear_all_process_graphs()
            with patch("wiki.graph._build_graph_from_vault", wraps=graph_module._build_graph_from_vault) as wrapped_build:
                g2 = load_graph(config, infer=False, disk_cache=True)
                self.assertTrue(wrapped_build.called)
            self.assertGreater(graph_stats(g2)["triples"], 0)
            self.assertFalse(old_cache.exists())

    def test_reload_clears_current_disk_cache_entry(self) -> None:
        with TemporaryDirectory() as tmpdir:
            wiki_dir = Path(tmpdir)
            (wiki_dir / "page.md").write_text(
                "---\ntype: Person\ngivenName: Ada\n---\n",
                encoding="utf-8",
            )
            config = self._config(wiki_dir)

            load_graph(config, infer=False, disk_cache=True)
            cache_path = disk_cache_path(config, infer=False)
            self.assertTrue(cache_path.exists())

            load_graph(config, infer=False, disk_cache=True, reload=True)
            self.assertTrue(cache_path.exists())
            self.assertTrue(cache_dir(config).exists())


if __name__ == "__main__":
    unittest.main()
