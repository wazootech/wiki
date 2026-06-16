"""Typed layout template context models for page shell rendering."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

# Leaf paths wrapped as Markup before token substitution (shared by layout_context + layout_tokens).
LAYOUT_MARKUP_PATHS: frozenset[tuple[str, ...]] = frozenset(
    {
        ("page", "content"),
        ("page", "layout", "label"),
        ("page", "type_label"),
        ("page", "nav", "infobox"),
        ("page", "nav", "toc"),
        ("page", "nav", "backlinks"),
        ("page", "nav", "categories"),
        ("page", "nav", "sidebar"),
        ("page", "metadata", "tool"),
        ("page", "metadata", "tab"),
        ("page", "metadata", "pane"),
        ("wiki", "pages_json"),
    }
)

# JSON string leaves emitted without HTML escaping in the token map.
LAYOUT_RAW_JSON_PATHS: frozenset[tuple[str, ...]] = frozenset(
    {
        ("wiki", "pages_json"),
        ("page", "slug_json"),
    }
)


class SiteLayoutContext(BaseModel):
    model_config = ConfigDict(extra="forbid")

    base_url: str
    url_style: str


class PageLayoutPart(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    class_: str = Field(default="", alias="class")
    label: str = ""


class PageNavContext(BaseModel):
    model_config = ConfigDict(extra="forbid")

    infobox: str = ""
    toc: str = ""
    backlinks: str = ""
    categories: str = ""
    sidebar: str = ""


class PageMetadataContext(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tool: str = ""
    tab: str = ""
    pane: str = ""


class PageLayoutContext(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    kind: str
    body_class: str
    content: str
    source: str = ""
    slug: str = ""
    slug_json: str = ""
    layout: PageLayoutPart = Field(default_factory=PageLayoutPart)
    type_label: str = ""
    nav: PageNavContext = Field(default_factory=PageNavContext)
    metadata: PageMetadataContext = Field(default_factory=PageMetadataContext)


class WikiLayoutContext(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pages_json: str


class LayoutContext(BaseModel):
    model_config = ConfigDict(extra="forbid")

    site: SiteLayoutContext
    page: PageLayoutContext
    wiki: WikiLayoutContext
