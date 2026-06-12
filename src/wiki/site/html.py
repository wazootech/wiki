"""HTML shell assembly, manifests, and page chrome."""

from __future__ import annotations

import html as html_module
import json
import re
from pathlib import Path
from typing import Any
from urllib.parse import quote

from markupsafe import Markup
from pygments import highlight
from pygments.lexers import get_lexer_by_name
from pygments.util import ClassNotFound

from ..config import DEFAULT_URL_STYLE, Config
from ..format import process_rdf_format, resolve_metadata_pygments_lexer, resolve_metadata_view
from ..links import is_external_link, resolve_page_route
from ..paths import page_url
from ..schemas.metadata import METADATA_VIEWS
from ..schemas.site import InfoboxRow, VirtualPage, WikiSite
from .backlinks import build_backlinks_html
from .build import expand_known_curie
from .markdown import (
    INLINE_CSS,
    METADATA_HIDDEN_FIELDS,
    PYGMENTS_FORMATTER,
    _get_page_categories,
    humanize_route,
    page_href,
    render_copyable_pre,
    render_outline_title,
)
from .layout_template import get_layout_renderer

_LAYOUT_HTML_KEYS = frozenset(
    {
        "inline_css",
        "logo_svg",
        "page_content",
        "layout_label",
        "type_label",
        "infobox_html",
        "toc_html",
        "backlinks_html",
        "categories_html",
        "sidebar_contents_html",
        "metadata_tool_html",
        "metadata_tab_html",
        "metadata_pane_html",
        "all_pages_json",
        "current_slug_json",
        "manifest_json",
    }
)


def _prepare_layout_context(raw: dict[str, str]) -> dict[str, Markup | str]:
    prepared: dict[str, Markup | str] = {}
    for key, value in raw.items():
        if key in _LAYOUT_HTML_KEYS:
            prepared[key] = Markup(value)
        else:
            prepared[key] = value
    return prepared

def _logo_letter(site_title: str) -> str:
    from ..config import DEFAULT_SITE_TITLE

    text = (site_title or DEFAULT_SITE_TITLE).strip() or DEFAULT_SITE_TITLE
    return text[0].upper()


_DEFAULT_LOGO_THEME = ("#3b82f6", "#1d4ed8", "#93c5fd")
DEFAULT_THEME_COLOR = _DEFAULT_LOGO_THEME[0]


def resolved_site_theme_color(theme_color: str | None) -> str:
    return theme_color or DEFAULT_THEME_COLOR


def _manifest_start_url(config: Config) -> str:
    manifest = config.site.manifest
    if manifest.start_url:
        return manifest.start_url
    base_url = config.site.base_url or ""
    return f"{base_url}/" if base_url else "/"


def _manifest_icon_src(src: str, base_url: str) -> str:
    if "://" in src:
        return src
    normalized = src.lstrip("/")
    return f"{base_url}/{normalized}" if base_url else f"/{normalized}"


def build_web_manifest(config: Config) -> dict[str, Any]:
    """Canonical Web App Manifest object for embed and file output."""
    manifest = config.site.manifest
    base_url = config.site.base_url or ""
    doc: dict[str, Any] = {"name": manifest.name}

    if manifest.short_name:
        doc["short_name"] = manifest.short_name
    if manifest.description:
        doc["description"] = manifest.description
    if manifest.theme_color:
        doc["theme_color"] = manifest.theme_color
    if manifest.background_color:
        doc["background_color"] = manifest.background_color
    if manifest.display:
        doc["display"] = manifest.display

    doc["start_url"] = _manifest_start_url(config)

    if manifest.icons:
        icons: list[dict[str, str]] = []
        for icon in manifest.icons:
            entry: dict[str, str] = {"src": _manifest_icon_src(icon.src, base_url)}
            if icon.sizes:
                entry["sizes"] = icon.sizes
            if icon.type:
                entry["type"] = icon.type
            if icon.purpose:
                entry["purpose"] = icon.purpose
            icons.append(entry)
        doc["icons"] = icons

    return doc


def serialize_web_manifest(config: Config) -> str:
    return json.dumps(build_web_manifest(config), separators=(",", ":"), ensure_ascii=False)


def _manifest_url(base_url: str) -> str:
    return f"{base_url}/manifest.webmanifest" if base_url else "/manifest.webmanifest"


def _site_chrome_context(site: WikiSite, base_url: str) -> dict[str, str]:
    manifest = site.config.site.manifest
    site_title = manifest.name
    theme_color = resolved_site_theme_color(manifest.theme_color)
    logo_svg = _build_logo_svg(_logo_letter(site_title), manifest.theme_color)
    return {
        "logo_svg": Markup(logo_svg),
        "site_manifest_theme_color": theme_color,
        "site_manifest_name": site_title,
        "manifest_json": Markup(serialize_web_manifest(site.config)),
        "site_manifest_url": _manifest_url(base_url),
    }


def _parse_hex_color(value: str) -> tuple[int, int, int]:
    normalized = value.lstrip("#")
    if len(normalized) == 3:
        normalized = "".join(ch * 2 for ch in normalized)
    r = int(normalized[0:2], 16)
    g = int(normalized[2:4], 16)
    b = int(normalized[4:6], 16)
    return r, g, b


def _format_hex_color(r: int, g: int, b: int) -> str:
    return f"#{max(0, min(255, r)):02x}{max(0, min(255, g)):02x}{max(0, min(255, b)):02x}"


def _logo_theme_colors(theme_color: str | None) -> tuple[str, str, str]:
    if theme_color is None:
        return _DEFAULT_LOGO_THEME
    r, g, b = _parse_hex_color(theme_color)
    dark = _format_hex_color(int(r * 0.55), int(g * 0.55), int(b * 0.55))
    light = _format_hex_color(
        min(255, int(r + (255 - r) * 0.55)),
        min(255, int(g + (255 - g) * 0.55)),
        min(255, int(b + (255 - b) * 0.55)),
    )
    return theme_color, dark, light


def _build_logo_svg(letter: str, theme_color: str | None = None) -> str:
    glyph = html_module.escape(letter)
    globe_start, globe_end, grid_accent = _logo_theme_colors(theme_color)
    return f"""<svg viewBox="0 0 200 200" width="80" height="80" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="globeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="{globe_start}" />
      <stop offset="100%" stop-color="{globe_end}" />
    </linearGradient>
    <linearGradient id="gridGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.8" />
      <stop offset="100%" stop-color="{grid_accent}" stop-opacity="0.3" />
    </linearGradient>
  </defs>
  <circle cx="100" cy="100" r="80" fill="url(#globeGrad)" />
  <path d="M 100 20 Q 50 100 100 180" fill="none" stroke="url(#gridGrad)" stroke-width="3" />
  <path d="M 100 20 Q 150 100 100 180" fill="none" stroke="url(#gridGrad)" stroke-width="3" />
  <path d="M 100 20 Q 10 100 100 180" fill="none" stroke="url(#gridGrad)" stroke-width="1.5" stroke-dasharray="3,3" />
  <path d="M 100 20 Q 190 100 100 180" fill="none" stroke="url(#gridGrad)" stroke-width="1.5" stroke-dasharray="3,3" />
  <line x1="100" y1="20" x2="100" y2="180" stroke="url(#gridGrad)" stroke-width="2" />
  <line x1="20" y1="100" x2="180" y2="100" stroke="url(#gridGrad)" stroke-width="2.5" />
  <path d="M 30 70 Q 100 90 170 70" fill="none" stroke="url(#gridGrad)" stroke-width="2" />
  <path d="M 30 130 Q 100 110 170 130" fill="none" stroke="url(#gridGrad)" stroke-width="2" />
  <path d="M 45 45 Q 100 65 155 45" fill="none" stroke="url(#gridGrad)" stroke-width="1.5" />
  <path d="M 45 155 Q 100 135 155 155" fill="none" stroke="url(#gridGrad)" stroke-width="1.5" />
  <text x="100" y="112" font-family="'Inter', sans-serif" font-size="36" font-weight="900" fill="#ffffff" text-anchor="middle" style="letter-spacing: -2px;">{glyph}</text>
</svg>"""


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

    # All Pages JSON for search and random redirect
    import json
    pages_data = [{"slug": p.full_slug, "title": p.title} for p in site.pages]
    pages_json = json.dumps(pages_data, default=str)

    page_content = f'<ul class="pages-list">\n{links_html}</ul>'

    context = {
        "inline_css": INLINE_CSS,
        "site_base_url": base_url,
        **_site_chrome_context(site, base_url),
        "page_title": "All Pages",
        "body_class": "wiki-index",
        "page_kind": "index",
        "site_url_style": url_style,
        "all_pages_json": pages_json,
        "current_slug_json": json.dumps(""),
        "page_content": page_content,
        "layout_label": "",
        "type_label": "",
        "layout_class": "index",
        "infobox_html": "",
        "toc_html": "",
        "backlinks_html": "",
        "categories_html": "",
        "sidebar_contents_html": "",
        "source_markdown": "",
        "metadata_tool_html": "",
        "metadata_tab_html": "",
        "metadata_pane_html": "",
    }

    renderer = get_layout_renderer(config_root)
    return renderer.render(default_layout, _prepare_layout_context(context))


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
    selected_view = resolve_metadata_view(metadata_format, metadata_mode)
    toc_html = _build_toc_html(page, base_url, url_style)
    sidebar_contents_html = _build_sidebar_contents_html(page, base_url, url_style)
    bl_html = build_backlinks_html(page, site, base_url, url_style)
    infobox_html = _build_infobox_html(page, site, base_url, url_style)
    
    # Categories
    cats = _get_page_categories(page)
    cats_html = ""
    if cats:
        cat_items = "".join(f'<li class="catlinks-item"><a href="{base_url}/?category={quote(cat)}">{html_module.escape(cat)}</a></li>' for cat in cats)
        cats_html = f"""<div class="catlinks" id="catlinks">
<div class="catlinks-label">Categories:</div>
<ul class="catlinks-list">
{cat_items}
</ul>
</div>"""

    layout_label = _layout_label(page)
    type_label = _type_label(page)
    layout_class = page.layout_stem

    # All Pages JSON for search and random redirect
    import json
    pages_data = [{"slug": p.full_slug, "title": p.title} for p in site.pages]
    pages_json = json.dumps(pages_data, default=str)

    metadata_mode_html = _build_metadata_panel_html(page, site, selected_view)
    if page.has_frontmatter:
        metadata_tool_html = '<li><a href="#view-metadata-content" onclick="switchTab(\'metadata\'); return false;">View metadata</a></li>'
        metadata_tab_html = '<li id="ca-metadata"><a href="#view-metadata-content" onclick="switchTab(\'metadata\'); return false;">Metadata</a></li>'
        metadata_pane_html = f"""<!-- METADATA VIEW (RDF frontmatter) -->
    <div id="view-metadata-content" class="wiki-view-pane" style="display: none;">
      <h1 class="firstHeading">Metadata: {html_module.escape(page.title)}</h1>
      <div id="siteSub">RDF representation compiled from frontmatter</div>
      
      {metadata_mode_html}
    </div>"""
    else:
        metadata_tool_html = ""
        metadata_tab_html = ""
        metadata_pane_html = ""

    context = {
        "inline_css": INLINE_CSS,
        "site_base_url": base_url,
        **_site_chrome_context(site, base_url),
        "page_title": page.title,
        "body_class": f"wiki-page layout-{layout_class}",
        "page_kind": "article",
        "site_url_style": url_style,
        "all_pages_json": pages_json,
        "current_slug_json": json.dumps(page.full_slug),
        "page_content": page.html,
        "layout_label": layout_label,
        "type_label": type_label,
        "layout_class": layout_class,
        "infobox_html": infobox_html,
        "toc_html": toc_html,
        "backlinks_html": bl_html,
        "categories_html": cats_html,
        "sidebar_contents_html": sidebar_contents_html,
        "source_markdown": page.markdown,
        "metadata_tool_html": metadata_tool_html,
        "metadata_tab_html": metadata_tab_html,
        "metadata_pane_html": metadata_pane_html,
    }

    template_path = page.layout_path if page.layout_path is not None else default_layout
    renderer = get_layout_renderer(config_root)
    return renderer.render(template_path, _prepare_layout_context(context))


def _build_toc_html(page: VirtualPage, base_url: str, url_style: str) -> str:
    if not page.outline:
        return ""
    items = '<li class="toclevel-0 l2"><a href="#firstHeading">(Top)</a></li>\n'
    for item in page.outline:
        title_html = render_outline_title(item.title, base_url, url_style, page.full_slug)
        items += f'<li class="toclevel-{item.level - 1} l{item.level}"><a href="#{item.slug}">{title_html}</a></li>\n'
    return f"""<div class="toc" id="toc">
<div class="toctitle">
<h2>Contents<span style="display:none">On this page</span></h2>
<span class="toctogglelink" id="toggleTocBtn" onclick="toggleToc()">[hide]</span>
</div>
<ul class="toc-list" id="toc-list">
{items}
</ul>
</div>"""


def _build_sidebar_contents_html(page: VirtualPage, base_url: str, url_style: str) -> str:
    if not page.outline:
        return ""
    items = '<li class="toclevel-0 l2"><a href="#firstHeading">(Top)</a></li>\n'
    for item in page.outline:
        title_html = render_outline_title(item.title, base_url, url_style, page.full_slug)
        items += f'<li class="toclevel-{item.level - 1} l{item.level}"><a href="#{item.slug}">{title_html}</a></li>\n'
    return f"""<div class="portal portal-contents" role="navigation" id="p-contents" aria-label="Page contents">
    <h3>Contents</h3>
    <ul>
{items}
    </ul>
  </div>"""


def _build_metadata_panel_html(page: VirtualPage, site: WikiSite, selected_view: str) -> str:
    if not page.frontmatter:
        return ""

    page_config = site.config or Config.for_root(Path.cwd(), wiki={"inputs": []})
    view_group_id = _metadata_view_dom_id(page)
    radios_and_labels: list[str] = []
    panels: list[str] = []

    for view in METADATA_VIEWS:
        view_id = view.id
        input_id = f"{view_group_id}-{view_id}"
        checked = ' checked="checked"' if view_id == selected_view else ""
        radios_and_labels.append(
            f'<input class="metadata-format-input" type="radio" name="{view_group_id}" '
            f'id="{input_id}" value="{view_id}"{checked}>'
            f'<label class="metadata-format-label" for="{input_id}">{html_module.escape(view.label)}</label>'
        )
        highlighted, lexer, raw_text = _metadata_content_for_page(page, page_config, view)
        panels.append(
            f'<div class="metadata-format-panel metadata-format-panel-{view_id}">'
            f'{render_copyable_pre(raw_text, highlighted, pre_class="highlight", code_class=f"language-{html_module.escape(lexer)}")}'
            f"</div>"
        )

    return f"""<section class="page-meta metadata-panel">
<div class="metadata-format-switch" role="group" aria-label="Metadata RDF format">
  <div class="metadata-format-toolbar">
    <span class="metadata-format-heading">Format</span>
    <div class="metadata-format-options">{''.join(radios_and_labels)}</div>
  </div>
  <div class="metadata-format-panels">
    {''.join(panels)}
  </div>
</div>
</section>"""


def _metadata_content_for_page(page: VirtualPage, config: Config, view: dict[str, str]) -> tuple[str, str, str]:
    rdf = process_rdf_format(
        page.frontmatter,
        page.full_slug,
        config.context,
        view.format,
        mode=view.mode,
    )
    if view.format == "json-ld":
        text = json.dumps(rdf, indent=2, default=str)
    else:
        text = rdf if isinstance(rdf, str) else str(rdf)
    return _highlight_metadata(text, view.lexer), view.lexer, text


def _metadata_view_dom_id(page: VirtualPage) -> str:
    safe_slug = re.sub(r"[^a-zA-Z0-9_-]+", "-", page.full_slug or "index").strip("-") or "index"
    return f"metadata-format-{safe_slug.lower()}"


def _highlight_metadata(value: str, lexer_name: str) -> str:
    try:
        lexer = get_lexer_by_name(resolve_metadata_pygments_lexer(lexer_name))
    except ClassNotFound:
        return html_module.escape(value)
    return highlight(value, lexer, PYGMENTS_FORMATTER)


def _build_infobox_html(page: VirtualPage, site: WikiSite, base_url: str, url_style: str) -> str:
    rows = build_infobox_rows(page, site, base_url, url_style)
    if not rows:
        return ""
    return f"""<section class="infobox page-meta">
<h2>Infobox</h2>
<dl>
{''.join(f'<dt>{html_module.escape(row.label)}</dt><dd>{row.html}</dd>' for row in rows)}
</dl>
</section>"""


def build_infobox_rows(page: VirtualPage, site: WikiSite, base_url: str, url_style: str) -> list[InfoboxRow]:
    """Return reusable infobox rows for HTML and terminal rendering."""
    rows: list[InfoboxRow] = []
    for key, value in page.frontmatter.items():
        if key in METADATA_HIDDEN_FIELDS:
            continue
        label = str(key)
        text, html = _render_metadata_value_parts(value, page, site, base_url, url_style)
        if html:
            rows.append(InfoboxRow(label=label, text=text, html=html))
    return rows
def _infobox_list_item_html(html: str) -> str:
    if 'class="infobox-dict"' in html:
        return f'<li class="infobox-list-block">{html}</li>'
    return f'<li><span class="infobox-chip">{html}</span></li>'


def _render_metadata_value(value: Any, page: VirtualPage, site: WikiSite, base_url: str, url_style: str) -> str:
    if value is None:
        return ""
    if isinstance(value, list):
        items = [item for item in (_render_metadata_value(v, page, site, base_url, url_style) for v in value) if item]
        if not items:
            return ""
        return '<ul class="infobox-list">' + ''.join(_infobox_list_item_html(item) for item in items) + '</ul>'


def _render_metadata_value_parts(
    value: Any,
    page: VirtualPage,
    site: WikiSite,
    base_url: str,
    url_style: str,
) -> tuple[str, str]:
    if value is None:
        return "", ""
    if isinstance(value, list):
        rendered_items = [
            item for item in (_render_metadata_value_parts(v, page, site, base_url, url_style) for v in value)
            if item[1]
        ]
        items = [html for _, html in rendered_items]
        if not items:
            return "", ""
        text = ", ".join(text for text, _ in rendered_items if text)
        html = '<ul class="infobox-list">' + ''.join(_infobox_list_item_html(item) for item in items) + '</ul>'
        return text, html
    if isinstance(value, dict):
        target_id = value.get("@id") or value.get("id")
        label = value.get("name") or target_id
        if isinstance(target_id, str) and label:
            return _render_link_like(str(label), str(target_id), page, site, base_url, url_style)
        rows = []
        text_parts = []
        for nested_key, nested_value in value.items():
            if str(nested_key).startswith("@"):
                continue
            nested_text, nested_html = _render_metadata_value_parts(nested_value, page, site, base_url, url_style)
            if nested_html:
                nested_label = str(nested_key)
                rows.append(
                    f'<div class="infobox-dict-row"><span class="infobox-key">{html_module.escape(nested_label)}</span><span>{nested_html}</span></div>'
                )
                if nested_text:
                    text_parts.append(f"{nested_label}: {nested_text}")
        if not rows:
            return "", ""
        return "; ".join(text_parts), '<div class="infobox-dict">' + ''.join(rows) + '</div>'
    if isinstance(value, bool):
        text = "True" if value else "False"
        return text, text
    if isinstance(value, (int, float)):
        text = str(value)
        return text, html_module.escape(text)
    return _render_link_like(str(value), str(value), page, site, base_url, url_style)


def _render_link_like(label: str, target: str, page: VirtualPage, site: WikiSite, base_url: str, url_style: str) -> tuple[str, str]:
    href, external, target_page = _metadata_value_href(target, page, site, base_url, url_style)
    display_label = _display_label_for_target(label, target, target_page)
    escaped_label = html_module.escape(display_label)
    if href is None:
        return display_label, escaped_label
    if external:
        return display_label, f'<a href="{html_module.escape(href)}">{escaped_label}</a>'
    return display_label, f'<a class="wikilink" href="{html_module.escape(href)}">{escaped_label}</a>'


def _metadata_link_candidates(target: str, site: WikiSite) -> list[str]:
    """Build lookup keys for infobox values that may name another page."""
    candidate = target.strip()
    if not candidate:
        return []
    keys = [candidate]
    config = site.config
    if config is not None:
        expanded = expand_known_curie(candidate, config)
        if expanded not in keys:
            keys.append(expanded)
    if ":" in candidate and not is_external_link(candidate):
        prefix, local = candidate.split(":", 1)
        if prefix == "wiki" and local and local not in keys:
            keys.append(local)
    return keys


def _metadata_value_href(target: str, page: VirtualPage, site: WikiSite, base_url: str, url_style: str) -> tuple[str | None, bool, VirtualPage | None]:
    candidate = target.strip()
    if not candidate:
        return None, False, None
    if is_external_link(candidate):
        return candidate, True, None

    for key in _metadata_link_candidates(candidate, site):
        direct_route = site.routes_by_wiki_id.get(key)
        if direct_route is not None:
            target_page = site.pages_by_route.get(direct_route)
            return page_href(base_url, direct_route, url_style), False, target_page

    if candidate.startswith(page_href(base_url, "", url_style).rstrip("/")):
        return candidate, False, None

    for key in _metadata_link_candidates(candidate, site):
        if key.startswith(page.full_slug):
            target_page = site.pages_by_route.get(key)
            if target_page is not None:
                return page_href(base_url, key, url_style), False, target_page

        route = resolve_page_route(page.full_slug, key)
        if route is not None and route in site.pages_by_route:
            target_page = site.pages_by_route.get(route)
            return page_href(base_url, route, url_style), False, target_page

        if key in site.pages_by_route:
            target_page = site.pages_by_route.get(key)
            return page_href(base_url, key, url_style), False, target_page

    return None, False, None


def _display_label_for_target(label: str, target: str, target_page: VirtualPage | None) -> str:
    if target_page is None:
        return label
    normalized_label = label.strip()
    normalized_target = target.strip()
    if normalized_label == normalized_target or normalized_label in target_page.wiki_ids or normalized_label == target_page.file_slug:
        return target_page.title
    return label


def _layout_label(page: VirtualPage) -> str:
    if page.layout_stem == "default":
        return ""
    label = humanize_route(page.layout_stem)
    return f'<div class="layout-label">{html_module.escape(label)}</div>'


def _type_label(page: VirtualPage) -> str:
    raw_types = page.frontmatter.get("@type") or page.frontmatter.get("type")
    if not raw_types:
        return ""
    values = raw_types if isinstance(raw_types, list) else [raw_types]
    for val in values:
        if isinstance(val, str) and val.strip():
            val_clean = val.split(":", 1)[-1] if ":" in val else val
            return f'<div class="layout-label">{html_module.escape(val_clean.strip())}</div>'
    return ""



