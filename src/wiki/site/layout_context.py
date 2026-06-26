"""Nested layout template context for wiki page shells."""

from __future__ import annotations

import json
from typing import Any

from markupsafe import Markup

from ..config import Config
from ..schemas.layout import LAYOUT_MARKUP_PATHS, LayoutContext
from ..schemas.site import VirtualPage, WikiSite

# Backward-compatible alias for tests and internal callers.
LAYOUT_CONTEXT_MARKUP_PATHS = LAYOUT_MARKUP_PATHS


def _site_context(*, base_url: str, url_style: str, all_pages: str) -> dict[str, Any]:
    return {
        "base_url": base_url,
        "url_style": url_style,
        "all_pages": all_pages,
    }


def _page_context(page: VirtualPage | None) -> dict[str, Any]:
    if page is None:
        return {
            "title": "All Pages",
            "slug": json.dumps("__index__"),
            "source": "",
            "layout_stem": "default",
            "kind": "index",
        }
    return {
        "title": page.title,
        "slug": json.dumps(page.file_slug),
        "source": page.markdown,
        "layout_stem": page.layout_stem,
        "kind": "article",
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
    url_style: str = "dir",
    page: VirtualPage | None = None,
    content: str,
    site_obj: WikiSite | None = None,
    config: Config | None = None,
    backlinks: str = "",
) -> dict[str, Any]:
    """Build nested layout template context for index or article pages."""
    from .html import (
        build_all_pages_json,
        build_categories_html,
        build_infobox_html,
        build_metadata_panel_html,
        build_metadata_tab_html,
        build_metadata_tool_html,
        build_toc_html,
    )

    all_pages_str = build_all_pages_json(site_obj) if site_obj is not None else "[]"

    raw: dict[str, Any] = {
        "site": _site_context(
            base_url=base_url,
            url_style=url_style,
            all_pages=all_pages_str,
        ),
        "page": _page_context(page),
        "body": content,
        "toc": build_toc_html(page) if page is not None else "",
        "backlinks": backlinks,
        "infobox": build_infobox_html(page) if page is not None else "",
        "categories": build_categories_html(page) if page is not None else "",
        "metadata_pane": (
            build_metadata_panel_html(page, config)
            if page is not None and config is not None
            else ""
        ),
        "metadata_tool": build_metadata_tool_html(page) if page is not None else "",
        "metadata_tab": build_metadata_tab_html(page) if page is not None else "",
    }
    LayoutContext.model_validate(raw)
    return _apply_markup(raw)
