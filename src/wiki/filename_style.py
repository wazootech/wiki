"""Filename style helpers shared by audits and HTML site rendering."""

from __future__ import annotations

import re

KEBAB_STYLE = "kebab"
WIKIPEDIA_STYLE = "wikipedia"
DEFAULT_FILENAME_STYLE = KEBAB_STYLE
VALID_FILENAME_STYLES = {KEBAB_STYLE, WIKIPEDIA_STYLE}

KEBAB_FILENAME_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
WIKIPEDIA_FILENAME_RE = re.compile(r"^[A-Z][A-Za-z0-9]*(?:_[A-Z][A-Za-z0-9]*)*$")


def normalize_filename_style(style: str | None) -> str:
    if not style:
        return DEFAULT_FILENAME_STYLE
    normalized = str(style).strip().lower()
    if normalized in VALID_FILENAME_STYLES:
        return normalized
    return DEFAULT_FILENAME_STYLE


def style_description(style: str) -> str:
    if style == WIKIPEDIA_STYLE:
        return "Wikipedia-style title case with underscores"
    return "lowercase kebab-case"


def slugify_kebab_segment(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9\s-]", "", text)
    text = re.sub(r"[\s-]+", "-", text)
    return text.strip("-")


def normalize_path(text: str, style: str = DEFAULT_FILENAME_STYLE) -> str:
    raw = text.strip().replace("\\", "/").strip("/")
    if not raw:
        return ""
    parts = [p for p in raw.split("/") if p.strip()]
    if normalize_filename_style(style) == WIKIPEDIA_STYLE:
        return "/".join(p.strip() for p in parts)
    return "/".join(slugify_kebab_segment(p) for p in parts)


def normalize_segment(text: str, style: str = DEFAULT_FILENAME_STYLE) -> str:
    if normalize_filename_style(style) == WIKIPEDIA_STYLE:
        return text.strip()
    return slugify_kebab_segment(text)


def filename_stem_is_valid(stem: str, style: str = DEFAULT_FILENAME_STYLE) -> bool:
    if normalize_filename_style(style) == WIKIPEDIA_STYLE:
        return bool(WIKIPEDIA_FILENAME_RE.match(stem))
    return bool(KEBAB_FILENAME_RE.match(stem))
