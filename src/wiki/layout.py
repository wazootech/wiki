"""Per-page HTML layout frontmatter helpers."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from .site.layout_template import layout_file_is_valid, layout_path_within_root, layout_stem

LAYOUT_FRONTMATTER_KEY = "wazoo:layout"


def resolve_layout_path(raw: str, config_root: Path) -> Path:
    """Resolve a wazoo:layout path relative to the wiki config root."""
    text = raw.strip().replace("\\", "/")
    path = Path(text)
    if not path.is_absolute():
        path = config_root / path
    return path.resolve()


def parse_layout_from_frontmatter(
    frontmatter: dict[str, Any],
    config_root: Path,
) -> tuple[Path | None, str]:
    """Return resolved layout path (if set) and a CSS-safe layout stem."""
    raw = frontmatter.get(LAYOUT_FRONTMATTER_KEY)
    if not isinstance(raw, str) or not raw.strip():
        return None, "default"
    path = resolve_layout_path(raw, config_root)
    return path, layout_stem(path)
