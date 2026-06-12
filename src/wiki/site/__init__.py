"""Site-building logic for compiling raw Markdown wikis into HTML virtual structures."""

from ..schemas.site import InfoboxRow, TocItem, VirtualPage, WikiSite
from .build import build_site
from .html import (
    DEFAULT_THEME_COLOR,
    build_index_html,
    build_infobox_rows,
    build_page_html,
    build_web_manifest,
    resolved_site_theme_color,
    serialize_web_manifest,
)
from .layout_template import MINIMAL_LAYOUT_TEMPLATE
from .markdown import (
    INLINE_CSS,
    extract_title,
    humanize_route,
    render_copyable_pre,
    render_outline_title,
    render_wiki_markdown,
    split_by_headings,
    strip_leading_title_heading,
)

# Test-only / internal exports kept for compatibility
from .html import _build_logo_svg  # noqa: F401

__all__ = [
    "MINIMAL_LAYOUT_TEMPLATE",
    "DEFAULT_THEME_COLOR",
    "INLINE_CSS",
    "InfoboxRow",
    "TocItem",
    "VirtualPage",
    "WikiSite",
    "build_index_html",
    "build_infobox_rows",
    "build_page_html",
    "build_site",
    "build_web_manifest",
    "extract_title",
    "humanize_route",
    "render_copyable_pre",
    "render_outline_title",
    "render_wiki_markdown",
    "resolved_site_theme_color",
    "serialize_web_manifest",
    "split_by_headings",
    "strip_leading_title_heading",
]
