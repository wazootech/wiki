"""Tests for inline SPARQL block rendering."""

from __future__ import annotations

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from wiki.config import WikiConfig
from wiki.graph import load_graph
from wiki.render import render_markdown_files


class RenderMarkdownFilesTest(unittest.TestCase):
    def test_render_preserves_query_fence_formatting(self) -> None:
        """Render should update only the result table, not the fenced SPARQL query."""
        with TemporaryDirectory() as tmpdir:
            wiki_dir = Path(tmpdir)
            page = wiki_dir / "commands.md"
            page.write_text(
                """---
type: Person
givenName: Alice
familyName: Smith
---
<!-- sparql:start -->

```sparql
SELECT ?givenName WHERE {
  ?s <https://schema.org/givenName> ?givenName .
  FILTER(STRSTARTS(STR(?s), "https://wiki.example.org/"))
}
```
<!-- sparql:end -->
""",
                encoding="utf-8",
            )
            config = WikiConfig(
                input_dirs=[wiki_dir],
                config_root=wiki_dir,
                wiki_base="https://wiki.example.org/",
            )
            graph = load_graph(config, infer=False)

            render_markdown_files(config, graph, file_filter=page)
            rendered = page.read_text(encoding="utf-8")

            self.assertIn("  ?s <https://schema.org/givenName> ?givenName .", rendered)
            self.assertRegex(rendered, r"\| givenName\s+\|")
            self.assertIn("Alice", rendered)

            _, _, stale = render_markdown_files(config, graph, dry_run=True, file_filter=page)
            self.assertEqual(stale, [])


if __name__ == "__main__":
    unittest.main()
