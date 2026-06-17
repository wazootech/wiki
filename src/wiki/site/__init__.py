"""Site-building logic for compiling raw Markdown wikis into HTML virtual structures."""

from ..schemas.site import TocItem, VirtualPage, WikiSite
from .build import build_site
from .html import build_index_html, build_page_html
from .layout_context import build_layout_context
from .layout_tokens import PACKAGED_MINIMAL_LAYOUT
from .markdown import (
    extract_title,
    humanize_route,
    render_copyable_pre,
    render_outline_title,
    render_wiki_markdown,
    split_by_headings,
    strip_leading_title_heading,
)

__all__ = [
    "PACKAGED_MINIMAL_LAYOUT",
    "TocItem",
    "VirtualPage",
    "WikiSite",
    "build_layout_context",
    "build_index_html",
    "build_page_html",
    "build_site",
    "extract_title",
    "humanize_route",
    "render_copyable_pre",
    "render_outline_title",
    "render_wiki_markdown",
    "split_by_headings",
    "strip_leading_title_heading",
]
