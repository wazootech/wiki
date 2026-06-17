"""HTML shell assembly."""

from __future__ import annotations

import html as html_module
from pathlib import Path

from ..config import DEFAULT_URL_STYLE
from ..schemas.site import VirtualPage, WikiSite
from .layout_context import build_layout_context, build_logo_svg
from .layout_template import get_layout_renderer
from .markdown import _get_page_categories, page_href


def build_index_html(
    site: WikiSite,
    config_root: Path,
    base_url: str = "/wiki",
    url_style: str = DEFAULT_URL_STYLE,
    default_layout: Path | None = None,
) -> str:
    """Compile root Index page HTML."""
    links_html = ""
    seen_files: set[str] = set()
    for page in site.pages:
        if page.file_slug not in seen_files:
            seen_files.add(page.file_slug)
            cats = _get_page_categories(page)
            cats_attr = ",".join(cats)
            links_html += f'<li data-categories="{html_module.escape(cats_attr)}"><a href="{page_href(base_url, page.file_slug, url_style)}">{html_module.escape(page.title)}</a></li>\n'

    page_content = f'<ul class="pages-list">\n{links_html}</ul>'

    context = build_layout_context(
        site=site,
        base_url=base_url,
        content=page_content,
    )

    renderer = get_layout_renderer(config_root)
    return renderer.render(default_layout, context)


def build_page_html(
    page: VirtualPage,
    site: WikiSite,
    config_root: Path,
    base_url: str = "/wiki",
    url_style: str = DEFAULT_URL_STYLE,
    default_layout: Path | None = None,
    metadata_mode: str = "compacted",
    metadata_format: str = "json-ld",
) -> str:
    """Compile individual page HTML."""
    _ = (url_style, metadata_mode, metadata_format)

    context = build_layout_context(
        site=site,
        base_url=base_url,
        page=page,
        content=page.html,
    )

    template_path = page.layout_path if page.layout_path is not None else default_layout
    renderer = get_layout_renderer(config_root)
    return renderer.render(template_path, context)


_build_logo_svg = build_logo_svg

