"""Layout token contract tests (#106 alignment)."""

import re
import unittest
from pathlib import Path

from wiki.init_scaffold import load_packaged_official_layout
from wiki.schemas.site import VirtualPage, WikiSite
from wiki.site.layout_context import build_layout_context
from wiki.site.layout_tokens import build_layout_token_map, unknown_tokens

_TOKEN_PATTERN = re.compile(r"%wiki\.[a-z0-9_.]+%", re.IGNORECASE)


def _sample_context() -> dict:
    site = WikiSite(
        pages=[
            VirtualPage(
                file_slug="Sample",
                title="Sample",
                markdown="# Sample",
                html="<h1>Sample</h1>",
                frontmatter={},
            )
        ]
    )
    return build_layout_context(
        site=site,
        base_url="/wiki",
        url_style="dir",
        page=site.pages[0],
        content="<p>Body</p>",
        body_class="wiki-page",
        kind="article",
        slug="Sample",
        nav_infobox="<div>infobox</div>",
        nav_toc="<nav>toc</nav>",
        nav_backlinks="<ul>back</ul>",
        nav_categories="<ul>cat</ul>",
        nav_sidebar="<aside>side</aside>",
        metadata_tool="<div>tool</div>",
        metadata_tab="<div>tab</div>",
        metadata_pane="<div>pane</div>",
    )


class TestLayoutContract(unittest.TestCase):
    def test_packaged_wikipedia_tokens_are_known(self) -> None:
        template = load_packaged_official_layout("wikipedia")
        tokens = build_layout_token_map(_sample_context())
        unknown = unknown_tokens(template, tokens)
        self.assertEqual(unknown, [], msg=f"Unknown layout tokens: {unknown}")

    def test_docs_wikipedia_layout_tokens_are_known(self) -> None:
        docs_layout = Path(__file__).resolve().parents[1] / "docs" / "layouts" / "wikipedia.html"
        if not docs_layout.is_file():
            self.skipTest("docs layout not present")
        template = docs_layout.read_text(encoding="utf-8")
        tokens = build_layout_token_map(_sample_context())
        found = sorted(set(_TOKEN_PATTERN.findall(template)))
        missing = [token for token in found if token not in tokens]
        self.assertEqual(missing, [])
