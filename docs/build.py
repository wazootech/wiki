"""Build the wiki with the full Wikipedia-themed layout.

Usage: python build.py [--output-dir _site]

Depends on wazootech-wiki as a library.
"""

from __future__ import annotations

import argparse
import html as html_module
import json
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

import pygments
from pygments.util import ClassNotFound

from wiki.assets import build_asset_manifest
from wiki.config import Config
from wiki.format import (
    process_rdf_format,
    resolve_metadata_pygments_lexer,
    resolve_metadata_view,
)
from wiki.links import is_external_link, resolve_page_route
from wiki.paths import page_output_path
from wiki.schemas.metadata import METADATA_VIEWS
from wiki.schemas.site import VirtualPage, WikiSite
from wiki.site.backlinks import build_backlinks_html
from wiki.site.build import build_site, expand_known_curie
from wiki.site.layout_tokens import substitute
from wiki.site.markdown import (
    METADATA_HIDDEN_FIELDS,
    _get_page_categories,
    humanize_route,
    page_href,
    render_copyable_pre,
    render_outline_title,
)


@dataclass
class InfoboxRow:
    label: str
    text: str
    html: str


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


def _build_infobox_html(page: VirtualPage, site: WikiSite, base_url: str, url_style: str) -> str:
    rows = _build_infobox_rows(page, site, base_url, url_style)
    if not rows:
        return ""
    return f"""<section class="infobox page-meta">
<h2>Infobox</h2>
<dl>
{''.join(f'<dt>{html_module.escape(row.label)}</dt><dd>{row.html}</dd>' for row in rows)}
</dl>
</section>"""


def _build_infobox_rows(page: VirtualPage, site: WikiSite, base_url: str, url_style: str) -> list[InfoboxRow]:
    rows: list[InfoboxRow] = []
    for key, value in page.frontmatter.items():
        if key in METADATA_HIDDEN_FIELDS:
            continue
        text, html = _render_metadata_value_parts(value, page, site, base_url, url_style)
        if html:
            rows.append(InfoboxRow(label=str(key), text=text, html=html))
    return rows


def _render_metadata_value_parts(value, page, site, base_url, url_style):
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
        html = '<ul class="infobox-list">' + "".join(_infobox_list_item_html(item) for item in items) + "</ul>"
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
                rows.append(
                    f'<div class="infobox-dict-row"><span class="infobox-key">{html_module.escape(str(nested_key))}</span><span>{nested_html}</span></div>'
                )
                if nested_text:
                    text_parts.append(f"{nested_key}: {nested_text}")
        if not rows:
            return "", ""
        return "; ".join(text_parts), '<div class="infobox-dict">' + "".join(rows) + "</div>"
    if isinstance(value, bool):
        text = "True" if value else "False"
        return text, text
    if isinstance(value, (int, float)):
        text = str(value)
        return text, html_module.escape(text)
    text = str(value)
    if is_external_link(text) or ":" in text:
        return _render_link_like(text, text, page, site, base_url, url_style)
    escaped = html_module.escape(text)
    return text, escaped


def _infobox_list_item_html(html: str) -> str:
    if 'class="infobox-dict"' in html:
        return f'<li class="infobox-list-block">{html}</li>'
    return f'<li><span class="infobox-chip">{html}</span></li>'


def _render_link_like(label: str, target: str, page: VirtualPage, site: WikiSite, base_url: str, url_style: str):
    href, external, target_page = _metadata_value_href(target, page, site, base_url, url_style)
    display_label = _display_label_for_target(label, target, target_page)
    escaped_label = html_module.escape(display_label)
    if href is None:
        return display_label, escaped_label
    if external:
        return display_label, f'<a href="{html_module.escape(href)}">{escaped_label}</a>'
    return display_label, f'<a class="wikilink" href="{html_module.escape(href)}">{escaped_label}</a>'


def _metadata_link_candidates(target: str, site: WikiSite) -> list[str]:
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


def _metadata_value_href(target: str, page: VirtualPage, site: WikiSite, base_url: str, url_style: str):
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
            return page_href(base_url, key, url_style), False, target_page
        if key in site.pages_by_route:
            target_page = site.pages_by_route.get(key)
            return page_href(base_url, key, url_style), False, target_page
    return None, False, None


def _display_label_for_target(label: str, target: str, target_page):
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


def _metadata_view_dom_id(page: VirtualPage) -> str:
    import re
    safe_slug = re.sub(r"[^a-zA-Z0-9_-]+", "-", page.full_slug or "index").strip("-") or "index"
    return f"metadata-format-{safe_slug.lower()}"


def _metadata_content_for_page(page: VirtualPage, config: Config, view) -> tuple[str, str, str]:
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


def _highlight_metadata(value: str, lexer_name: str) -> str:
    try:
        lexer = pygments.lexers.get_lexer_by_name(resolve_metadata_pygments_lexer(lexer_name))
    except ClassNotFound:
        return html_module.escape(value)
    from pygments.formatters import HtmlFormatter
    return pygments.highlight(value, lexer, HtmlFormatter(nowrap=True))


def _build_categories_html(page: VirtualPage, base_url: str) -> str:
    cats = _get_page_categories(page)
    if not cats:
        return ""
    from urllib.parse import quote
    cat_items = "".join(
        f'<li class="catlinks-item"><a href="{base_url}/?category={quote(cat)}">{html_module.escape(cat)}</a></li>'
        for cat in cats
    )
    return f"""<div class="catlinks" id="catlinks">
<div class="catlinks-label">Categories:</div>
<ul class="catlinks-list">
{cat_items}
</ul>
</div>"""


def _build_token_map(page, site, base_url, url_style, pages_json, toc_html, infobox_html, backlinks_html,
                      categories_html, metadata_pane_html, metadata_tool_html, metadata_tab_html,
                      type_label_html, layout_label_html, slug_json, page_kind, layout_stem, body_html,
                      page_source, edit_link_html):
    return {
        "%wiki.base_url%": base_url,
        "%wiki.url_style%": url_style,
        "%wiki.pages%": pages_json,
        "%wiki.title%": page.title if page else "All Pages",
        "%wiki.slug%": slug_json,
        "%wiki.source%": page_source,
        "%wiki.layout_stem%": layout_stem,
        "%wiki.page_kind%": page_kind,
        "%wiki.body%": body_html,
        "%wiki.toc%": toc_html,
        "%wiki.backlinks%": backlinks_html,
        "%wiki.infobox%": infobox_html,
        "%wiki.categories%": categories_html,
        "%wiki.metadata_pane%": metadata_pane_html,
        "%wiki.metadata_tool%": metadata_tool_html,
        "%wiki.metadata_tab%": metadata_tab_html,
        "%wiki.type_label%": type_label_html,
        "%wiki.layout_label%": layout_label_html,
        "%wiki.edit_link%": edit_link_html,
        "%wiki.head%": f"<title>{html_module.escape(page.title if page else 'All Pages')} - Wiki</title>",
    }


def _build_index_page(site, base_url, url_style, pages_json, layout_text):
    links_html = ""
    seen_files: set[str] = set()
    for page in site.pages:
        if page.file_slug not in seen_files:
            seen_files.add(page.file_slug)
            cats = _get_page_categories(page)
            cats_attr = ",".join(cats)
            links_html += f'<li data-categories="{html_module.escape(cats_attr)}"><a href="{page_href(base_url, page.file_slug, url_style)}">{html_module.escape(page.title)}</a></li>\n'
    body_html = f'<ul class="pages-list">\n{links_html}</ul>'
    slug_json = json.dumps("__index__")
    tokens = _build_token_map(
        page=None, site=site, base_url=base_url, url_style=url_style,
        pages_json=pages_json, toc_html="", infobox_html="", backlinks_html="",
        categories_html="", metadata_pane_html="", metadata_tool_html="",
        metadata_tab_html="", type_label_html="", layout_label_html="",
        slug_json=slug_json, page_kind="index", layout_stem="index",
        body_html=body_html, page_source="", edit_link_html="",
    )
    return substitute(layout_text, tokens)


GITHUB_REPO = "wazootech/wiki"
GITHUB_BRANCH = "main"


def _page_edit_url(page: VirtualPage, repo_root: Path | None) -> str:
    if repo_root is None or page.source_path is None:
        return ""
    try:
        rel = page.source_path.resolve().relative_to(repo_root).as_posix()
    except ValueError:
        return ""
    return f"https://github.com/{GITHUB_REPO}/blob/{GITHUB_BRANCH}/{rel}"


def build(output_dir: Path) -> None:
    script_dir = Path(__file__).resolve().parent
    config_path = script_dir / "wiki.yml"
    output_dir = output_dir.resolve()

    config = Config.load(config_path)
    site = build_site(config)

    try:
        repo_root = Path(subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip())
    except (subprocess.CalledProcessError, FileNotFoundError):
        repo_root = None

    base_url = config.site.base_url if config.site.base_url is not None else "/wiki"
    url_style = config.site.url_style or "dir"
    base_path = base_url.strip("/")

    pages_json = json.dumps(
        [{"slug": p.full_slug, "title": p.title} for p in site.pages],
        default=str,
    )

    layout_path = script_dir / "layouts" / "wikipedia.html"
    layout_text = layout_path.read_text(encoding="utf-8")

    selected_view = resolve_metadata_view("json-ld", "compacted")

    if output_dir.exists():
        shutil.rmtree(output_dir)

    wiki_output = output_dir / base_path if base_path else output_dir
    wiki_output.mkdir(parents=True, exist_ok=True)

    index_html = _build_index_page(site, base_url, url_style, pages_json, layout_text)
    index_out = wiki_output / "index.html"
    index_out.parent.mkdir(parents=True, exist_ok=True)
    index_out.write_text(index_html, encoding="utf-8")

    written = 1
    for page in site.pages:
        has_metadata = page.has_frontmatter

        toc_html = _build_toc_html(page, base_url, url_style)
        backlinks_html = build_backlinks_html(page, site, base_url, url_style)
        infobox_html = _build_infobox_html(page, site, base_url, url_style)
        categories_html = _build_categories_html(page, base_url)

        layout_label_html = _layout_label(page)
        type_label_html = _type_label(page)

        metadata_pane_html = ""
        metadata_tool_html = ""
        metadata_tab_html = ""
        if has_metadata:
            metadata_pane_html = _build_metadata_panel_html(page, site, selected_view)
            metadata_tool_html = '<li><a href="#view-metadata-content" onclick="switchTab(\'metadata\'); return false;">View metadata</a></li>'
            metadata_tab_html = '<li id="ca-metadata"><a href="#view-metadata-content" onclick="switchTab(\'metadata\'); return false;">Metadata</a></li>'

        slug_json = json.dumps(page.full_slug)
        layout_stem = page.layout_stem

        edit_url = _page_edit_url(page, repo_root)
        edit_link_html = (
            f'<li id="ca-edit"><a href="{html_module.escape(edit_url)}" target="_blank">Edit this page</a></li>'
            if edit_url else ""
        )

        tokens = _build_token_map(
            page=page, site=site, base_url=base_url, url_style=url_style,
            pages_json=pages_json, toc_html=toc_html, infobox_html=infobox_html,
            backlinks_html=backlinks_html, categories_html=categories_html,
            metadata_pane_html=metadata_pane_html, metadata_tool_html=metadata_tool_html,
            metadata_tab_html=metadata_tab_html, type_label_html=type_label_html,
            layout_label_html=layout_label_html, slug_json=slug_json,
            page_kind="article", layout_stem=layout_stem,
            body_html=page.html, page_source=page.markdown,
            edit_link_html=edit_link_html,
        )

        html = substitute(layout_text, tokens)

        out = page_output_path(wiki_output, page.full_slug, url_style)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(html, encoding="utf-8")
        written += 1

    asset_entries = build_asset_manifest(config, wiki_output, base_url)
    for entry in asset_entries:
        entry.output_path.parent.mkdir(parents=True, exist_ok=True)
        if entry.source and entry.source.is_file():
            shutil.copy2(entry.source, entry.output_path)

    print(f"Built {written} pages to {output_dir}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build wiki with Wikipedia theme")
    parser.add_argument("--output-dir", default="_site", type=Path)
    args = parser.parse_args()
    build(args.output_dir)


if __name__ == "__main__":
    main()
