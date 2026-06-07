"""Link parsing and resolution helpers for Markdown and Obsidian wiki links."""

from __future__ import annotations

import posixpath
from pathlib import PurePosixPath
from urllib.parse import unquote, urlsplit

from .headings import heading_slug
from .paths import page_url


EXTERNAL_SCHEMES = {"http", "https", "mailto", "tel"}
PAGE_LINK_EXTENSIONS = {"", ".md", ".yaml", ".yml", ".json"}


def is_external_link(target: str) -> bool:
    scheme = urlsplit(target).scheme.lower()
    return scheme in EXTERNAL_SCHEMES


def split_target(target: str) -> tuple[str, str | None]:
    page, sep, fragment = target.partition("#")
    return page, fragment if sep else None


def fragment_id(fragment: str | None) -> str:
    if not fragment:
        return ""
    return heading_slug(unquote(fragment).strip())


def resolve_page_route(current_route: str, target: str) -> str | None:
    page_part, _ = split_target(target)
    page_part = unquote(page_part).replace("\\", "/").strip()
    if page_part.startswith("/"):
        return None
    suffix = PurePosixPath(page_part).suffix.lower()
    if suffix in {".md", ".yaml", ".yml", ".json"}:
        page_part = page_part[: -len(suffix)]
    current_dir = posixpath.dirname(current_route)
    raw = page_part or "."
    combined = posixpath.normpath(posixpath.join(current_dir, raw))
    if combined == ".":
        combined = current_route
    if combined.startswith("../") or combined == "..":
        return None
    parts = [part for part in PurePosixPath(combined).parts if part not in {"", "."}]
    if parts and parts[-1] == "index":
        parts = parts[:-1]
    return "/".join(parts)


def resolve_page_href(current_route: str, target: str, base_url: str, url_style: str) -> str | None:
    page_part, fragment = split_target(target)
    if page_part == "":
        suffix = fragment_id(fragment)
        return f"#{suffix}" if suffix else "#"
    route = resolve_page_route(current_route, target)
    if route is None:
        return None
    suffix = fragment_id(fragment)
    return f"{page_url(base_url, route, url_style)}#{suffix}" if suffix else page_url(base_url, route, url_style)


def markdown_link_is_page(target: str) -> bool:
    page_part, _ = split_target(target)
    if not page_part:
        return True
    suffix = PurePosixPath(page_part).suffix.lower()
    return suffix in PAGE_LINK_EXTENSIONS


def markdown_link_target(route: str) -> str:
    """Return the vault-relative markdown path for a page route."""
    return f"{route}.md"


def format_internal_link(target_route: str, display: str, style: str = "markdown") -> str:
    """Format an internal vault link for insertion or CLI suggestions."""
    if style == "markdown":
        return f"[{display}]({markdown_link_target(target_route)})"
    return f"[[{target_route}|{display}]]"
