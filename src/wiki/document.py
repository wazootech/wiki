"""Document text splitting and link-scan primitives."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from .parser import parse_frontmatter

# WikiLink pattern: [[slug]] or [[slug|display]]
WIKILINK_REGEX = re.compile(r"\[\[([^\]|]+)(?:\|[^\]]*)?\]\]")

# Standard Markdown link pattern: [display](target) and ![alt](target).
MARKDOWN_LINK_REGEX = re.compile(r"!?\[[^\]]*\]\(([^)]+)\)")

WIKILINK_FULL_REGEX = re.compile(r"\[\[([^\]|]+)(?:\|([^\]]*))?\]\]")
MARKDOWN_LINK_FULL_REGEX = re.compile(r"!?\[([^\]]*)\]\(([^)]+)\)")

FENCED_CODE_RE = re.compile(r"```[\s\S]*?```")


@dataclass(frozen=True)
class FrontmatterSplit:
    """Split of markdown content into frontmatter prefix, body, and parsed data."""

    prefix: str
    body: str
    data: dict[str, Any] | None


def split_frontmatter_text(content: str) -> FrontmatterSplit:
    """Split markdown content into frontmatter prefix, body, and parsed frontmatter dict."""
    if content.startswith("---"):
        parts = content.split("---", 2)
        if len(parts) > 2:
            return FrontmatterSplit(
                prefix=f"---{parts[1]}---",
                body=parts[2],
                data=parse_frontmatter(content),
            )
    return FrontmatterSplit(prefix="", body=content, data=None)


def markdown_body(content: str) -> str:
    """Return the markdown body after frontmatter (or full content if none)."""
    return split_frontmatter_text(content).body


def protected_inline_code_spans(markdown: str) -> list[tuple[int, int]]:
    spans: list[tuple[int, int]] = []
    for match in re.finditer(r"`[^`\n]*`", markdown):
        spans.append(match.span())
    return spans


def span_overlaps(start: int, end: int, spans: list[tuple[int, int]]) -> bool:
    return any(start < span_end and end > span_start for span_start, span_end in spans)


def strip_inline_code(markdown: str) -> str:
    """Remove inline code spans so literal `[[...]]` in prose is not treated as wikilinks."""
    return re.sub(r"`[^`\n]*`", "", markdown)


def body_code_spans(body: str) -> list[tuple[int, int]]:
    """Inline and fenced code spans in a markdown body."""
    spans = protected_inline_code_spans(body)
    for match in FENCED_CODE_RE.finditer(body):
        spans.append(match.span())
    return spans
