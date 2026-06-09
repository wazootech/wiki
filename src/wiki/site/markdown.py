"""Markdown rendering and document extraction for site building."""

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

from ..config import DEFAULT_URL_STYLE, Config
from ..headings import GitHubHeadingSlugger, heading_slug, parse_headings
from ..format import process_rdf_format, resolve_metadata_pygments_lexer, resolve_metadata_view
from ..schemas.metadata import METADATA_VIEWS
from ..schemas.site import InfoboxRow, TocItem, VirtualPage, WikiSite
from ..links import is_external_link, markdown_link_is_page, resolve_page_href, resolve_page_route
from ..paths import iter_document_files, page_url, route_for_document_file
from ..parser import split_document_body

HEADING_RE = re.compile(r"^(#{1,6})\s+(.+)$", re.MULTILINE)

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


def _load_layout_default_css() -> str:
    from importlib.resources import files

    return files("wiki.templates").joinpath("layout_default.css.j2").read_text(
        encoding="utf-8"
    )


INLINE_CSS = (
    _load_layout_default_css().strip()
    + "\n\n"
    + _metadata_format_css()
    + "\n\n"
    + PYGMENTS_CSS
)

DEFAULT_MINIMAL_PAGE_LAYOUT = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta name="theme-color" content="{theme_color}">
<meta name="msapplication-TileColor" content="{theme_color}">
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


def page_href(base_url: str, slug: str, style: str) -> str:
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
    for heading in parse_headings(markdown):
        if heading.level == 1:
            return heading.text.strip()
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
    for heading in parse_headings(markdown):
        if 2 <= heading.level <= 6:
            outline.append(TocItem(title=heading.text.strip(), slug=heading.slug, level=heading.level))
    return outline


