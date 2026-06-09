"""Backlink panel HTML for built wiki pages."""

from __future__ import annotations

import html as html_module

from ..schemas.site import VirtualPage, WikiSite
from .markdown import page_href


def build_backlinks_html(page: VirtualPage, site: WikiSite, base_url: str, url_style: str) -> str:
    if not page.backlink_slugs:
        return ""
    items = ""
    for bl in page.backlink_slugs:
        target = site.pages_by_route.get(bl)
        title = target.title if target is not None else bl.replace("-", " ").title()
        route = target.full_slug if target is not None else bl
        items += f'<li><a href="{page_href(base_url, route, url_style)}">{html_module.escape(title)}</a></li>\n'
    return f"""<section class="page-meta">
<h2>Backlinks</h2>
<ul class="backlinks-list">
{items}
</ul>
</section>"""
