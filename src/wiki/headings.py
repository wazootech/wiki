"""GitHub-compatible heading anchor helpers."""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from functools import lru_cache

from markdown_it import MarkdownIt


@dataclass(frozen=True)
class Heading:
    line_no: int
    level: int
    text: str
    slug: str


class GitHubHeadingSlugger:
    def __init__(self) -> None:
        self.seen: dict[str, int] = {}

    def slug(self, title: str) -> str:
        normalized = unicodedata.normalize("NFKD", title).strip().lower()
        normalized = re.sub(r"[^\w\s-]", "", normalized, flags=re.UNICODE)
        normalized = re.sub(r"[\s-]+", "-", normalized).strip("-")
        base = normalized or "section"
        count = self.seen.get(base, 0)
        self.seen[base] = count + 1
        return base if count == 0 else f"{base}-{count}"


def heading_slug(title: str) -> str:
    return GitHubHeadingSlugger().slug(title)


@lru_cache(maxsize=1)
def _heading_parser() -> MarkdownIt:
    return MarkdownIt("gfm-like", {"linkify": False})


def parse_headings(markdown: str) -> list[Heading]:
    tokens = _heading_parser().parse(markdown)
    slugger = GitHubHeadingSlugger()
    headings: list[Heading] = []

    for index, token in enumerate(tokens):
        if token.type != "heading_open":
            continue
        level = int(token.tag[1:])
        line_no = token.map[0] + 1 if token.map else 0
        text = ""
        if index + 1 < len(tokens) and tokens[index + 1].type == "inline":
            text = tokens[index + 1].content
        headings.append(Heading(line_no=line_no, level=level, text=text, slug=slugger.slug(text)))

    return headings
