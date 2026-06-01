"""Site-building logic for compiling raw Markdown wikis into HTML virtual structures."""

from __future__ import annotations

import html as html_module
import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import quote

from markdown_it import MarkdownIt
from mdit_py_plugins.wikilink import wikilink_plugin

from .config import WikiConfig
from .headings import GitHubHeadingSlugger, heading_slug
from .links import is_external_link, markdown_link_is_page, resolve_page_href, resolve_page_route
from .paths import iter_document_files, page_url, route_for_document_file
from .parser import split_document_body

HEADING_RE = re.compile(r"^(#{1,6})\s+(.+)$", re.MULTILINE)
WIKILINK_RE = re.compile(r"\[\[([^\]|]+)(?:\|[^\]]*)?\]\]")

INLINE_CSS = """
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;line-height:1.6;max-width:960px;margin:0 auto;padding:20px;color:#1a1a2e;background:#fafafa}
a{color:#2563eb;text-decoration:none}
a:hover{text-decoration:underline}
a.wikilink{color:#2563eb}
h1,h2,h3,h4,h5,h6{margin-top:1.5em;margin-bottom:.5em;font-weight:600;line-height:1.3}
h1{font-size:2em;border-bottom:2px solid #e5e7eb;padding-bottom:.3em}
h2{font-size:1.5em;border-bottom:1px solid #e5e7eb;padding-bottom:.2em}
h3{font-size:1.25em}
p{margin-bottom:1em}
ul,ol{margin-bottom:1em;padding-left:2em}
pre{background:#1e1e2e;color:#cdd6f4;padding:16px;border-radius:8px;overflow-x:auto;margin-bottom:1em;font-size:.9em}
code{background:#f1f5f9;padding:2px 6px;border-radius:4px;font-size:.9em}
pre code{background:0 0;padding:0}
blockquote{border-left:4px solid #2563eb;padding-left:16px;color:#64748b;margin-bottom:1em}
table{border-collapse:collapse;width:100%;margin-bottom:1em}
th,td{border:1px solid #e5e7eb;padding:8px 12px;text-align:left}
th{background:#f8fafc;font-weight:600}
img{max-width:100%;height:auto}
header{border-bottom:1px solid #e5e7eb;padding-bottom:16px;margin-bottom:24px}
.pages-list,.backlinks-list,.outline-list{list-style:none;padding-left:0}
.pages-list li,.backlinks-list li,.outline-list li{padding:4px 0}
.pages-list .sub-page{padding-left:24px;font-size:.9em;color:#64748b}
.outline-list .l3{padding-left:0}
.outline-list .l4{padding-left:16px}
.outline-list .l5{padding-left:32px}
.outline-list .l6{padding-left:48px}
.page-meta{background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-top:32px}
.page-meta h2{font-size:1.1em;border:none;margin-top:0}
.page-shell{display:block}
.page-shell.template-person,.page-shell.template-thing,.page-shell.template-pet{display:grid;gap:24px;align-items:start}
.page-main article{min-width:0}
.page-sidebar{min-width:0}
.infobox{background:#fff;border:1px solid #dbe4f0;border-radius:12px;padding:18px;box-shadow:0 8px 24px rgba(15,23,42,.06)}
.infobox h2{font-size:1rem;border:none;margin:0 0 14px}
.infobox dl{display:grid;grid-template-columns:minmax(96px,140px) 1fr;gap:10px 14px}
.infobox dt{font-weight:600;color:#475569}
.infobox dd{margin:0;min-width:0}
.infobox-list{list-style:none;padding-left:0;margin:0;display:flex;flex-wrap:wrap;gap:8px}
.infobox-list li{margin:0}
.infobox-chip{display:inline-flex;align-items:center;border:1px solid #dbe4f0;border-radius:999px;padding:2px 10px;background:#f8fafc}
.infobox-dict{display:grid;gap:6px}
.infobox-dict-row{display:grid;grid-template-columns:minmax(72px,120px) 1fr;gap:8px}
.infobox-key{font-weight:600;color:#475569}
.template-label{display:inline-block;margin-bottom:12px;padding:4px 10px;border-radius:999px;background:#e0f2fe;color:#075985;font-size:.8rem;font-weight:600;text-transform:uppercase;letter-spacing:.04em}
.index-header{margin-bottom:24px}
.site-title{font-size:1.5em;font-weight:700;color:#1a1a2e;text-decoration:none}
@media (min-width: 900px){.page-shell.template-person,.page-shell.template-thing,.page-shell.template-pet{grid-template-columns:minmax(0,1fr) 300px}}
""".strip()

METADATA_HIDDEN_FIELDS = {"@context", "@id", "id", "@type", "type", "template", "wiki:template"}


def slugify_segment(text: str) -> str:
    """Slugify a single path segment (no slashes)."""
    return heading_slug(text)


def slugify_path(text: str) -> str:
    """Slugify a potentially nested slug like 'people/Gregory House' -> 'people/gregory-house'."""
    return "/".join(heading_slug(part) for part in text.split("/"))


def _url(base_url: str, slug: str, style: str) -> str:
    return page_url(base_url, slug, style)


def render_wiki_markdown(
    text: str,
    base_url: str = "/wiki",
    url_style: str = "file",
    markdown_flavor: str = "obsidian",
    current_route: str = "",
) -> str:
    md = MarkdownIt("gfm-like", {"linkify": False})
    if markdown_flavor == "obsidian":
        md.use(wikilink_plugin)
    heading_slugger = GitHubHeadingSlugger()

    def _wikilink_renderer(self: Any, tokens: Any, idx: int, options: Any, env: Any) -> str:
        token = tokens[idx]
        href = token.attrs.get("href", "")
        content = token.content
        resolved = resolve_page_href(current_route, href, base_url, url_style)
        if resolved is None:
            return html_module.escape(f"[[{href}|{content}]]" if content != href else f"[[{href}]]")
        return f'<a class="wikilink" href="{html_module.escape(resolved)}">{html_module.escape(content)}</a>'

    md.add_render_rule("wikilink", _wikilink_renderer)

    def _heading_open_renderer(self: Any, tokens: Any, idx: int, options: Any, env: Any) -> str:
        token = tokens[idx]
        title = ""
        if idx + 1 < len(tokens) and getattr(tokens[idx + 1], "type", "") == "inline":
            title = tokens[idx + 1].content
        token.attrSet("id", heading_slugger.slug(title))
        return self.renderToken(tokens, idx, options, env)

    md.add_render_rule("heading_open", _heading_open_renderer)

    def _link_open_renderer(self: Any, tokens: Any, idx: int, options: Any, env: Any) -> str:
        token = tokens[idx]
        href = token.attrGet("href") or ""
        if href and not is_external_link(href) and markdown_link_is_page(href):
            resolved = resolve_page_href(current_route, href, base_url, url_style)
            if resolved is not None:
                token.attrSet("href", resolved)
        return self.renderToken(tokens, idx, options, env)

    md.add_render_rule("link_open", _link_open_renderer)
    return md.render(text)


@dataclass
class TocItem:
    title: str
    slug: str
    level: int


@dataclass
class InfoboxRow:
    label: str
    text: str
    html: str


@dataclass
class VirtualPage:
    file_slug: str
    title: str
    markdown: str
    html: str
    frontmatter: dict[str, Any]
    type_names: list[str] = field(default_factory=list)
    template_name: str = "default.html"
    wiki_ids: list[str] = field(default_factory=list)
    outline: list[TocItem] = field(default_factory=list)
    backlink_slugs: list[str] = field(default_factory=list)

    @property
    def full_slug(self) -> str:
        return self.file_slug

    @property
    def has_frontmatter(self) -> bool:
        return bool(self.frontmatter)


@dataclass
class WikiSite:
    pages: list[VirtualPage]
    pages_by_route: dict[str, VirtualPage] = field(default_factory=dict)
    routes_by_wiki_id: dict[str, str] = field(default_factory=dict)


def split_by_headings(markdown: str) -> list[tuple[int, str, str]]:
    """Split markdown into sections at H1/H2 boundaries."""
    lines = markdown.split("\n")
    sections: list[tuple[int, str, str]] = []
    start = 0
    current_level = 0
    current_title: str | None = None

    for i, line in enumerate(lines):
        m = HEADING_RE.match(line)
        if m:
            level = len(m.group(1))
            if level in (1, 2):
                if current_title is not None:
                    sections.append((current_level, current_title, "\n".join(lines[start:i])))
                current_level = level
                current_title = m.group(2).strip()
                start = i

    if current_title is not None:
        sections.append((current_level, current_title, "\n".join(lines[start:])))
    elif not sections and markdown.strip():
        sections.append((1, "", markdown))

    return sections


def extract_title(markdown: str, fallback: str) -> str:
    for m in HEADING_RE.finditer(markdown):
        if len(m.group(1)) == 1:
            return m.group(2).strip()
    return humanize_route(fallback)


def humanize_route(route: str) -> str:
    stem = route.split("/")[-1] if route else "Index"
    return stem.replace("_", " ").replace("-", " ").strip() or "Index"


def extract_outline(markdown: str) -> list[TocItem]:
    outline: list[TocItem] = []
    slugger = GitHubHeadingSlugger()
    for m in HEADING_RE.finditer(markdown):
        level = len(m.group(1))
        title = m.group(2).strip()
        slug = slugger.slug(title)
        if 2 <= level <= 6:
            outline.append(TocItem(title=title, slug=slug, level=level))
    return outline


def build_site(
    input_dirs: WikiConfig | list[Path] | Path,
    base_url: str = "/wiki",
    url_style: str = "file",
) -> WikiSite:
    """Build in-memory representation of the wiki site."""
    if isinstance(input_dirs, WikiConfig):
        config = input_dirs
    else:
        dirs_arg = [input_dirs] if isinstance(input_dirs, Path) else input_dirs
        config = WikiConfig(input_dirs=dirs_arg)
    pages: list[VirtualPage] = []

    doc_files = sorted(iter_document_files(config))

    def file_slug(file_path: Path) -> str:
        return route_for_document_file(config, file_path)

    backlink_index: dict[str, list[str]] = {}
    for file_path in doc_files:
        if file_path.suffix.lower() != ".md":
            continue
        content = file_path.read_text(encoding="utf-8")
        source_slug = file_slug(file_path)
        for match in WIKILINK_RE.finditer(content):
            target = resolve_page_route(source_slug, match.group(1).strip())
            if target is None:
                continue
            if target not in backlink_index:
                backlink_index[target] = []
            if source_slug not in backlink_index[target]:
                backlink_index[target].append(source_slug)

    for file_path in doc_files:
        fm_data, body = split_document_body(file_path)
        frontmatter = fm_data if fm_data is not None else {}

        doc_slug = file_slug(file_path)
        h1_title = frontmatter.get("name") or extract_title(body, doc_slug)
        h1_toc = extract_outline(body)
        type_names = _page_type_names(frontmatter)
        wiki_ids = _page_wiki_ids(config, doc_slug, frontmatter)
        template_name = _select_template_name(frontmatter, type_names)

        h1_html = render_wiki_markdown(
            body,
            base_url=base_url,
            url_style=url_style,
            markdown_flavor=config.markdown_flavor,
            current_route=doc_slug,
        )
        pages.append(VirtualPage(
            file_slug=doc_slug,
            title=h1_title,
            markdown=body,
            html=h1_html,
            frontmatter=frontmatter,
            type_names=type_names,
            template_name=template_name,
            wiki_ids=wiki_ids,
            outline=h1_toc,
            backlink_slugs=backlink_index.get(doc_slug, []),
        ))

    pages_by_route = {page.file_slug: page for page in pages}
    routes_by_wiki_id: dict[str, str] = {}
    for page in pages:
        for wiki_id in page.wiki_ids:
            routes_by_wiki_id[wiki_id] = page.file_slug

    return WikiSite(pages=pages, pages_by_route=pages_by_route, routes_by_wiki_id=routes_by_wiki_id)


def build_index_html(site: WikiSite, base_url: str = "/wiki", url_style: str = "file") -> str:
    """Compile root Index page HTML."""
    links_html = ""
    seen_files: set[str] = set()
    for page in site.pages:
        if page.file_slug not in seen_files:
            seen_files.add(page.file_slug)
            links_html += f'<li><a href="{_url(base_url, page.file_slug, url_style)}">{html_module.escape(page.title)}</a></li>\n'

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Wiki Index</title>
<style>{INLINE_CSS}</style>
</head>
<body>
<header>
<a href="{base_url}/" class="site-title">Wiki</a>
<nav><a href="{base_url}/">Index</a></nav>
</header>
<main>
<h1>All Pages</h1>
<ul class="pages-list">
{links_html}
</ul>
</main>
</body>
</html>"""


def build_page_html(page: VirtualPage, site: WikiSite, base_url: str = "/wiki", url_style: str = "file") -> str:
    """Compile individual page HTML."""
    toc_html = _build_toc_html(page)
    bl_html = _build_backlinks_html(page, site, base_url, url_style)
    infobox_html = _build_infobox_html(page, site, base_url, url_style)
    fm_html = _build_metadata_json_html(page)
    content_html = page.html
    template_label = _template_label(page)
    shell_html = _render_page_shell(page, content_html, infobox_html, toc_html, bl_html, fm_html, template_label)

    nav_html = f'<a href="{base_url}/">Index</a>'

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>{html_module.escape(page.title)} — Wiki</title>
<style>{INLINE_CSS}</style>
</head>
<body>
<header>
<a href="{base_url}/" class="site-title">Wiki</a>
<nav>{nav_html}</nav>
</header>
<main>
{shell_html}
</main>
</body>
</html>"""


def _page_type_names(frontmatter: dict[str, Any]) -> list[str]:
    raw_types = frontmatter.get("@type") or frontmatter.get("type")
    if raw_types is None:
        return []
    values = raw_types if isinstance(raw_types, list) else [raw_types]
    return [_type_template_name(value) for value in values if _type_template_name(value)]


def _type_template_name(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    text = value.strip()
    if not text:
        return ""
    if ":" in text:
        text = text.split(":", 1)[1]
    elif "/" in text:
        text = text.rstrip("/").rsplit("/", 1)[-1]
    return f"{text}.html"


def _select_template_name(frontmatter: dict[str, Any], type_names: list[str]) -> str:
    override = frontmatter.get("wiki:template") or frontmatter.get("template")
    if isinstance(override, str) and override.strip():
        return _normalize_template_name(override)
    for type_name in type_names:
        if _template_stem(type_name) in {"person", "thing", "pet"}:
            return type_name
    return type_names[0] if type_names else "default.html"


def _normalize_template_name(value: str) -> str:
    template_name = value.strip().replace("\\", "/")
    if not template_name:
        return "default.html"
    template_name = template_name.rsplit("/", 1)[-1]
    if "." not in template_name:
        return f"{template_name}.html"
    return template_name


def _template_stem(template_name: str) -> str:
    stem = Path(template_name).stem
    return heading_slug(stem)


def _page_wiki_ids(config: WikiConfig, route: str, frontmatter: dict[str, Any]) -> list[str]:
    values: list[str] = []
    for key in ("@id", "id"):
        raw = frontmatter.get(key)
        if isinstance(raw, str) and raw.strip():
            raw_value = raw.strip()
            values.append(raw_value)
            expanded = _expand_known_curie(raw_value, config)
            if expanded != raw_value:
                values.append(expanded)
    suffix = ".md" if config.uri_ext else ""
    values.append(f"{config.wiki_base}{route}{suffix}")
    return list(dict.fromkeys(values))


def _expand_known_curie(value: str, config: WikiConfig) -> str:
    if ":" not in value or is_external_link(value) or value.lower().startswith("urn:"):
        return value
    prefix, local = value.split(":", 1)
    namespace = config.context.namespaces.get(prefix)
    if namespace is None:
        return value
    return f"{namespace}{local}"


def _build_toc_html(page: VirtualPage) -> str:
    if not page.outline:
        return ""
    items = ""
    for item in page.outline:
        items += f'<li class="l{item.level}"><a href="#{item.slug}">{html_module.escape(item.title)}</a></li>\n'
    return f"""<section class="page-meta">
<h2>On this page</h2>
<ul class="outline-list">
{items}
</ul>
</section>"""


def _build_backlinks_html(page: VirtualPage, site: WikiSite, base_url: str, url_style: str) -> str:
    if not page.backlink_slugs:
        return ""
    items = ""
    for bl in page.backlink_slugs:
        target = site.pages_by_route.get(bl)
        title = target.title if target is not None else bl.replace("-", " ").title()
        route = target.full_slug if target is not None else bl
        items += f'<li><a href="{_url(base_url, route, url_style)}">{html_module.escape(title)}</a></li>\n'
    return f"""<section class="page-meta">
<h2>Backlinks</h2>
<ul class="backlinks-list">
{items}
</ul>
</section>"""


def _build_metadata_json_html(page: VirtualPage) -> str:
    if not page.frontmatter:
        return ""
    return f"""<section class="page-meta">
<h2>Metadata</h2>
<pre><code>{html_module.escape(json.dumps(page.frontmatter, indent=2, default=str))}</code></pre>
</section>"""


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
        label = _humanize_field_name(key)
        text, html = _render_metadata_value_parts(value, page, site, base_url, url_style)
        if html:
            rows.append(InfoboxRow(label=label, text=text, html=html))
    return rows


def _humanize_field_name(key: str) -> str:
    clean = key.split(":", 1)[-1] if ":" in key else key
    clean = clean.lstrip("@")
    return clean.replace("_", " ").strip().title()


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
        html = '<ul class="infobox-list">' + ''.join(f'<li><span class="infobox-chip">{item}</span></li>' for item in items) + '</ul>'
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
                nested_label = _humanize_field_name(str(nested_key))
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


def _metadata_value_href(target: str, page: VirtualPage, site: WikiSite, base_url: str, url_style: str) -> tuple[str | None, bool, VirtualPage | None]:
    candidate = target.strip()
    if not candidate:
        return None, False, None
    if is_external_link(candidate):
        return candidate, True, None

    direct_route = site.routes_by_wiki_id.get(candidate)
    if direct_route is not None:
        target_page = site.pages_by_route.get(direct_route)
        return _url(base_url, direct_route, url_style), False, target_page

    if candidate.startswith(page_url(base_url, "", url_style).rstrip("/")):
        return candidate, False, None

    if candidate.startswith(page.full_slug):
        target_page = site.pages_by_route.get(candidate)
        return _url(base_url, candidate, url_style), False, target_page

    route = resolve_page_route(page.full_slug, candidate)
    if route is not None and route in site.pages_by_route:
        target_page = site.pages_by_route.get(route)
        return _url(base_url, route, url_style), False, target_page

    if candidate in site.pages_by_route:
        target_page = site.pages_by_route.get(candidate)
        return _url(base_url, candidate, url_style), False, target_page

    return None, False, None


def _display_label_for_target(label: str, target: str, target_page: VirtualPage | None) -> str:
    if target_page is None:
        return label
    normalized_label = label.strip()
    normalized_target = target.strip()
    if normalized_label == normalized_target or normalized_label in target_page.wiki_ids or normalized_label == target_page.file_slug:
        return target_page.title
    return label


def _template_label(page: VirtualPage) -> str:
    label = humanize_route(Path(page.template_name).stem)
    if label == "Default":
        return ""
    return f'<div class="template-label">{html_module.escape(label)}</div>'


def _render_page_shell(
    page: VirtualPage,
    content_html: str,
    infobox_html: str,
    toc_html: str,
    bl_html: str,
    fm_html: str,
    template_label: str,
) -> str:
    sidebar = infobox_html + toc_html + bl_html + fm_html
    template_class = html_module.escape(_template_stem(page.template_name))
    if _template_stem(page.template_name) in {"person", "thing", "pet"}:
        return f"""<div class="page-shell template-{template_class}">
<section class="page-main">
{template_label}
<article>
{content_html}
</article>
</section>
<aside class="page-sidebar">
{sidebar}
</aside>
</div>"""

    return f"""<div class="page-shell template-{template_class}">
{template_label}
<article>
{content_html}
</article>
{sidebar}
</div>"""
