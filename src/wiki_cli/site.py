"""Site-building logic for compiling raw Markdown wikis into HTML virtual structures."""

from __future__ import annotations

import html as html_module
import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from markdown_it import MarkdownIt
from mdit_py_plugins.wikilink import wikilink_plugin

from .parser import split_frontmatter_body

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
.index-header{margin-bottom:24px}
.site-title{font-size:1.5em;font-weight:700;color:#1a1a2e;text-decoration:none}
""".strip()


def slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9\s-]", "", text)
    text = re.sub(r"[\s-]+", "-", text)
    return text.strip("-")


def _url(base_url: str, slug: str, style: str) -> str:
    return f"{base_url}/{slug}.html" if style == "file" else f"{base_url}/{slug}"


def render_wiki_markdown(text: str, base_url: str = "/wiki", url_style: str = "file") -> str:
    md = MarkdownIt("gfm-like", {"linkify": False})
    md.use(wikilink_plugin)

    def _wikilink_renderer(self: Any, tokens: Any, idx: int, options: Any, env: Any) -> str:
        token = tokens[idx]
        href = token.attrs.get("href", "")
        content = token.content
        slug = slugify(href)
        return f'<a class="wikilink" href="{_url(base_url, slug, url_style)}">{html_module.escape(content)}</a>'

    md.add_render_rule("wikilink", _wikilink_renderer)
    return md.render(text)


@dataclass
class TocItem:
    title: str
    slug: str
    level: int


@dataclass
class VirtualPage:
    file_slug: str
    section_slug: str | None
    title: str
    level: int
    markdown: str
    html: str
    frontmatter: dict[str, Any]
    outline: list[TocItem] = field(default_factory=list)
    backlink_slugs: list[str] = field(default_factory=list)

    @property
    def full_slug(self) -> str:
        if self.section_slug:
            return f"{self.file_slug}/{self.section_slug}"
        return self.file_slug

    @property
    def has_frontmatter(self) -> bool:
        return bool(self.frontmatter)


@dataclass
class WikiSite:
    pages: list[VirtualPage]


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


def build_site(input_dirs: list[Path] | Path, base_url: str = "/wiki", url_style: str = "file") -> WikiSite:
    """Build in-memory representation of the wiki site."""
    dirs = [input_dirs] if isinstance(input_dirs, Path) else input_dirs
    pages: list[VirtualPage] = []

    md_files: list[Path] = []
    for d in dirs:
        if d.exists():
            md_files.extend(sorted(d.glob("*.md")))
    md_files.sort()

    backlink_index: dict[str, list[str]] = {}
    for md in md_files:
        content = md.read_text(encoding="utf-8")
        for match in WIKILINK_RE.finditer(content):
            target = slugify(match.group(1).strip())
            if target not in backlink_index:
                backlink_index[target] = []
            if md.stem not in backlink_index[target]:
                backlink_index[target].append(md.stem)

    for md in md_files:
        raw = md.read_text(encoding="utf-8")
        fm_data, body = split_frontmatter_body(raw)
        frontmatter = fm_data if fm_data is not None else {}

        sections = split_by_headings(body)

        all_section_md = "\n".join(section_md for _, _, section_md in sections)
        h1_title = sections[0][1] if sections else md.stem.replace("-", " ").title()

        h1_toc = []
        for m in HEADING_RE.finditer(all_section_md):
            lvl = len(m.group(1))
            if 3 <= lvl <= 6:
                h1_toc.append(TocItem(title=m.group(2).strip(), slug=slugify(m.group(2).strip()), level=lvl))

        h1_html = render_wiki_markdown(all_section_md, base_url=base_url, url_style=url_style)
        pages.append(VirtualPage(
            file_slug=md.stem,
            section_slug=None,
            title=h1_title,
            level=1,
            markdown=all_section_md,
            html=h1_html,
            frontmatter=frontmatter,
            outline=h1_toc,
            backlink_slugs=backlink_index.get(md.stem, []),
        ))

        for level, title, section_md in sections:
            if level != 2:
                continue
            section_slug = slugify(title)
            toc = []
            for m in HEADING_RE.finditer(section_md):
                lvl = len(m.group(1))
                if 3 <= lvl <= 6:
                    toc.append(TocItem(title=m.group(2).strip(), slug=slugify(m.group(2).strip()), level=lvl))

            html_content = render_wiki_markdown(section_md, base_url=base_url, url_style=url_style)
            bl = backlink_index.get(section_slug, []) or backlink_index.get(md.stem, [])
            pages.append(VirtualPage(
                file_slug=md.stem,
                section_slug=section_slug,
                title=title,
                level=2,
                markdown=section_md,
                html=html_content,
                frontmatter=frontmatter,
                outline=toc,
                backlink_slugs=bl,
            ))

    return WikiSite(pages=pages)


def build_index_html(site: WikiSite, base_url: str = "/wiki", url_style: str = "file") -> str:
    """Compile root Index page HTML."""
    links_html = ""
    seen_files: set[str] = set()
    for page in site.pages:
        if page.file_slug not in seen_files:
            seen_files.add(page.file_slug)
            links_html += f'<li><a href="{_url(base_url, page.file_slug, url_style)}">{html_module.escape(page.title)}</a></li>\n'
            for sub in site.pages:
                if sub.file_slug == page.file_slug and sub.section_slug:
                    links_html += (
                        f'<li class="sub-page"><a href="{_url(base_url, sub.full_slug, url_style)}">'
                        f"{html_module.escape(sub.title)}</a></li>\n"
                    )

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
    toc_html = ""
    if page.outline:
        items = ""
        for item in page.outline:
            items += f'<li class="l{item.level}"><a href="#{item.slug}">{html_module.escape(item.title)}</a></li>\n'
        toc_html = f"""<section class="page-meta">
<h2>On this page</h2>
<ul class="outline-list">
{items}
</ul>
</section>"""

    bl_html = ""
    if page.backlink_slugs:
        items = ""
        for bl in page.backlink_slugs:
            target: str | None = None
            for p in site.pages:
                if p.file_slug == bl and not p.section_slug:
                    target = p.full_slug
                    break
                if p.file_slug == bl:
                    target = p.full_slug
            if target is None:
                target = bl
            items += f'<li><a href="{_url(base_url, target, url_style)}">{html_module.escape(bl.replace("-", " ").title())}</a></li>\n'
        bl_html = f"""<section class="page-meta">
<h2>Backlinks</h2>
<ul class="backlinks-list">
{items}
</ul>
</section>"""

    fm_html = ""
    if page.frontmatter:
        fm_html = f"""<section class="page-meta">
<h2>Metadata</h2>
<pre><code>{html_module.escape(json.dumps(page.frontmatter, indent=2, default=str))}</code></pre>
</section>"""

    nav_html = f'<a href="{base_url}/">Index</a>'
    if page.level == 2 and page.section_slug:
        nav_html += f' | <a href="{_url(base_url, page.file_slug, url_style)}">Parent: {page.file_slug.replace("-", " ").title()}</a>'

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
<article>
{page.html}
</article>
{toc_html}
{bl_html}
{fm_html}
</main>
</body>
</html>"""
