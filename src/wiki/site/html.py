"""HTML shell assembly."""

from __future__ import annotations

import html as html_module
import json
from pathlib import Path
from typing import Any

from ..config import DEFAULT_URL_STYLE, Config
from ..format import process_rdf_format, resolve_metadata_pygments_lexer
from ..schemas.metadata import METADATA_VIEWS
from ..schemas.site import VirtualPage, WikiSite
from .backlinks import build_backlinks_html
from .layout_context import build_layout_context
from .layout_template import get_layout_renderer
from .markdown import _get_page_categories, page_href

# Fields hidden from the infobox and metadata views.
_HIDDEN_INFIXBOX_FIELDS = frozenset({
    "@context", "@id", "@type", "id", "type",
    "headline", "name", "wazoo:layout",
    "sh:property", "sh:targetClass", "sh:path", "sh:datatype", "sh:minCount",
})


def _escape(val: Any) -> str:
    return html_module.escape(str(val))


def _infobox_rows(frontmatter: dict[str, Any]) -> str:
    rows = ""
    for key, value in frontmatter.items():
        if key in _HIDDEN_INFIXBOX_FIELDS:
            continue
        if not isinstance(value, (str, int, float, bool, list, dict)):
            continue
        rows += f"<dt>{_escape(key)}</dt><dd>{_infobox_value(value)}</dd>\n"
    return rows


def _infobox_value(value: Any) -> str:
    if isinstance(value, dict):
        parts = "".join(
            f'<div class="infobox-dict-row"><span class="infobox-key">{_escape(k)}</span><span>{_infobox_value(v)}</span></div>'
            for k, v in value.items()
        )
        return f'<div class="infobox-dict">{parts}</div>'
    if isinstance(value, list):
        parts = "".join(
            f"<li class=\"infobox-chip\">{_infobox_value(item)}</li>"
            for item in value if isinstance(item, (str, int, float, bool))
        )
        return f'<ul class="infobox-list">{parts}</ul>'
    return _escape(value)


def build_toc_html(page: VirtualPage) -> str:
    """Render page outline as a Wikipedia-style table of contents."""
    if not page.outline:
        return ""
    items_html = ""
    for item in page.outline:
        items_html += f'<li class="l{item.level}"><a href="#{_escape(item.slug)}">{_escape(item.title)}</a></li>\n'
    return f"""<div class="toc" id="toc">
<div class="toctitle">
<h2>Contents</h2>
<span class="toctogglelink" id="toggleTocBtn" onclick="toggleToc()">[hide]</span>
</div>
<ul class="toc-list" id="toc-list">
{items_html}</ul>
</div>"""


def build_infobox_html(page: VirtualPage) -> str:
    """Render frontmatter as a Wikipedia-style infobox."""
    fm = page.frontmatter
    if not fm or all(k in _HIDDEN_INFIXBOX_FIELDS for k in fm):
        return ""
    title = page.title
    rows = _infobox_rows(fm)
    return f"""<div class="infobox">
<h2>{_escape(title)}</h2>
<dl>
{rows}</dl>
</div>"""


def build_categories_html(page: VirtualPage) -> str:
    """Render page type categories as a Wikipedia-style catlinks box."""
    cats = _get_page_categories(page)
    if not cats:
        return ""
    items = "".join(
        f'<li class="catlinks-item">{_escape(c)}</li>\n' for c in cats
    )
    return f"""<div class="catlinks">
<span class="catlinks-label">Categories:</span>
<ul class="catlinks-list">
{items}</ul>
</div>"""


def _build_metadata_format_panel(
    frontmatter: dict[str, Any],
    file_stem: str,
    config: Config,
    view_id: str,
    label: str,
    rdf_format: str,
    mode: str,
    lexer: str,
) -> str:
    """Render a single RDF format panel for the metadata view."""
    panel_visible = ' style="display:block"' if view_id == "json-ld-compacted" else ""
    result = process_rdf_format(
        frontmatter, file_stem, config.context, rdf_format, mode=mode
    )
    text = json.dumps(result, indent=2) if isinstance(result, (dict, list)) else str(result)
    escaped = html_module.escape(text)
    resolved_lexer = resolve_metadata_pygments_lexer(lexer)
    return f"""<div class="metadata-format-panel metadata-format-panel-{view_id}"{panel_visible}>
<pre data-copy="{_escape(text)}" class="highlight"><code class="language-{_escape(resolved_lexer)}">{escaped}</code></pre>
</div>"""


def _build_metadata_format_control(view_id: str, label: str, rdf_format: str) -> str:
    """Render a single format radio button + label for the metadata toolbar."""
    checked = ' checked' if view_id == "json-ld-compacted" else ""
    return f"""<input type="radio" name="metadata-format" class="metadata-format-input" id="fmt-{view_id}" value="{view_id}"{checked}>
<label class="metadata-format-label" for="fmt-{view_id}">{_escape(label)}</label>"""


def build_metadata_panel_html(page: VirtualPage, config: Config) -> str:
    """Render the full metadata view panel with format switcher."""
    fm = page.frontmatter
    if not fm:
        return ""
    controls = ""
    panels = ""
    file_stem = page.file_slug.replace("/", "_") or "index"
    for view in METADATA_VIEWS:
        controls += _build_metadata_format_control(view.id, view.label, view.format)
        panels += _build_metadata_format_panel(
            fm, file_stem, config, view.id, view.label, view.format, view.mode, view.lexer,
        )
    return f"""<div id="metadata-format-switch" class="metadata-format-switch">
<div class="metadata-format-toolbar">
<h3 class="metadata-format-heading">Serialization format</h3>
<div class="metadata-format-options">
{controls}</div>
</div>
<div class="metadata-format-panels">
{panels}</div>
</div>"""


def build_metadata_tool_html(page: VirtualPage) -> str:
    """Render sidebar link to the metadata view."""
    if not page.frontmatter:
        return ""
    return '<li><a href="javascript:void(0)" onclick="switchTab(\'metadata\')">View metadata</a></li>'


def build_metadata_tab_html(page: VirtualPage) -> str:
    """Render the Metadata tab for the vector tabs bar."""
    if not page.frontmatter:
        return ""
    return '<li id="ca-metadata"><a href="javascript:void(0)" onclick="switchTab(\'metadata\')">Metadata</a></li>'


def build_all_pages_json(site: WikiSite) -> str:
    """Serialize all pages for client-side search/random."""
    entries = []
    for page in site.pages:
        entries.append({"title": page.title, "slug": page.file_slug})
    return json.dumps(entries)


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
        base_url=base_url,
        url_style=url_style,
        content=page_content,
        site_obj=site,
    )

    renderer = get_layout_renderer(config_root)
    return renderer.render(default_layout, context)


def build_page_html(
    page: VirtualPage,
    config_root: Path,
    base_url: str = "/wiki",
    url_style: str = DEFAULT_URL_STYLE,
    default_layout: Path | None = None,
    site: WikiSite | None = None,
    config: Config | None = None,
) -> str:
    """Compile individual page HTML."""
    backlinks = ""
    if site is not None and page.backlink_slugs:
        backlinks = build_backlinks_html(page, site, base_url, url_style)
    if config is None:
        config = Config.for_root(config_root)

    context = build_layout_context(
        base_url=base_url,
        url_style=url_style,
        page=page,
        content=page.html,
        backlinks=backlinks,
        config=config,
        site_obj=site,
    )

    template_path = page.layout_path if page.layout_path is not None else default_layout
    renderer = get_layout_renderer(config_root)
    return renderer.render(template_path, context)

