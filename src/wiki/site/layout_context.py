"""Nested layout template context for wiki page shells."""

from __future__ import annotations

from typing import Any

from markupsafe import Markup

from ..schemas.layout import LAYOUT_MARKUP_PATHS, LayoutContext
from ..schemas.site import VirtualPage

# Backward-compatible alias for tests and internal callers.
LAYOUT_CONTEXT_MARKUP_PATHS = LAYOUT_MARKUP_PATHS


def _site_context(*, base_url: str) -> dict[str, Any]:
    return {
        "base_url": base_url,
    }


def _apply_markup(context: dict[str, Any]) -> dict[str, Any]:
    for path in LAYOUT_MARKUP_PATHS:
        node: Any = context
        for key in path[:-1]:
            node = node[key]
        leaf = path[-1]
        value = node[leaf]
        if value is not None and value != "":
            node[leaf] = Markup(value)
    return context


def build_layout_context(
    *,
    base_url: str,
    page: VirtualPage | None = None,
    content: str,
) -> dict[str, Any]:
    """Build nested layout template context for index or article pages."""
    title = page.title if page is not None else "All Pages"

    raw: dict[str, Any] = {
        "site": _site_context(base_url=base_url),
        "page": {
            "title": title,
        },
        "body": content,
    }
    LayoutContext.model_validate(raw)
    return _apply_markup(raw)
