"""Site build models for virtual pages and table of contents."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from .wiki_config import Config


class TocItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str
    slug: str
    level: int


class VirtualPage(BaseModel):
    model_config = ConfigDict(extra="ignore")

    file_slug: str
    title: str
    markdown: str
    html: str
    frontmatter: dict[str, Any]
    layout_path: Path | None = None
    layout_stem: str = "default"
    wiki_ids: list[str] = Field(default_factory=list)
    outline: list[TocItem] = Field(default_factory=list)
    backlink_slugs: list[str] = Field(default_factory=list)

    @property
    def full_slug(self) -> str:
        return self.file_slug

    @property
    def has_frontmatter(self) -> bool:
        return bool(self.frontmatter)


class WikiSite(BaseModel):
    model_config = ConfigDict(extra="ignore", arbitrary_types_allowed=True)

    pages: list[VirtualPage]
    config: Config | None = None
    pages_by_route: dict[str, VirtualPage] = Field(default_factory=dict)
    routes_by_wiki_id: dict[str, str] = Field(default_factory=dict)
