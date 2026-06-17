"""Nested layout template context for wiki page shells."""

from __future__ import annotations

import html as html_module
from typing import Any

from markupsafe import Markup

from ..schemas.layout import LAYOUT_MARKUP_PATHS, LayoutContext
from ..schemas.site import VirtualPage, WikiSite

_DEFAULT_LOGO_THEME = ("#3b82f6", "#1d4ed8", "#93c5fd")

# Backward-compatible alias for tests and internal callers.
LAYOUT_CONTEXT_MARKUP_PATHS = LAYOUT_MARKUP_PATHS


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


def build_logo_svg(letter: str, theme_color: str | None = None) -> str:
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


def _site_context(*, base_url: str) -> dict[str, Any]:
    return {
        "base_url": base_url,
    }


def _apply_markup(context: dict[str, Any]) -> dict[str, Any]:
    for path in LAYOUT_MARKUP_PATHS:
        node: Any = context
        for key in path[:-1]:
            node = node[key]
        leaf = path[-1]
        value = node[leaf]
        if value is not None and value != "":
            node[leaf] = Markup(value)
    return context


def build_layout_context(
    *,
    site: WikiSite,
    base_url: str,
    page: VirtualPage | None = None,
    content: str,
) -> dict[str, Any]:
    """Build nested layout template context for index or article pages."""
    _ = site
    title = page.title if page is not None else "All Pages"

    raw: dict[str, Any] = {
        "site": _site_context(base_url=base_url),
        "page": {
            "title": title,
        },
        "body": content,
    }
    LayoutContext.model_validate(raw)
    return _apply_markup(raw)
