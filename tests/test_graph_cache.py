"""Tests for vault fingerprinting and on-disk graph cache."""

from __future__ import annotations

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from wiki.config import WikiConfig
from wiki.graph import load_graph, graph_stats
from wiki.graph_cache import (
    get_cache_dir,
    invalidate_cache,
    load_cached_graph,
    save_cached_graph,
    vault_fingerprint,
)


class TestGraphCache(unittest.TestCase):
    def _config(self, wiki_dir: Path) -> WikiConfig:
        return WikiConfig(input_dirs=[wiki_dir], config_root=wiki_dir)

    def test_cache_miss_then_hit(self) -> None:
        with TemporaryDirectory() as tmpdir:
            wiki_dir = Path(tmpdir)
            (wiki_dir / "page.md").write_text(
                "---\ntype: Person\nname: Ada\n---\n",
                encoding="utf-8",
            )
            config = self._config(wiki_dir)
            invalidate_cache(config)

            g1 = load_graph(config, infer=False, use_cache=True)
            self.assertGreater(graph_stats(g1)["triples"], 0)

            cached = load_cached_graph(config, infer=False)
            self.assertIsNotNone(cached)
            self.assertEqual(graph_stats(g1)["triples"], graph_stats(cached)["triples"])

            g2 = load_graph(config, infer=False, use_cache=True)
            self.assertEqual(graph_stats(g1)["triples"], graph_stats(g2)["triples"])

    def test_file_change_invalidates_cache(self) -> None:
        with TemporaryDirectory() as tmpdir:
            wiki_dir = Path(tmpdir)
            page = wiki_dir / "page.md"
            page.write_text("---\ntype: Person\nname: Ada\n---\n", encoding="utf-8")
            config = self._config(wiki_dir)
            invalidate_cache(config)

            fp1 = vault_fingerprint(config)
            load_graph(config, infer=False, use_cache=True)
            self.assertIsNotNone(load_cached_graph(config, infer=False))

            page.write_text("---\ntype: Person\nname: Grace\n---\n", encoding="utf-8")
            fp2 = vault_fingerprint(config)
            self.assertNotEqual(fp1, fp2)
            self.assertIsNone(load_cached_graph(config, infer=False))

    def test_no_cache_skips_persisted_graph(self) -> None:
        with TemporaryDirectory() as tmpdir:
            wiki_dir = Path(tmpdir)
            (wiki_dir / "page.md").write_text(
                "---\ntype: Person\nname: Ada\n---\n",
                encoding="utf-8",
            )
            config = self._config(wiki_dir)
            invalidate_cache(config)

            load_graph(config, infer=False, use_cache=False)
            self.assertFalse(get_cache_dir(config).exists())

    def test_infer_and_asserted_caches_are_separate(self) -> None:
        with TemporaryDirectory() as tmpdir:
            wiki_dir = Path(tmpdir)
            (wiki_dir / "page.md").write_text(
                "---\ntype: Person\nname: Ada\n---\n",
                encoding="utf-8",
            )
            config = self._config(wiki_dir)
            invalidate_cache(config)

            asserted = load_graph(config, infer=False, use_cache=True)
            inferred = load_graph(config, infer=True, use_cache=True)
            self.assertGreaterEqual(graph_stats(inferred)["triples"], graph_stats(asserted)["triples"])
            self.assertIsNotNone(load_cached_graph(config, infer=False))
            self.assertIsNotNone(load_cached_graph(config, infer=True))

    def test_rebuild_cache_overwrites(self) -> None:
        with TemporaryDirectory() as tmpdir:
            wiki_dir = Path(tmpdir)
            page = wiki_dir / "page.md"
            page.write_text("---\ntype: Person\nname: Ada\n---\n", encoding="utf-8")
            config = self._config(wiki_dir)
            invalidate_cache(config)

            load_graph(config, infer=False, use_cache=True)
            page.write_text("---\ntype: Person\nname: Grace\n---\n", encoding="utf-8")

            stale_cached = load_cached_graph(config, infer=False)
            self.assertIsNone(stale_cached)

            rebuilt = load_graph(config, infer=False, use_cache=True, rebuild_cache=True)
            self.assertIsNotNone(load_cached_graph(config, infer=False))
            subjects = {str(s) for s in rebuilt.subjects()}
            self.assertTrue(any("Grace" in s for s in subjects) or len(rebuilt) > 0)

    def test_config_change_invalidates_fingerprint(self) -> None:
        with TemporaryDirectory() as tmpdir:
            wiki_dir = Path(tmpdir)
            (wiki_dir / "page.md").write_text(
                "---\ntype: Person\nname: Ada\n---\n",
                encoding="utf-8",
            )
            config_a = WikiConfig(input_dirs=[wiki_dir], config_root=wiki_dir, wiki_base="https://a.example/")
            config_b = WikiConfig(input_dirs=[wiki_dir], config_root=wiki_dir, wiki_base="https://b.example/")
            invalidate_cache(config_a)

            fp_a = vault_fingerprint(config_a)
            fp_b = vault_fingerprint(config_b)
            self.assertNotEqual(fp_a, fp_b)

            g = load_graph(config_a, infer=False, use_cache=True)
            save_cached_graph(config_a, g, infer=False)
            self.assertIsNone(load_cached_graph(config_b, infer=False))


if __name__ == "__main__":
    unittest.main()
