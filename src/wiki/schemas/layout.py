"""Typed layout template context models for page shell rendering."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict

# Leaf paths wrapped as Markup before slot substitution (shared by layout_context + layout_tokens).
LAYOUT_MARKUP_PATHS: frozenset[tuple[str, ...]] = frozenset(
    {
        ("body",),
    }
)

# JSON string leaves emitted without HTML escaping in the token map.
LAYOUT_RAW_JSON_PATHS: frozenset[tuple[str, ...]] = frozenset()


class SiteLayoutContext(BaseModel):
    model_config = ConfigDict(extra="forbid")

    base_url: str


class PageLayoutContext(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str


class LayoutContext(BaseModel):
    model_config = ConfigDict(extra="forbid")

    site: SiteLayoutContext
    page: PageLayoutContext
    body: str
