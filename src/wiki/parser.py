"""YAML and JSON frontmatter parsing, normalization, and document loading logic."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import yaml

DOCUMENT_EXTENSIONS = {".md", ".yaml", ".yml", ".json"}
DATA_DOCUMENT_EXTENSIONS = {".yaml", ".yml", ".json"}


def parse_frontmatter(content: str) -> dict[str, Any] | None:
    """Parse YAML or JSON frontmatter block from a markdown content string."""
    if not content.startswith("---"):
        return None

    parts = content.split("---", 2)
    if len(parts) < 2:
        return None

    frontmatter_text = parts[1].strip()

    if frontmatter_text.startswith("{"):
        try:
            data = json.loads(frontmatter_text)
            return data if isinstance(data, dict) else None
        except json.JSONDecodeError:
            return None

    try:
        data = yaml.safe_load(frontmatter_text)
        return data if isinstance(data, dict) else None
    except yaml.YAMLError:
        return None


def ensure_context(data: dict[str, Any]) -> dict[str, Any]:
    """Ensure JSON-LD @context is present with default required namespaces."""
    if "@context" not in data:
        data["@context"] = {
            "wiki": "https://wiki.example.org/",
            "foaf": "http://xmlns.com/foaf/0.1/",
        }
    elif isinstance(data["@context"], dict):
        for k, v in {
            "wiki": "https://wiki.example.org/",
            "foaf": "http://xmlns.com/foaf/0.1/",
        }.items():
            if k not in data["@context"]:
                data["@context"][k] = v
    return data


def document_data_from_path(path: Path, content_predicate: str | None = None) -> dict[str, Any] | None:
    """Read a supported wiki document file and return its parsed data dict with context."""
    try:
        suffix = path.suffix.lower()
        if suffix == ".md":
            return frontmatter_from_path(path, content_predicate=content_predicate)

        content = path.read_text(encoding="utf-8")
        if suffix == ".json":
            data = json.loads(content)
        elif suffix in DATA_DOCUMENT_EXTENSIONS:
            data = yaml.safe_load(content)
        else:
            return None

        if not isinstance(data, dict):
            return None
        return ensure_context(data)
    except Exception:
        return None


def frontmatter_from_path(path: Path, content_predicate: str | None = None) -> dict[str, Any] | None:
    """Read a markdown file and return its parsed frontmatter dict with context.
    
    Optionally appends the text content of the body using the provided predicate key.
    """
    try:
        content = path.read_text(encoding="utf-8")
        data = parse_frontmatter(content)
        if data is None:
            return None
        data = ensure_context(data)
        
        if content_predicate:
            parts = content.split("---", 2)
            if len(parts) > 2:
                body = parts[2].strip()
                if body:
                    data[content_predicate] = body
                    
        return data
    except Exception:
        return None


def split_frontmatter_body(content: str) -> tuple[dict[str, Any] | None, str]:
    """Split markdown content into (frontmatter_dict, body_text).

    Returns (None, content) if no valid frontmatter is found.
    The body is the markdown text after the closing --- (or the full content if no frontmatter).
    """
    from .document import split_frontmatter_text

    split = split_frontmatter_text(content)
    if split.data is None:
        return None, content
    return split.data, split.body.strip()


def split_document_body(path: Path) -> tuple[dict[str, Any] | None, str]:
    """Split a supported wiki document into (data, body_text)."""
    suffix = path.suffix.lower()
    if suffix == ".md":
        try:
            return split_frontmatter_body(path.read_text(encoding="utf-8"))
        except Exception:
            return None, ""

    data = document_data_from_path(path)
    return data, ""
