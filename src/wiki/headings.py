"""GitHub-compatible heading anchor helpers."""

from __future__ import annotations

import re
import unicodedata


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
