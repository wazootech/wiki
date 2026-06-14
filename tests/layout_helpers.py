"""Shared helpers for Jinja page layout tests."""

from __future__ import annotations

from pathlib import Path


def write_layout(root: Path, rel_path: str, content: str) -> Path:
    """Write a layout file under the wiki config root and return its path."""
    path = root / rel_path
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return path
