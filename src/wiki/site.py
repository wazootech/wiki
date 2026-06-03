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
from wiki.mdit_py_plugins.wikilink import wikilink_plugin

from .config import DEFAULT_URL_STYLE, WikiConfig
from .headings import GitHubHeadingSlugger, heading_slug
from .links import is_external_link, markdown_link_is_page, resolve_page_href, resolve_page_route
from .paths import iter_document_files, page_url, route_for_document_file
from .parser import split_document_body

HEADING_RE = re.compile(r"^(#{1,6})\s+(.+)$", re.MULTILINE)
WIKILINK_RE = re.compile(r"\[\[([^\]|]+)(?:\|[^\]]*)?\]\]")

INLINE_CSS = """
/* Google Fonts */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;900&family=Playfair+Display:ital,wght@0,600;0,700;1,400&display=swap');

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  line-height: 1.6;
  color: #202122;
  background: #f6f6f6;
  min-height: 100vh;
}

a {
  color: #0645ad;
  text-decoration: none;
  transition: color 0.1s ease;
}

a:hover {
  text-decoration: underline;
  color: #0b0080;
}

/* Sidebar Styling */
#mw-navigation {
  position: absolute;
  top: 0;
  left: 0;
  width: 11em;
  padding: 24px 16px;
  font-size: 0.85em;
  background: #f6f6f6;
}

#p-logo {
  text-align: center;
  margin-bottom: 24px;
}

#p-logo a {
  display: inline-block;
  transition: transform 0.2s ease;
}

#p-logo a:hover {
  transform: scale(1.05);
}

.logo-text {
  display: block;
  font-weight: 700;
  font-size: 1.1em;
  color: #202122;
  margin-top: 8px;
  letter-spacing: -0.5px;
}

.portal {
  margin-bottom: 20px;
}

.portal h3 {
  font-size: 0.75em;
  color: #72777d;
  text-transform: uppercase;
  font-weight: 600;
  margin-bottom: 8px;
  border-bottom: 1px solid #c8ccd1;
  padding-bottom: 4px;
  letter-spacing: 0.5px;
}

.portal ul {
  list-style: none;
  padding-left: 4px;
}

.portal li {
  margin-bottom: 6px;
}

.portal a {
  color: #54595d;
}

.portal a:hover {
  color: #0645ad;
}

/* Search Box */
#p-search {
  position: relative;
}

.search-container {
  position: relative;
  display: flex;
  align-items: center;
  border: 1px solid #a2a9b1;
  background: #fff;
  padding: 4px 10px;
  border-radius: 4px;
  width: 280px;
  box-shadow: inset 0 1px 2px rgba(0,0,0,0.05);
  transition: border-color 0.2s, box-shadow 0.2s;
}

.search-container:focus-within {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}

.search-input {
  border: none;
  outline: none;
  width: 100%;
  font-size: 0.85em;
  font-family: inherit;
}

.search-button {
  background: none;
  border: none;
  cursor: pointer;
  color: #72777d;
  font-size: 0.9em;
  padding-left: 6px;
}

.search-suggestions {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: #fff;
  border: 1px solid #c8ccd1;
  z-index: 1000;
  box-shadow: 0 10px 25px rgba(0,0,0,0.08);
  max-height: 300px;
  overflow-y: auto;
  border-radius: 6px;
}

.suggestion-item {
  padding: 10px 14px;
  cursor: pointer;
  font-size: 0.85em;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #f6f6f6;
  transition: background 0.15s;
}

.suggestion-item:hover, .suggestion-item.selected {
  background: #f0f3f9;
}

.suggestion-title {
  font-weight: 600;
  color: #202122;
}

.suggestion-type {
  font-size: 0.75em;
  color: #72777d;
  background: #f1f5f9;
  padding: 2px 6px;
  border-radius: 4px;
}

/* Vector navigation tabs wrapper */
.vector-navigation-wrapper {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
  margin-left: 11em;
  padding: 8px 40px 0 0;
  background: #f6f6f6;
  border-bottom: 1px solid #a2a9b1;
}

.vector-navigation-left,
.vector-navigation-right {
  display: flex;
  align-items: flex-end;
}

.vector-navigation-search {
  margin-left: auto;
  padding-bottom: 6px;
}

.vector-tabs {
  display: flex;
  list-style: none;
}

.vector-tabs li {
  margin-right: 2px;
}

.vector-tabs a {
  display: block;
  padding: 8px 16px;
  background: #eaecf0;
  border: 1px solid #a2a9b1;
  border-bottom: none;
  border-radius: 4px 4px 0 0;
  color: #54595d;
  font-size: 0.8em;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  transition: all 0.15s ease;
  margin-bottom: -1px;
}

.vector-tabs li.selected a {
  background: #ffffff;
  border-color: #a2a9b1 #a2a9b1 #ffffff #a2a9b1;
  color: #202122;
  position: relative;
  z-index: 2;
  top: 1px;
}

.vector-tabs a:hover {
  background: #f8f9fa;
  color: #202122;
}

/* Main Content styling */
#content {
  margin-left: 11em;
  background: #ffffff;
  border-left: 1px solid #a2a9b1;
  padding: 30px 40px 48px;
  min-height: calc(100vh - 48px);
}

.firstHeading {
  font-family: 'Playfair Display', 'Linux Libertine', Georgia, serif;
  font-size: 2.2em;
  font-weight: 600;
  color: #000000;
  margin-bottom: 4px;
  line-height: 1.25;
}

#siteSub {
  font-size: 0.8em;
  color: #72777d;
  margin-bottom: 20px;
  font-style: italic;
}

/* Article content layout styling */
h2 {
  font-family: 'Playfair Display', 'Linux Libertine', Georgia, serif;
  font-size: 1.5em;
  font-weight: 600;
  border-bottom: 1px solid #a2a9b1;
  padding-bottom: 4px;
  margin-top: 32px;
  margin-bottom: 16px;
}

h3 {
  font-size: 1.2em;
  margin-top: 24px;
  margin-bottom: 12px;
  font-weight: 600;
}

p {
  margin-bottom: 16px;
  color: #202122;
  font-size: 0.95em;
}

ul, ol {
  margin-bottom: 16px;
  padding-left: 24px;
  font-size: 0.95em;
}

li {
  margin-bottom: 6px;
}

.vector-tabs {
  margin: 0;
  padding-left: 0;
}

.vector-tabs li {
  margin-bottom: 0;
}

pre {
  background: #1e1e2e;
  color: #cdd6f4;
  padding: 16px;
  border-radius: 6px;
  overflow-x: auto;
  margin-bottom: 16px;
  font-size: 0.85em;
  box-shadow: inset 0 2px 8px rgba(0,0,0,0.15);
}

code {
  background: #f1f5f9;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.85em;
  color: #0f172a;
}

pre code {
  background: none;
  padding: 0;
  color: inherit;
}

blockquote {
  border-left: 4px solid #3b82f6;
  padding-left: 16px;
  color: #475569;
  font-style: italic;
  margin: 16px 0 20px;
}

/* Table styling */
table {
  border-collapse: collapse;
  width: 100%;
  margin-bottom: 24px;
  font-size: 0.9em;
}

th, td {
  border: 1px solid #dbe4f0;
  padding: 10px 14px;
  text-align: left;
}

th {
  background: #f8fafc;
  font-weight: 600;
  color: #334155;
}

/* Table of Contents (TOC) */
.toc {
  border: 1px solid #a2a9b1;
  background-color: #f8f9fa;
  padding: 12px 18px;
  font-size: 0.9em;
  display: table;
  margin-bottom: 24px;
  border-radius: 4px;
  min-width: 240px;
}

.toctitle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.toctitle h2 {
  font-family: inherit;
  font-size: 1em;
  font-weight: bold;
  border: none;
  margin: 0;
  padding: 0;
}

.toctogglelink {
  font-size: 0.8em;
  font-weight: normal;
  color: #0645ad;
  cursor: pointer;
  user-select: none;
}

.toc-list {
  list-style: none;
  padding: 0 !important;
  margin: 0 !important;
}

.toc-list li {
  margin-bottom: 4px;
}

.toc-list .l3 { padding-left: 16px; }
.toc-list .l4 { padding-left: 32px; }
.toc-list .l5 { padding-left: 48px; }
.toc-list .l6 { padding-left: 64px; }

/* Infobox Styling (preserving class names for compatibility) */
.infobox {
  float: right;
  width: 300px;
  margin: 0 0 20px 24px;
  background: #f8f9fa;
  border: 1px solid #a2a9b1;
  border-radius: 4px;
  padding: 4px;
  clear: none;
  font-size: 0.85em;
  box-shadow: 0 2px 8px rgba(0,0,0,0.03);
}

.infobox h2 {
  font-family: inherit;
  font-size: 1.15em;
  border: none;
  margin: 0 0 10px;
  text-align: center;
  background: #eaecf0;
  padding: 8px;
  color: #202122;
  font-weight: bold;
  border-radius: 2px;
}

.infobox dl {
  display: grid;
  grid-template-columns: 110px 1fr;
  gap: 8px 12px;
}

.infobox dt {
  font-weight: 600;
  color: #54595d;
  border-bottom: 1px solid #eaecf0;
  padding-bottom: 4px;
}

.infobox dd {
  margin: 0;
  min-width: 0;
  border-bottom: 1px solid #eaecf0;
  padding-bottom: 4px;
  color: #202122;
}

.infobox-list {
  list-style: none;
  padding-left: 0;
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.infobox-chip {
  display: inline-flex;
  align-items: center;
  border: 1px solid #dbe4f0;
  border-radius: 4px;
  padding: 2px 8px;
  background: #ffffff;
  font-size: 0.9em;
}

/* Category Links box */
.catlinks {
  border: 1px solid #a2a9b1;
  background-color: #f8f9fa;
  padding: 10px 16px;
  margin-top: 40px;
  clear: both;
  font-size: 0.85em;
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.catlinks-label {
  font-weight: bold;
  color: #72777d;
}

.catlinks-list {
  display: flex;
  gap: 8px;
  list-style: none;
  padding: 0 !important;
  margin: 0 !important;
}

.catlinks-item::after {
  content: " |";
  color: #a2a9b1;
  margin-left: 8px;
}

.catlinks-item:last-child::after {
  content: "";
}

/* Views panes */
.wiki-view-pane {
  animation: fadeIn 0.2s ease-in-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Notes Textarea and Buttons */
textarea.wiki-textarea {
  width: 100%;
  height: 350px;
  padding: 16px;
  font-family: 'Inter', sans-serif;
  font-size: 0.95em;
  border: 1px solid #a2a9b1;
  border-radius: 6px;
  outline: none;
  resize: vertical;
  margin-top: 12px;
  transition: border-color 0.2s;
}

textarea.wiki-textarea:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}

.wiki-btn-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 12px;
}

.wiki-btn {
  background-color: #f8f9fa;
  color: #202122;
  border: 1px solid #a2a9b1;
  padding: 8px 16px;
  font-size: 0.85em;
  font-weight: 600;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.wiki-btn:hover {
  background-color: #eaecf0;
}

.wiki-btn-primary {
  background-color: #3b82f6;
  color: #ffffff;
  border-color: #2563eb;
}

.wiki-btn-primary:hover {
  background-color: #2563eb;
}

.char-counter {
  font-size: 0.8em;
  color: #72777d;
}

/* Page footer */
.wiki-footer {
  margin-top: 48px;
  border-top: 1px solid #eaecf0;
  padding-top: 16px;
  font-size: 0.75em;
  color: #72777d;
  line-height: 1.6;
}

/* Backlinks / outline sections in Read view */
.page-meta {
  background: #f8f9fa;
  border: 1px solid #eaecf0;
  border-radius: 6px;
  padding: 16px;
  margin-top: 32px;
}

.page-meta h2 {
  font-family: inherit;
  font-size: 1.1em;
  border: none;
  margin-top: 0;
  margin-bottom: 12px;
  color: #54595d;
}

/* Template Label badge */
.template-label {
  display: inline-block;
  margin-bottom: 6px;
  padding: 2px 6px;
  border-radius: 4px;
  background: #e0f2fe;
  color: #0369a1;
  font-size: 0.65rem;
  font-weight: 700;
  line-height: 1.2;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  #mw-navigation {
    position: relative;
    width: 100%;
    border-bottom: 1px solid #eaecf0;
  }
  .vector-navigation-wrapper {
    margin-left: 0;
    padding: 8px 16px 0;
    flex-wrap: wrap;
    align-items: stretch;
  }
  .vector-navigation-left,
  .vector-navigation-right {
    order: 2;
  }
  .vector-navigation-search {
    order: 1;
    width: 100%;
    margin-left: 0;
    padding-bottom: 8px;
  }
  .search-container {
    width: 100%;
  }
  #content {
    margin-left: 0;
    padding: 24px 16px;
    border-left: none;
  }
  .infobox {
    float: none;
    width: 100%;
    margin: 20px 0;
  }
}
""".strip().strip()

METADATA_HIDDEN_FIELDS = {"@context", "@id", "id", "@type", "type", "template", "wiki:template"}


def slugify_segment(text: str) -> str:
    """Slugify a single path segment (no slashes)."""
    return heading_slug(text)


def slugify_path(text: str) -> str:
    """Slugify a potentially nested slug like 'people/Gregory House' -> 'people/gregory-house'."""
    return "/".join(heading_slug(part) for part in text.split("/"))


def _url(base_url: str, slug: str, style: str) -> str:
    return page_url(base_url, slug, style)


def _get_page_categories(page: VirtualPage) -> list[str]:
    cats = []
    if page.template_name and page.template_name != "default.html":
        cats.append(page.template_name.replace(".html", ""))
    
    raw_types = page.frontmatter.get("@type") or page.frontmatter.get("type")
    if raw_types:
        values = raw_types if isinstance(raw_types, list) else [raw_types]
        for val in values:
            if isinstance(val, str):
                val_clean = val.split(":", 1)[-1] if ":" in val else val
                cats.append(val_clean)
                
    seen = set()
    unique_cats = []
    for c in cats:
        c_clean = c.strip()
        if c_clean and c_clean.lower() not in seen:
            seen.add(c_clean.lower())
            unique_cats.append(c_clean)
    return unique_cats


def render_wiki_markdown(
    text: str,
    base_url: str = "/wiki",
    url_style: str = DEFAULT_URL_STYLE,
    current_route: str = "",
) -> str:
    md = MarkdownIt("gfm-like", {"linkify": False})
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
    base_url: str | None = None,
    url_style: str | None = None,
) -> WikiSite:
    """Build in-memory representation of the wiki site."""
    if isinstance(input_dirs, WikiConfig):
        config = input_dirs
    else:
        dirs_arg = [input_dirs] if isinstance(input_dirs, Path) else input_dirs
        config = WikiConfig(input_dirs=dirs_arg)
    resolved_base_url = config.base_url if base_url is None else base_url
    resolved_url_style = config.url_style if url_style is None else url_style
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
            base_url=resolved_base_url,
            url_style=resolved_url_style,
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


def build_index_html(site: WikiSite, base_url: str = "/wiki", url_style: str = DEFAULT_URL_STYLE) -> str:
    """Compile root Index page HTML."""
    links_html = ""
    seen_files: set[str] = set()
    for page in site.pages:
        if page.file_slug not in seen_files:
            seen_files.add(page.file_slug)
            cats = _get_page_categories(page)
            cats_attr = ",".join(cats)
            links_html += f'<li data-categories="{html_module.escape(cats_attr)}"><a href="{_url(base_url, page.file_slug, url_style)}">{html_module.escape(page.title)}</a></li>\n'

    # All Pages JSON for search and random redirect
    import json
    pages_data = [{"slug": p.full_slug, "title": p.title} for p in site.pages]
    pages_json = json.dumps(pages_data, default=str)

    # Wikipedia SVG Logo
    logo_svg = """<svg viewBox="0 0 200 200" width="80" height="80" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="globeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#3b82f6" />
      <stop offset="100%" stop-color="#1d4ed8" />
    </linearGradient>
    <linearGradient id="gridGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.8" />
      <stop offset="100%" stop-color="#93c5fd" stop-opacity="0.3" />
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
  <text x="100" y="112" font-family="'Inter', sans-serif" font-size="36" font-weight="900" fill="#ffffff" text-anchor="middle" style="letter-spacing: -2px;">W</text>
</svg>"""

    template = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Wiki Index</title>
<style>{INLINE_CSS}</style>
</head>
<body>

<!-- Left Navigation Sidebar -->
<aside id="mw-navigation">
  <div id="p-logo" role="banner">
    <a href="{base_url}/" title="Visit the main page">
      {logo_svg}
      <span class="logo-text">LLM WIKI</span>
    </a>
  </div>
  <div class="portal" role="navigation" id="p-navigation">
    <h3>Navigation</h3>
    <ul>
      <li><a href="{base_url}/">Main page</a></li>
      <li><a href="{base_url}/">Contents</a></li>
      <li><a href="javascript:void(0)" onclick="goToRandomArticle()" title="Load a random page">Random article</a></li>
    </ul>
  </div>
</aside>

<!-- Vector tabs wrapper -->
<div class="vector-navigation-wrapper">
  <div class="vector-navigation-left">
    <ul class="vector-tabs">
      <li class="selected"><a href="{base_url}/">Special Page</a></li>
    </ul>
  </div>
  <div class="vector-navigation-search">
    <div id="p-search" role="search">
      <div class="search-container">
        <input type="search" id="searchInput" placeholder="Search LLM Wiki" class="search-input" oninput="onSearchInput(event)" onkeydown="handleSearchKey(event)">
        <button class="search-button" type="button" aria-label="Search" onclick="triggerSearch()">&#x1F50D;</button>
      </div>
      <div id="search-suggestions" class="search-suggestions" style="display: none;"></div>
    </div>
  </div>
</div>

<!-- Main Content Panel -->
<main id="content" class="mw-body" role="main">
  <h1 class="firstHeading" id="firstHeading">All Pages</h1>
  <div id="siteSub">Index of all documents in the semantic wiki</div>
  
  <ul class="pages-list">
    {links_html}
  </ul>
  
  <!-- Standard Wikipedia-like Footer -->
  <footer class="wiki-footer">
    <p>This page is powered by the LLM Wiki CLI.</p>
  </footer>
</main>

<script>
// Embedded client logic
const ALL_PAGES = {pages_json};
const WIKI_BASE_URL = "{base_url}";
const WIKI_URL_STYLE = "{url_style}";
const CURRENT_SLUG = "";

function goToRandomArticle() {
  if (ALL_PAGES.length === 0) return;
  const randomPage = ALL_PAGES[Math.floor(Math.random() * ALL_PAGES.length)];
  let url = '';
  if (WIKI_URL_STYLE === 'dir') {
    url = WIKI_BASE_URL + '/' + (randomPage.slug ? randomPage.slug + '/' : '');
  } else {
    url = WIKI_BASE_URL + '/' + (randomPage.slug ? randomPage.slug + '.' + 'html' : 'index.' + 'html');
  }
  window.location.href = url;
}

function triggerSearch() {
  const query = document.getElementById('searchInput').value.toLowerCase().trim();
  if (!query) return;
  const matches = ALL_PAGES.filter(p => 
    p.title.toLowerCase().includes(query) || 
    p.slug.toLowerCase().includes(query)
  );
  if (matches.length > 0) {
    navigateSearch(matches[0].slug);
  }
}

let selectedSuggestionIndex = -1;

function onSearchInput(e) {
  const query = e.target.value.toLowerCase().trim();
  const suggestionsBox = document.getElementById('search-suggestions');
  if (!suggestionsBox) return;
  
  if (!query) {
    suggestionsBox.style.display = 'none';
    suggestionsBox.innerHTML = '';
    selectedSuggestionIndex = -1;
    return;
  }
  
  const matches = ALL_PAGES.filter(p => 
    p.title.toLowerCase().includes(query) || 
    p.slug.toLowerCase().includes(query)
  ).slice(0, 8);
  
  if (matches.length === 0) {
    suggestionsBox.style.display = 'block';
    suggestionsBox.innerHTML = '<div class="suggestion-item" style="cursor: default; color: #72777d;">No matches found</div>';
    selectedSuggestionIndex = -1;
    return;
  }
  
  suggestionsBox.innerHTML = matches.map((p, idx) => {
    return `<div class="suggestion-item" data-slug="${p.slug}" data-idx="${idx}" onclick="navigateSearch('${p.slug}')">
      <span class="suggestion-title">${escapeHtml(p.title)}</span>
      <span class="suggestion-type">${escapeHtml(p.slug)}</span>
    </div>`;
  }).join('');
  suggestionsBox.style.display = 'block';
  selectedSuggestionIndex = -1;
}

function handleSearchKey(e) {
  const suggestionsBox = document.getElementById('search-suggestions');
  if (!suggestionsBox || suggestionsBox.style.display === 'none') return;
  
  const items = suggestionsBox.querySelectorAll('.suggestion-item');
  if (items.length === 0 || (items.length === 1 && items[0].style.cursor === 'default')) return;
  
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    selectedSuggestionIndex = (selectedSuggestionIndex + 1) % items.length;
    highlightSuggestion(items);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    selectedSuggestionIndex = (selectedSuggestionIndex - 1 + items.length) % items.length;
    highlightSuggestion(items);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (selectedSuggestionIndex >= 0 && selectedSuggestionIndex < items.length) {
      const slug = items[selectedSuggestionIndex].getAttribute('data-slug');
      navigateSearch(slug);
    } else if (items.length > 0) {
      const slug = items[0].getAttribute('data-slug');
      navigateSearch(slug);
    }
  } else if (e.key === 'Escape') {
    suggestionsBox.style.display = 'none';
  }
}

function highlightSuggestion(items) {
  items.forEach((item, idx) => {
    if (idx === selectedSuggestionIndex) {
      item.classList.add('selected');
      item.scrollIntoView({ block: 'nearest' });
    } else {
      item.classList.remove('selected');
    }
  });
}

function navigateSearch(slug) {
  let url = '';
  if (WIKI_URL_STYLE === 'dir') {
    url = WIKI_BASE_URL + '/' + (slug ? slug + '/' : '');
  } else {
    url = WIKI_BASE_URL + '/' + (slug ? slug + '.' + 'html' : 'index.' + 'html');
  }
  window.location.href = url;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

document.addEventListener('click', (e) => {
  const searchBox = document.getElementById('searchInput');
  const suggestionsBox = document.getElementById('search-suggestions');
  if (suggestionsBox && e.target !== searchBox && !suggestionsBox.contains(e.target)) {
    suggestionsBox.style.display = 'none';
  }
});

function applyCategoryFilterFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const cat = params.get('category');
  if (!cat) return;
  
  const mainHeading = document.querySelector('main h1');
  if (mainHeading) {
    mainHeading.innerHTML = `Pages in Category: <span style="color: #54595d; font-family: sans-serif; font-size: 0.85em;">${escapeHtml(cat)}</span>`;
    
    const clearLink = document.createElement('a');
    clearLink.href = WIKI_BASE_URL + '/';
    clearLink.innerText = ' [show all pages]';
    clearLink.style.fontSize = '0.5em';
    clearLink.style.marginLeft = '12px';
    clearLink.style.fontWeight = 'normal';
    mainHeading.appendChild(clearLink);
  }
  
  document.querySelectorAll('.pages-list li').forEach(li => {
    const catsAttr = li.getAttribute('data-categories') || '';
    const cats = catsAttr.split(',').map(c => c.trim().toLowerCase());
    if (cats.includes(cat.toLowerCase())) {
      li.style.display = '';
    } else {
      li.style.display = 'none';
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  applyCategoryFilterFromUrl();
});
</script>
</body>
</html>"""

    return (template
            .replace("{INLINE_CSS}", INLINE_CSS)
            .replace("{base_url}", base_url)
            .replace("{logo_svg}", logo_svg)
            .replace("{links_html}", links_html)
            .replace("{pages_json}", pages_json)
            .replace("{url_style}", url_style))


def build_page_html(page: VirtualPage, site: WikiSite, base_url: str = "/wiki", url_style: str = DEFAULT_URL_STYLE) -> str:
    """Compile individual page HTML."""
    toc_html = _build_toc_html(page)
    bl_html = _build_backlinks_html(page, site, base_url, url_style)
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

    # Template Label
    template_label = _template_label(page)
    template_class = html_module.escape(_template_stem(page.template_name))

    # All Pages JSON for search and random redirect
    import json
    pages_data = [{"slug": p.full_slug, "title": p.title} for p in site.pages]
    pages_json = json.dumps(pages_data, default=str)

    # Wikipedia SVG Logo
    logo_svg = """<svg viewBox="0 0 200 200" width="80" height="80" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="globeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#3b82f6" />
      <stop offset="100%" stop-color="#1d4ed8" />
    </linearGradient>
    <linearGradient id="gridGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.8" />
      <stop offset="100%" stop-color="#93c5fd" stop-opacity="0.3" />
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
  <text x="100" y="112" font-family="'Inter', sans-serif" font-size="36" font-weight="900" fill="#ffffff" text-anchor="middle" style="letter-spacing: -2px;">W</text>
</svg>"""

    metadata_formatted = json.dumps(page.frontmatter, indent=2, default=str)
    if page.has_frontmatter:
        metadata_tool_html = '<li><a href="javascript:void(0)" onclick="switchTab(\'metadata\')">View metadata</a></li>'
        metadata_tab_html = '<li id="ca-metadata"><a href="javascript:void(0)" onclick="switchTab(\'metadata\')">Metadata (JSON)</a></li>'
        metadata_pane_html = f"""<!-- METADATA VIEW (JSON-LD frontmatter) -->
    <div id="view-metadata-content" class="wiki-view-pane" style="display: none;">
      <h1 class="firstHeading">Metadata: {html_module.escape(page.title)}</h1>
      <div id="siteSub">JSON representation compiled from frontmatter</div>
      
      <pre><code>{html_module.escape(metadata_formatted)}</code></pre>
    </div>"""
    else:
        metadata_tool_html = ""
        metadata_tab_html = ""
        metadata_pane_html = ""

    template = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>{page_title} - Wiki</title>
<style>{INLINE_CSS}</style>
</head>
<body>

<!-- Left Navigation Sidebar -->
<aside id="mw-navigation">
  <div id="p-logo" role="banner">
    <a href="{base_url}/" title="Visit the main page">
      {logo_svg}
      <span class="logo-text">LLM WIKI</span>
    </a>
  </div>
  <div class="portal" role="navigation" id="p-navigation">
    <h3>Navigation</h3>
    <ul>
      <li><a href="{base_url}/">Main page</a></li>
      <li><a href="{base_url}/">Contents</a></li>
      <li><a href="javascript:void(0)" onclick="goToRandomArticle()" title="Load a random page">Random article</a></li>
    </ul>
  </div>
  <div class="portal" role="navigation" id="p-tools">
    <h3>Tools</h3>
    <ul>
      {metadata_tool_html}
      <li><a href="javascript:void(0)" onclick="switchTab('source')">View page source</a></li>
    </ul>
  </div>
</aside>

<!-- Vector tabs wrapper -->
<div class="vector-navigation-wrapper">
  <div class="vector-navigation-left">
    <ul class="vector-tabs">
      <li id="ca-read" class="selected"><a href="javascript:void(0)" onclick="switchTab('read')">Article</a></li>
      <li id="ca-talk"><a href="javascript:void(0)" onclick="switchTab('talk')">Talk / Notes</a></li>
    </ul>
  </div>
  <div class="vector-navigation-right">
    <ul class="vector-tabs">
      <li id="ca-source"><a href="javascript:void(0)" onclick="switchTab('source')">View source</a></li>
      {metadata_tab_html}
    </ul>
  </div>
  <div class="vector-navigation-search">
    <div id="p-search" role="search">
      <div class="search-container">
        <input type="search" id="searchInput" placeholder="Search LLM Wiki" class="search-input" oninput="onSearchInput(event)" onkeydown="handleSearchKey(event)">
        <button class="search-button" type="button" aria-label="Search" onclick="triggerSearch()">&#x1F50D;</button>
      </div>
      <div id="search-suggestions" class="search-suggestions" style="display: none;"></div>
    </div>
  </div>
</div>

<!-- Main Content Panel -->
<main id="content" class="mw-body" role="main">
  <div class="page-shell template-{template_class}">
    {template_label}
    
    <!-- READ VIEW (Rendered Article) -->
    <div id="view-read-content" class="wiki-view-pane">
      <h1 class="firstHeading" id="firstHeading">{page_title}</h1>
      <div id="siteSub">From LLM Wiki, the semantic knowledge base</div>
      
      <article>
        {infobox_html}
        {page_html_content}
      </article>
      
      {toc_html}
      {bl_html}
      {cats_html}
    </div>
    
    <!-- TALK VIEW (Local persistent notes) -->
    <div id="view-talk-content" class="wiki-view-pane" style="display: none;">
      <h1 class="firstHeading">Talk / Local Notes: {page_title}</h1>
      <div id="siteSub">Your personal scratchpad for this page (saved locally in browser)</div>
      
      <textarea id="talkNotesArea" class="wiki-textarea" placeholder="Write your notes or discussion comments here..." oninput="saveTalkNotes()"></textarea>
      <div class="wiki-btn-bar">
        <button type="button" class="wiki-btn" onclick="clearTalkNotes()">Clear Notes</button>
        <span class="char-counter" id="charCountDisplay">0 characters</span>
      </div>
    </div>
    
    <!-- VIEW SOURCE VIEW (Raw markdown source) -->
    <div id="view-source-content" class="wiki-view-pane" style="display: none;">
      <h1 class="firstHeading">View Source: {page_title}</h1>
      <div id="siteSub">Raw Markdown source code of the document</div>
      
      <textarea id="markdownSourceArea" class="wiki-textarea" readonly style="background: #fafafa; font-family: monospace;">{page_markdown_content}</textarea>
      <div class="wiki-btn-bar">
        <button type="button" id="copySourceBtn" class="wiki-btn wiki-btn-primary" onclick="copySourceCode()">Copy Markdown</button>
      </div>
    </div>
    
    {metadata_pane_html}
    
    <!-- Standard Wikipedia-like Footer -->
    <footer class="wiki-footer">
      <p>This page is powered by the LLM Wiki CLI. Dynamic semantic reasoning enabled by owlrl, RDF graph by rdflib.</p>
      <p>Content is available under Creative Commons Attribution-ShareAlike License unless otherwise noted.</p>
    </footer>
  </div>
</main>

<script>
// Embedded client logic
const ALL_PAGES = {pages_json};
const WIKI_BASE_URL = "{base_url}";
const WIKI_URL_STYLE = "{url_style}";
const CURRENT_SLUG = {current_slug_json};

function switchTab(viewName) {
  // Update tab styles
  document.querySelectorAll('.vector-tabs li').forEach(li => {
    li.classList.remove('selected');
  });
  
  // Highlight active tab
  let tabId = 'ca-read';
  if (viewName === 'talk') tabId = 'ca-talk';
  else if (viewName === 'source') tabId = 'ca-source';
  else if (viewName === 'metadata') tabId = 'ca-metadata';
  
  const tabEl = document.getElementById(tabId);
  if (tabEl) tabEl.classList.add('selected');

  // Hide all view panes
  document.querySelectorAll('.wiki-view-pane').forEach(pane => {
    pane.style.display = 'none';
  });
  
  // Show target view pane
  const paneEl = document.getElementById('view-' + viewName + '-content');
  if (paneEl) paneEl.style.display = 'block';
  
  // Custom view initializations
  if (viewName === 'talk') {
    loadTalkNotes();
  }
}

function loadTalkNotes() {
  const area = document.getElementById('talkNotesArea');
  if (!area) return;
  const saved = localStorage.getItem('wiki_notes_' + CURRENT_SLUG);
  area.value = saved || '';
  updateCharCount();
}

function saveTalkNotes() {
  const area = document.getElementById('talkNotesArea');
  if (!area) return;
  localStorage.setItem('wiki_notes_' + CURRENT_SLUG, area.value);
  updateCharCount();
}

function clearTalkNotes() {
  if (confirm('Are you sure you want to clear your local notes for this article?')) {
    const area = document.getElementById('talkNotesArea');
    if (area) {
      area.value = '';
      localStorage.removeItem('wiki_notes_' + CURRENT_SLUG);
      updateCharCount();
    }
  }
}

// Close suggestions on outside click
document.addEventListener('click', (e) => {
  const searchBox = document.getElementById('searchInput');
  const suggestionsBox = document.getElementById('search-suggestions');
  if (suggestionsBox && e.target !== searchBox && !suggestionsBox.contains(e.target)) {
    suggestionsBox.style.display = 'none';
  }
});

function updateCharCount() {
  const area = document.getElementById('talkNotesArea');
  const countEl = document.getElementById('charCountDisplay');
  if (!area || !countEl) return;
  const count = area.value.length;
  countEl.innerText = count + ' character' + (count === 1 ? '' : 's');
}

function copySourceCode() {
  const area = document.getElementById('markdownSourceArea');
  if (!area) return;
  area.select();
  area.setSelectionRange(0, 99999);
  navigator.clipboard.writeText(area.value).then(() => {
    const btn = document.getElementById('copySourceBtn');
    const originalText = btn.innerText;
    btn.innerText = 'Copied!';
    btn.style.background = '#28a745';
    btn.style.color = '#fff';
    setTimeout(() => {
      btn.innerText = originalText;
      btn.style.background = '';
      btn.style.color = '';
    }, 2000);
  });
}

function toggleToc() {
  const list = document.getElementById('toc-list');
  const toggleBtn = document.getElementById('toggleTocBtn');
  if (!list || !toggleBtn) return;
  
  if (list.style.display === 'none') {
    list.style.display = 'block';
    toggleBtn.innerText = '[hide]';
    localStorage.setItem('wiki_toc_visible', 'true');
  } else {
    list.style.display = 'none';
    toggleBtn.innerText = '[show]';
    localStorage.setItem('wiki_toc_visible', 'false');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const savedState = localStorage.getItem('wiki_toc_visible');
  const list = document.getElementById('toc-list');
  const toggleBtn = document.getElementById('toggleTocBtn');
  if (savedState === 'false' && list && toggleBtn) {
    list.style.display = 'none';
    toggleBtn.innerText = '[show]';
  }
  
  if (CURRENT_SLUG === '' || CURRENT_SLUG === 'index') {
    applyCategoryFilterFromUrl();
  }
});

function goToRandomArticle() {
  if (ALL_PAGES.length === 0) return;
  const randomPage = ALL_PAGES[Math.floor(Math.random() * ALL_PAGES.length)];
  let url = '';
  if (WIKI_URL_STYLE === 'dir') {
    url = WIKI_BASE_URL + '/' + (randomPage.slug ? randomPage.slug + '/' : '');
  } else {
    url = WIKI_BASE_URL + '/' + (randomPage.slug ? randomPage.slug + '.' + 'html' : 'index.' + 'html');
  }
  window.location.href = url;
}

function triggerSearch() {
  const query = document.getElementById('searchInput').value.toLowerCase().trim();
  if (!query) return;
  const matches = ALL_PAGES.filter(p => 
    p.title.toLowerCase().includes(query) || 
    p.slug.toLowerCase().includes(query)
  );
  if (matches.length > 0) {
    navigateSearch(matches[0].slug);
  }
}

let selectedSuggestionIndex = -1;

function onSearchInput(e) {
  const query = e.target.value.toLowerCase().trim();
  const suggestionsBox = document.getElementById('search-suggestions');
  if (!suggestionsBox) return;
  
  if (!query) {
    suggestionsBox.style.display = 'none';
    suggestionsBox.innerHTML = '';
    selectedSuggestionIndex = -1;
    return;
  }
  
  const matches = ALL_PAGES.filter(p => 
    p.title.toLowerCase().includes(query) || 
    p.slug.toLowerCase().includes(query)
  ).slice(0, 8);
  
  if (matches.length === 0) {
    suggestionsBox.style.display = 'block';
    suggestionsBox.innerHTML = '<div class="suggestion-item" style="cursor: default; color: #72777d;">No matches found</div>';
    selectedSuggestionIndex = -1;
    return;
  }
  
  suggestionsBox.innerHTML = matches.map((p, idx) => {
    return `<div class="suggestion-item" data-slug="${p.slug}" data-idx="${idx}" onclick="navigateSearch('${p.slug}')">
      <span class="suggestion-title">${escapeHtml(p.title)}</span>
      <span class="suggestion-type">${escapeHtml(p.slug)}</span>
    </div>`;
  }).join('');
  suggestionsBox.style.display = 'block';
  selectedSuggestionIndex = -1;
}

function handleSearchKey(e) {
  const suggestionsBox = document.getElementById('search-suggestions');
  if (!suggestionsBox || suggestionsBox.style.display === 'none') return;
  
  const items = suggestionsBox.querySelectorAll('.suggestion-item');
  if (items.length === 0 || (items.length === 1 && items[0].style.cursor === 'default')) return;
  
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    selectedSuggestionIndex = (selectedSuggestionIndex + 1) % items.length;
    highlightSuggestion(items);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    selectedSuggestionIndex = (selectedSuggestionIndex - 1 + items.length) % items.length;
    highlightSuggestion(items);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (selectedSuggestionIndex >= 0 && selectedSuggestionIndex < items.length) {
      const slug = items[selectedSuggestionIndex].getAttribute('data-slug');
      navigateSearch(slug);
    } else if (items.length > 0) {
      const slug = items[0].getAttribute('data-slug');
      navigateSearch(slug);
    }
  } else if (e.key === 'Escape') {
    suggestionsBox.style.display = 'none';
  }
}

function highlightSuggestion(items) {
  items.forEach((item, idx) => {
    if (idx === selectedSuggestionIndex) {
      item.classList.add('selected');
      item.scrollIntoView({ block: 'nearest' });
    } else {
      item.classList.remove('selected');
    }
  });
}

function navigateSearch(slug) {
  let url = '';
  if (WIKI_URL_STYLE === 'dir') {
    url = WIKI_BASE_URL + '/' + (slug ? slug + '/' : '');
  } else {
    url = WIKI_BASE_URL + '/' + (slug ? slug + '.' + 'html' : 'index.' + 'html');
  }
  window.location.href = url;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function applyCategoryFilterFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const cat = params.get('category');
  if (!cat) return;
  
  const mainHeading = document.querySelector('main h1');
  if (mainHeading) {
    mainHeading.innerHTML = `Pages in Category: <span style="color: #54595d; font-family: sans-serif; font-size: 0.85em;">${escapeHtml(cat)}</span>`;
    
    const clearLink = document.createElement('a');
    clearLink.href = WIKI_BASE_URL + '/';
    clearLink.innerText = ' [show all pages]';
    clearLink.style.fontSize = '0.5em';
    clearLink.style.marginLeft = '12px';
    clearLink.style.fontWeight = 'normal';
    mainHeading.appendChild(clearLink);
  }
  
  document.querySelectorAll('.pages-list li').forEach(li => {
    const catsAttr = li.getAttribute('data-categories') || '';
    const cats = catsAttr.split(',').map(c => c.trim().toLowerCase());
    if (cats.includes(cat.toLowerCase())) {
      li.style.display = '';
    } else {
      li.style.display = 'none';
    }
  });
}
</script>
</body>
</html>"""

    return (template
            .replace("{INLINE_CSS}", INLINE_CSS)
            .replace("{base_url}", base_url)
            .replace("{logo_svg}", logo_svg)
            .replace("{page_title}", html_module.escape(page.title))
            .replace("{template_class}", template_class)
            .replace("{template_label}", template_label)
            .replace("{infobox_html}", infobox_html)
            .replace("{page_html_content}", page.html)
            .replace("{toc_html}", toc_html)
            .replace("{bl_html}", bl_html)
            .replace("{cats_html}", cats_html)
            .replace("{page_markdown_content}", html_module.escape(page.markdown))
            .replace("{metadata_json_content}", html_module.escape(metadata_formatted))
            .replace("{pages_json}", pages_json)
            .replace("{url_style}", url_style)
            .replace("{current_slug_json}", json.dumps(page.full_slug))
            .replace("{metadata_tool_html}", metadata_tool_html)
            .replace("{metadata_tab_html}", metadata_tab_html)
            .replace("{metadata_pane_html}", metadata_pane_html))


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
        items += f'<li class="toclevel-{item.level - 1} l{item.level}"><a href="#{item.slug}">{html_module.escape(item.title)}</a></li>\n'
    return f"""<div class="toc" id="toc">
<div class="toctitle">
<h2>Contents<span style="display:none">On this page</span></h2>
<span class="toctogglelink" id="toggleTocBtn" onclick="toggleToc()">[hide]</span>
</div>
<ul class="toc-list" id="toc-list">
{items}
</ul>
</div>"""


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
        label = str(key)
        text, html = _render_metadata_value_parts(value, page, site, base_url, url_style)
        if html:
            rows.append(InfoboxRow(label=label, text=text, html=html))
    return rows
def _render_metadata_value(value: Any, page: VirtualPage, site: WikiSite, base_url: str, url_style: str) -> str:
    if value is None:
        return ""
    if isinstance(value, list):
        items = [item for item in (_render_metadata_value(v, page, site, base_url, url_style) for v in value) if item]
        if not items:
            return ""
        return '<ul class="infobox-list">' + ''.join(f'<li><span class="infobox-chip">{item}</span></li>' for item in items) + '</ul>'


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
    template_class = html_module.escape(_template_stem(page.template_name))
    return f"""<div class="page-shell template-{template_class}">
{template_label}
<article>
{infobox_html}
{content_html}
</article>
{toc_html}
{bl_html}
{fm_html}
</div>"""
