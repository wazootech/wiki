"""Web App Manifest building for wiki sites."""

from __future__ import annotations

import json
from typing import Any

from ..config import Config
from ..schemas.wiki_config import DEFAULT_SITE_TITLE

_DEFAULT_LOGO_THEME = ("#3b82f6", "#1d4ed8", "#93c5fd")
DEFAULT_THEME_COLOR = _DEFAULT_LOGO_THEME[0]
def resolved_manifest_name(name: str | None) -> str:
    return (name or DEFAULT_SITE_TITLE).strip() or DEFAULT_SITE_TITLE


def resolved_site_theme_color(theme_color: str | None) -> str:
    return theme_color or DEFAULT_THEME_COLOR


def manifest_url(base_url: str) -> str:
    return f"{base_url}/manifest.webmanifest" if base_url else "/manifest.webmanifest"


def manifest_start_url(config: Config) -> str:
    manifest = config.site.manifest
    if manifest.start_url:
        return manifest.start_url
    base_url = config.site.base_url or ""
    return f"{base_url}/" if base_url else "/"


def manifest_icon_src(src: str, base_url: str) -> str:
    if "://" in src:
        return src
    normalized = src.lstrip("/")
    return f"{base_url}/{normalized}" if base_url else f"/{normalized}"


def layout_manifest_icons(config: Config) -> list[dict[str, Any]]:
    manifest = config.site.manifest
    base_url = config.site.base_url or ""
    icons: list[dict[str, Any]] = []
    for icon in manifest.icons or []:
        entry: dict[str, Any] = icon.model_dump(exclude_none=True)
        entry["url"] = manifest_icon_src(icon.src, base_url)
        icons.append(entry)
    return icons


def build_web_manifest(config: Config) -> dict[str, Any]:
    """Canonical Web App Manifest object for embed and file output."""
    manifest = config.site.manifest
    base_url = config.site.base_url or ""
    doc: dict[str, Any] = {"name": manifest.name}

    if manifest.short_name:
        doc["short_name"] = manifest.short_name
    if manifest.description:
        doc["description"] = manifest.description
    if manifest.theme_color:
        doc["theme_color"] = manifest.theme_color
    if manifest.background_color:
        doc["background_color"] = manifest.background_color
    if manifest.display:
        doc["display"] = manifest.display

    doc["start_url"] = manifest_start_url(config)

    if manifest.icons:
        icons: list[dict[str, str]] = []
        for icon in manifest.icons:
            entry: dict[str, str] = {"src": manifest_icon_src(icon.src, base_url)}
            if icon.sizes:
                entry["sizes"] = icon.sizes
            if icon.type:
                entry["type"] = icon.type
            if icon.purpose:
                entry["purpose"] = icon.purpose
            icons.append(entry)
        doc["icons"] = icons

    return doc


def serialize_web_manifest(config: Config) -> str:
    return json.dumps(build_web_manifest(config), separators=(",", ":"), ensure_ascii=False)
