"""Layout token substitution for wiki page layout files."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from .layout_tokens import render_layout, render_packaged_minimal

LAYOUT_SUFFIX = ".html"


def layout_stem(path: Path) -> str:
    """Derive a CSS-safe layout slug from a layout file path."""
    name = path.name
    name_lower = name.lower()
    if name_lower.endswith(LAYOUT_SUFFIX):
        return name[: -len(LAYOUT_SUFFIX)]
    return path.stem


def layout_file_is_valid(path: Path, config_root: Path) -> bool:
    """True when path is a readable .html page layout under config_root."""
    if not layout_path_within_root(path, config_root):
        return False
    return path.is_file() and path.name.lower().endswith(LAYOUT_SUFFIX)


def layout_path_within_root(path: Path, config_root: Path) -> bool:
    """True when path resolves inside config_root."""
    try:
        path.resolve().relative_to(config_root.resolve())
    except ValueError:
        return False
    return True


class LayoutRenderer:
    """Render page layouts from layout files under config_root or packaged fallbacks."""

    def __init__(self, config_root: Path) -> None:
        self.config_root = config_root.resolve()

    def render(self, template_path: Path | None, context: dict) -> str:
        if template_path is None:
            return render_packaged_minimal(context)
        template_text = template_path.read_text(encoding="utf-8")
        return render_layout(template_text, context)


@lru_cache(maxsize=32)
def get_layout_renderer(config_root: Path) -> LayoutRenderer:
    return LayoutRenderer(config_root)
