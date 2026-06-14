"""Jinja2 rendering for wiki page layout templates."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from jinja2 import (
    ChoiceLoader,
    Environment,
    FileSystemLoader,
    PackageLoader,
    select_autoescape,
)

MINIMAL_LAYOUT_TEMPLATE = "layout_minimal.html.j2"
LAYOUT_SUFFIX = ".html.j2"


def layout_stem(path: Path) -> str:
    """Derive a CSS-safe layout slug from a layout file path."""
    name = path.name
    if name.lower().endswith(LAYOUT_SUFFIX):
        return name[: -len(LAYOUT_SUFFIX)]
    return path.stem


def layout_file_is_valid(path: Path, config_root: Path) -> bool:
    """True when path is a readable .html.j2 file under config_root."""
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
    """Render page layouts from the wiki config root or packaged fallbacks."""

    def __init__(self, config_root: Path) -> None:
        self.config_root = config_root.resolve()
        self._env = Environment(
            loader=ChoiceLoader(
                [
                    FileSystemLoader(str(self.config_root)),
                    PackageLoader("wiki", "templates"),
                ]
            ),
            autoescape=select_autoescape(["html", "html.j2"]),
            keep_trailing_newline=True,
        )

    def render(self, template_path: Path | None, context: dict) -> str:
        if template_path is not None:
            name = template_path.resolve().relative_to(self.config_root).as_posix()
            return self._env.get_template(name).render(**context)
        return self._env.get_template(MINIMAL_LAYOUT_TEMPLATE).render(**context)


@lru_cache(maxsize=32)
def get_layout_renderer(config_root: Path) -> LayoutRenderer:
    return LayoutRenderer(config_root)
