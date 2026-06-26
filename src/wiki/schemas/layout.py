"""Typed layout template context models for page shell rendering."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict

# Leaf paths wrapped as Markup before slot substitution (shared by layout_context + layout_tokens).
LAYOUT_MARKUP_PATHS: frozenset[tuple[str, ...]] = frozenset(
    {
        ("body",),
        ("toc",),
        ("backlinks",),
        ("infobox",),
        ("categories",),
        ("metadata_pane",),
        ("metadata_tool",),
        ("metadata_tab",),
    }
)

# JSON string leaves emitted without HTML escaping in the token map.
LAYOUT_RAW_JSON_PATHS: frozenset[tuple[str, ...]] = frozenset(
    {
        ("site", "all_pages"),
        ("page", "slug"),
    }
)


class SiteLayoutContext(BaseModel):
    model_config = ConfigDict(extra="forbid")

    base_url: str
    url_style: str
    all_pages: str = "[]"


class PageLayoutContext(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    slug: str = ""
    source: str = ""
    layout_stem: str = "default"
    kind: str = "article"


class LayoutContext(BaseModel):
    model_config = ConfigDict(extra="forbid")

    site: SiteLayoutContext
    page: PageLayoutContext
    body: str
    toc: str = ""
    backlinks: str = ""
    infobox: str = ""
    categories: str = ""
    metadata_pane: str = ""
    metadata_tool: str = ""
    metadata_tab: str = ""
