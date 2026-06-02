"""Tests for vault fingerprinting and in-process graph cache."""

from __future__ import annotations

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from wiki.config import WikiConfig
from wiki.graph import load_graph, graph_stats
from wiki.graph_cache import (
    clear_all_process_graphs,
    get_process_graph,
    vault_fingerprint,
)


class TestGraphCache(unittest.TestCase):
    def setUp(self) -> None:
        clear_all_process_graphs()

    def tearDown(self) -> None:
        clear_all_process_graphs()

    def _config(self, wiki_dir: Path) -> WikiConfig:
        return WikiConfig(input_dirs=[wiki_dir], config_root=wiki_dir)

    def test_second_load_reuses_cached_graph(self) -> None:
        with TemporaryDirectory() as tmpdir:
            wiki_dir = Path(tmpdir)
            (wiki_dir / "page.md").write_text(
                "---\ntype: Person\nname: Ada\n---\n",
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
            page.write_text("---\ntype: Person\nname: Ada\n---\n", encoding="utf-8")
            config = self._config(wiki_dir)

            g1 = load_graph(config, infer=False)
            page.write_text("---\ntype: Person\nname: Grace\n---\n", encoding="utf-8")
            g2 = load_graph(config, infer=False, reload=True)
            self.assertIsNot(g1, g2)

    def test_fingerprint_change_invalidates_cache_lookup(self) -> None:
        with TemporaryDirectory() as tmpdir:
            wiki_dir = Path(tmpdir)
            page = wiki_dir / "page.md"
            page.write_text("---\ntype: Person\nname: Ada\n---\n", encoding="utf-8")
            config = self._config(wiki_dir)

            fp1 = vault_fingerprint(config)
            load_graph(config, infer=False)
            self.assertIsNotNone(get_process_graph(config, infer=False))

            page.write_text("---\ntype: Person\nname: Grace\n---\n", encoding="utf-8")
            fp2 = vault_fingerprint(config)
            self.assertNotEqual(fp1, fp2)
            self.assertIsNone(get_process_graph(config, infer=False))

    def test_infer_and_asserted_caches_are_separate(self) -> None:
        with TemporaryDirectory() as tmpdir:
            wiki_dir = Path(tmpdir)
            (wiki_dir / "page.md").write_text(
                "---\ntype: Person\nname: Ada\n---\n",
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
                "---\ntype: Person\nname: Ada\n---\n",
                encoding="utf-8",
            )
            config_a = WikiConfig(input_dirs=[wiki_dir], config_root=wiki_dir, wiki_base="https://a.example/")
            config_b = WikiConfig(input_dirs=[wiki_dir], config_root=wiki_dir, wiki_base="https://b.example/")

            self.assertNotEqual(vault_fingerprint(config_a), vault_fingerprint(config_b))


if __name__ == "__main__":
    unittest.main()
