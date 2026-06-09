"""Site-building logic for compiling raw Markdown wikis into HTML virtual structures."""

from __future__ import annotations

import html as html_module
import json
import re
from pathlib import Path
from typing import Any
from urllib.parse import quote

from markdown_it import MarkdownIt
from pygments import highlight
from pygments.formatters import HtmlFormatter
from pygments.lexers import get_lexer_by_name
from pygments.util import ClassNotFound
from wiki.mdit_py_plugins.wikilink import wikilink_plugin

from .config import DEFAULT_URL_STYLE, Config
from .format import process_rdf_format, resolve_metadata_pygments_lexer, resolve_metadata_view
from .schemas.metadata import METADATA_VIEWS
from .schemas.site import InfoboxRow, TocItem, VirtualPage, WikiSite
from .headings import GitHubHeadingSlugger, heading_slug
from .links import is_external_link, markdown_link_is_page, resolve_page_href, resolve_page_route
from .paths import iter_document_files, page_url, route_for_document_file
from .parser import split_document_body

HEADING_RE = re.compile(r"^(#{1,6})\s+(.+)$", re.MULTILINE)
WIKILINK_RE = re.compile(r"\[\[([^\]|]+)(?:\|[^\]]*)?\]\]")

PYGMENTS_FORMATTER = HtmlFormatter(nowrap=True, style="native")
PYGMENTS_CSS = HtmlFormatter(style="native").get_style_defs(".highlight")


def _metadata_format_css() -> str:
    rules: list[str] = []
    for view in METADATA_VIEWS:
        view_id = view.id
        rules.append(
            f'.metadata-format-switch:has(.metadata-format-input[value="{view_id}"]:checked) '
            f".metadata-format-panel-{view_id} {{ display: block; }}"
        )
        rules.append(
            f'.metadata-format-input[value="{view_id}"]:checked + .metadata-format-label '
            "{ background: #36c; color: #fff; border-color: #36c; }"
        )
    return "\n".join(rules)


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

.portal-contents ul {
  padding-left: 0;
}

.portal-contents li {
  margin-bottom: 8px;
  line-height: 1.3;
}

.portal-contents .l3 { padding-left: 10px; }
.portal-contents .l4 { padding-left: 20px; }
.portal-contents .l5 { padding-left: 30px; }
.portal-contents .l6 { padding-left: 40px; }

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

.suggestion-item-empty {
  cursor: default;
  color: #72777d;
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

pre[data-copy] {
  position: relative;
  padding-top: 36px;
}

.code-block {
  display: flow-root;
  margin-bottom: 16px;
}

.code-block pre {
  margin-bottom: 0;
}

.code-copy-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 1;
  background-color: rgba(248, 249, 250, 0.92);
  color: #202122;
  border: 1px solid #a2a9b1;
  padding: 4px 10px;
  font-size: 0.75em;
  font-weight: 600;
  border-radius: 4px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease, background-color 0.15s ease;
}

pre[data-copy]:hover .code-copy-btn,
pre[data-copy]:focus-within .code-copy-btn,
.code-copy-btn:focus {
  opacity: 1;
}

.code-copy-btn:hover {
  background-color: #eaecf0;
}

.code-copy-btn-copied {
  background-color: #28a745 !important;
  color: #fff !important;
  border-color: #28a745 !important;
  opacity: 1 !important;
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
  min-width: 0;
  overflow-wrap: anywhere;
}

.infobox dd {
  margin: 0;
  min-width: 0;
  border-bottom: 1px solid #eaecf0;
  padding-bottom: 4px;
  color: #202122;
  overflow-wrap: anywhere;
}

.infobox-list {
  list-style: none;
  padding-left: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  max-width: 100%;
  min-width: 0;
}

.infobox-list > li {
  min-width: 0;
  max-width: 100%;
}

.infobox-chip {
  display: block;
  border: 1px solid #dbe4f0;
  border-radius: 4px;
  padding: 2px 8px;
  background: #ffffff;
  font-size: 0.9em;
  max-width: 100%;
  box-sizing: border-box;
  overflow-wrap: anywhere;
}

.infobox-dict {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
}

.infobox-dict-row {
  display: grid;
  grid-template-columns: minmax(0, auto) minmax(0, 1fr);
  gap: 4px 8px;
  padding: 4px 6px;
  background: #ffffff;
  border: 1px solid #dbe4f0;
  border-radius: 4px;
  font-size: 0.95em;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
}

.infobox-dict-row > span:last-child {
  min-width: 0;
  overflow-wrap: anywhere;
}

.infobox-key {
  font-weight: 600;
  color: #54595d;
  overflow-wrap: anywhere;
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

.metadata-panel.page-meta {
  padding: 10px 12px;
  margin-top: 12px;
}

.metadata-panel.page-meta h2 {
  display: none;
}

#view-metadata-content .firstHeading {
  font-size: 1.5em;
  margin-bottom: 2px;
}

#view-metadata-content #siteSub {
  margin-bottom: 10px;
  font-size: 0.75em;
}

.metadata-format-switch {
  position: relative;
}

.metadata-format-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 6px;
  margin-bottom: 6px;
}

.metadata-format-heading {
  margin: 0;
  font-size: 0.72em;
  font-weight: 600;
  color: #54595d;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  flex: 0 0 auto;
}

.metadata-format-options {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  flex: 1 1 auto;
}

.metadata-format-input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.metadata-format-label {
  display: inline-block;
  margin: 0;
  padding: 2px 7px;
  border: 1px solid #c8ccd1;
  border-radius: 4px;
  background: #fff;
  color: #202122;
  font-size: 0.72em;
  font-weight: 600;
  line-height: 1.3;
  cursor: pointer;
  white-space: nowrap;
}

.metadata-format-label:hover {
  background: #eaecf0;
}

.metadata-format-panels {
  margin-top: 0;
}

.metadata-format-panel {
  display: none;
}

.metadata-format-panel .highlight {
  margin: 0;
}

.metadata-format-panel pre {
  margin: 0;
  padding: 8px 10px !important;
  font-size: 0.8em;
  line-height: 1.35;
}

#view-metadata-content:target {
  display: block !important;
}

/* Template Label badge */
.layout-label {
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
""".strip().strip() + "\n\n" + _metadata_format_css() + "\n\n" + PYGMENTS_CSS

DEFAULT_MINIMAL_PAGE_LAYOUT = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>{page_title}</title>
</head>
<body>
<h1 id="firstHeading">{page_title}</h1>
{page_content}
</body>
</html>"""

METADATA_HIDDEN_FIELDS = {"@context", "@id", "id", "@type", "type"}


def slugify_segment(text: str) -> str:
    """Slugify a single path segment (no slashes)."""
    return heading_slug(text)


def slugify_path(text: str) -> str:
    """Slugify a potentially nested slug like 'people/Gregory Davidson' -> 'people/gregory-house'."""
    return "/".join(heading_slug(part) for part in text.split("/"))


def _url(base_url: str, slug: str, style: str) -> str:
    return page_url(base_url, slug, style)


def _get_page_categories(page: VirtualPage) -> list[str]:
    cats = []
    if page.layout_stem and page.layout_stem != "default":
        cats.append(page.layout_stem)
    
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


def render_copyable_pre(
    raw_text: str,
    code_inner_html: str,
    *,
    pre_class: str = "",
    code_class: str = "",
) -> str:
    """Render a pre/code block with data-copy for progressive clipboard enhancement."""
    copy_attr = html_module.escape(raw_text, quote=True)
    pre_class_attr = f' class="{pre_class}"' if pre_class else ""
    code_class_attr = f' class="{code_class}"' if code_class else ""
    return (
        f'<pre data-copy="{copy_attr}"{pre_class_attr}>'
        f"<code{code_class_attr}>{code_inner_html}</code></pre>\n"
    )


def _register_wiki_inline_render_rules(
    md: MarkdownIt,
    base_url: str,
    url_style: str,
    current_route: str,
    *,
    toc_mode: bool = False,
) -> None:
    md.use(wikilink_plugin)

    if toc_mode:

        def _wikilink_renderer(self: Any, tokens: Any, idx: int, options: Any, env: Any) -> str:
            token = tokens[idx]
            return f'<span class="wikilink">{html_module.escape(token.content)}</span>'

        def _link_open_renderer(self: Any, tokens: Any, idx: int, options: Any, env: Any) -> str:
            return '<span class="toc-inline-link">'

        def _link_close_renderer(self: Any, tokens: Any, idx: int, options: Any, env: Any) -> str:
            return "</span>"

        md.add_render_rule("wikilink", _wikilink_renderer)
        md.add_render_rule("link_open", _link_open_renderer)
        md.add_render_rule("link_close", _link_close_renderer)
        return

    def _wikilink_renderer(self: Any, tokens: Any, idx: int, options: Any, env: Any) -> str:
        token = tokens[idx]
        href = token.attrs.get("href", "")
        content = token.content
        resolved = resolve_page_href(current_route, href, base_url, url_style)
        if resolved is None:
            return html_module.escape(f"[[{href}|{content}]]" if content != href else f"[[{href}]]")
        return f'<a class="wikilink" href="{html_module.escape(resolved)}">{html_module.escape(content)}</a>'

    def _link_open_renderer(self: Any, tokens: Any, idx: int, options: Any, env: Any) -> str:
        token = tokens[idx]
        href = token.attrGet("href") or ""
        if href and not is_external_link(href) and markdown_link_is_page(href):
            resolved = resolve_page_href(current_route, href, base_url, url_style)
            if resolved is not None:
                token.attrSet("href", resolved)
        return self.renderToken(tokens, idx, options, env)

    md.add_render_rule("wikilink", _wikilink_renderer)
    md.add_render_rule("link_open", _link_open_renderer)


def render_outline_title(
    title: str,
    base_url: str = "/wiki",
    url_style: str = DEFAULT_URL_STYLE,
    current_route: str = "",
) -> str:
    """Render heading inline markdown for TOC labels without nested section links."""
    md = MarkdownIt("gfm-like", {"linkify": False})
    _register_wiki_inline_render_rules(md, base_url, url_style, current_route, toc_mode=True)
    return md.renderInline(title).strip()


def render_wiki_markdown(
    text: str,
    base_url: str = "/wiki",
    url_style: str = DEFAULT_URL_STYLE,
    current_route: str = "",
) -> str:
    md = MarkdownIt("gfm-like", {"linkify": False})
    _register_wiki_inline_render_rules(md, base_url, url_style, current_route)
    heading_slugger = GitHubHeadingSlugger()

    def _fence_renderer(self: Any, tokens: Any, idx: int, options: Any, env: Any) -> str:
        token = tokens[idx]
        info = (token.info or "").strip().split(maxsplit=1)
        language = info[0] if info else ""
        escaped_language = html_module.escape(language)
        escaped_code = html_module.escape(token.content)
        if not language:
            return render_copyable_pre(token.content, escaped_code)

        try:
            lexer = get_lexer_by_name(language)
        except ClassNotFound:
            return render_copyable_pre(
                token.content,
                escaped_code,
                code_class=f"language-{escaped_language}",
            )

        highlighted = highlight(token.content, lexer, PYGMENTS_FORMATTER)
        return render_copyable_pre(
            token.content,
            highlighted,
            pre_class="highlight",
            code_class=f"language-{escaped_language}",
        )

    md.add_render_rule("fence", _fence_renderer)

    def _heading_open_renderer(self: Any, tokens: Any, idx: int, options: Any, env: Any) -> str:
        token = tokens[idx]
        title = ""
        if idx + 1 < len(tokens) and getattr(tokens[idx + 1], "type", "") == "inline":
            title = tokens[idx + 1].content
        token.attrSet("id", heading_slugger.slug(title))
        return self.renderToken(tokens, idx, options, env)

    md.add_render_rule("heading_open", _heading_open_renderer)
    return md.render(text)


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


def _normalize_title(text: str) -> str:
    return " ".join(text.strip().casefold().split())


def _heading_text_for_title_match(text: str) -> str:
    """Normalize heading text for duplicate-title detection (unwrap inline code)."""
    plain = re.sub(r"`([^`\n]+)`", r"\1", text.strip())
    return _normalize_title(plain)


def strip_leading_title_heading(markdown: str, title: str) -> str:
    """Remove a leading # heading when it duplicates the page title."""
    if not _normalize_title(title):
        return markdown
    lines = markdown.split("\n")
    index = 0
    while index < len(lines) and not lines[index].strip():
        index += 1
    if index >= len(lines):
        return markdown
    match = HEADING_RE.match(lines[index])
    if match is None or len(match.group(1)) != 1:
        return markdown
    heading = match.group(2).strip()
    if _heading_text_for_title_match(heading) != _normalize_title(title):
        return markdown
    index += 1
    while index < len(lines) and not lines[index].strip():
        index += 1
    return "\n".join(lines[index:])


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
    input_dirs: Config | list[Path] | Path,
    base_url: str | None = None,
    url_style: str | None = None,
) -> WikiSite:
    """Build in-memory representation of the wiki site."""
    if isinstance(input_dirs, Config):
        config = input_dirs
    else:
        dirs_arg = [input_dirs] if isinstance(input_dirs, Path) else input_dirs
        config = Config.for_root(Path.cwd(), vault={"inputs": [str(p) for p in dirs_arg]})
    resolved_base_url = config.site.base_url if base_url is None else base_url
    resolved_url_style = config.site.url_style if url_style is None else url_style
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
        h1_title = (
            frontmatter.get("headline")
            or frontmatter.get("name")
            or extract_title(body, doc_slug)
        )
        h1_toc = extract_outline(body)
        wiki_ids = _page_wiki_ids(config, doc_slug, frontmatter)
        layout_path, layout_stem = _parse_page_layout(frontmatter, config.config_root)

        display_body = strip_leading_title_heading(body, h1_title)
        h1_html = render_wiki_markdown(
            display_body,
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
            layout_path=layout_path,
            layout_stem=layout_stem,
            wiki_ids=wiki_ids,
            outline=h1_toc,
            backlink_slugs=backlink_index.get(doc_slug, []),
        ))

    pages_by_route = {page.file_slug: page for page in pages}
    routes_by_wiki_id: dict[str, str] = {}
    for page in pages:
        for wiki_id in page.wiki_ids:
            routes_by_wiki_id[wiki_id] = page.file_slug

    return WikiSite(pages=pages, config=config, pages_by_route=pages_by_route, routes_by_wiki_id=routes_by_wiki_id)


def _logo_letter(site_title: str) -> str:
    from .config import DEFAULT_SITE_TITLE

    text = (site_title or DEFAULT_SITE_TITLE).strip() or DEFAULT_SITE_TITLE
    return text[0].upper()


def _build_logo_svg(letter: str) -> str:
    glyph = html_module.escape(letter)
    return f"""<svg viewBox="0 0 200 200" width="80" height="80" xmlns="http://www.w3.org/2000/svg">
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
  <text x="100" y="112" font-family="'Inter', sans-serif" font-size="36" font-weight="900" fill="#ffffff" text-anchor="middle" style="letter-spacing: -2px;">{glyph}</text>
</svg>"""


def _render_html(shell: str, context: dict[str, str]) -> str:
    """Replace {placeholder} tokens in shell with values from context."""
    # page_content is rendered markdown and may document placeholder names literally.
    # Substitute it last so tokens like {metadata_pane_html} in article bodies stay intact.
    deferred_keys = ("page_content",)
    result = shell
    for key, value in context.items():
        if key in deferred_keys:
            continue
        result = result.replace("{" + key + "}", value)
    for key in deferred_keys:
        if key in context:
            result = result.replace("{" + key + "}", context[key])
    return result


def build_index_html(
    site: WikiSite,
    base_url: str = "/wiki",
    url_style: str = DEFAULT_URL_STYLE,
    page_layout: str | None = None,
) -> str:
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

    site_title = site.config.site.title
    logo_svg = _build_logo_svg(_logo_letter(site_title))

    page_content = f'<ul class="pages-list">\n{links_html}</ul>'

    context = {
        "inline_css": INLINE_CSS,
        "base_url": base_url,
        "logo_svg": logo_svg,
        "site_title": html_module.escape(site_title),
        "page_title": "All Pages",
        "body_class": "wiki-index",
        "page_kind": "index",
        "url_style": url_style,
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

    shell = DEFAULT_MINIMAL_PAGE_LAYOUT if page_layout is None else page_layout
    return _render_html(shell, context)


def build_page_html(
    page: VirtualPage,
    site: WikiSite,
    base_url: str = "/wiki",
    url_style: str = DEFAULT_URL_STYLE,
    page_layout: str | None = None,
    metadata_mode: str = "compacted",
    metadata_format: str = "json-ld",
) -> str:
    """Compile individual page HTML."""
    selected_view = resolve_metadata_view(metadata_format, metadata_mode)
    toc_html = _build_toc_html(page, base_url, url_style)
    sidebar_contents_html = _build_sidebar_contents_html(page, base_url, url_style)
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

    layout_label = _layout_label(page)
    type_label = _type_label(page)
    layout_class = html_module.escape(page.layout_stem)

    # All Pages JSON for search and random redirect
    import json
    pages_data = [{"slug": p.full_slug, "title": p.title} for p in site.pages]
    pages_json = json.dumps(pages_data, default=str)

    site_title = site.config.site.title
    logo_svg = _build_logo_svg(_logo_letter(site_title))

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
        "base_url": base_url,
        "logo_svg": logo_svg,
        "site_title": html_module.escape(site_title),
        "page_title": html_module.escape(page.title),
        "body_class": f"wiki-page layout-{layout_class}",
        "page_kind": "article",
        "url_style": url_style,
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
        "source_markdown": html_module.escape(page.markdown),
        "metadata_tool_html": metadata_tool_html,
        "metadata_tab_html": metadata_tab_html,
        "metadata_pane_html": metadata_pane_html,
    }

    shell = _page_shell(page, page_layout)
    return _render_html(shell, context)


def _page_shell(page: VirtualPage, default_shell: str | None) -> str:
    if page.layout_path is not None:
        return page.layout_path.read_text(encoding="utf-8")
    return DEFAULT_MINIMAL_PAGE_LAYOUT if default_shell is None else default_shell


def _parse_page_layout(frontmatter: dict[str, Any], config_root: Path) -> tuple[Path | None, str]:
    from .layout import parse_layout_from_frontmatter

    return parse_layout_from_frontmatter(frontmatter, config_root)


def _page_wiki_ids(config: Config, route: str, frontmatter: dict[str, Any]) -> list[str]:
    values: list[str] = []
    for key in ("@id", "id"):
        raw = frontmatter.get(key)
        if isinstance(raw, str) and raw.strip():
            raw_value = raw.strip()
            values.append(raw_value)
            expanded = _expand_known_curie(raw_value, config)
            if expanded != raw_value:
                values.append(expanded)
    suffix = ".md" if config.graph.include_file_extension else ""
    values.append(f"{config.base_iri}{route}{suffix}")
    return list(dict.fromkeys(values))


def _expand_known_curie(value: str, config: Config) -> str:
    if ":" not in value or is_external_link(value) or value.lower().startswith("urn:"):
        return value
    prefix, local = value.split(":", 1)
    namespace = config.context.namespaces.get(prefix)
    if namespace is None:
        return value
    return f"{namespace}{local}"


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


def _build_metadata_panel_html(page: VirtualPage, site: WikiSite, selected_view: str) -> str:
    if not page.frontmatter:
        return ""

    page_config = site.config or Config.for_root(Path.cwd(), vault={"inputs": []})
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
        expanded = _expand_known_curie(candidate, config)
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
            return _url(base_url, direct_route, url_style), False, target_page

    if candidate.startswith(page_url(base_url, "", url_style).rstrip("/")):
        return candidate, False, None

    for key in _metadata_link_candidates(candidate, site):
        if key.startswith(page.full_slug):
            target_page = site.pages_by_route.get(key)
            if target_page is not None:
                return _url(base_url, key, url_style), False, target_page

        route = resolve_page_route(page.full_slug, key)
        if route is not None and route in site.pages_by_route:
            target_page = site.pages_by_route.get(route)
            return _url(base_url, route, url_style), False, target_page

        if key in site.pages_by_route:
            target_page = site.pages_by_route.get(key)
            return _url(base_url, key, url_style), False, target_page

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



