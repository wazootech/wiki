"""YAML and JSON frontmatter parsing, normalization, and JSON-LD conversion logic."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional
import yaml


def to_camel_case(s: str) -> str:
    """Convert snake_case or kebab-case string to camelCase, preserving JSON-LD special keys."""
    if s.startswith("@"):
        return s
    parts = s.replace("-", "_").split("_")
    return parts[0] + "".join(word.capitalize() for word in parts[1:])


def normalize_keys(data: Any) -> Any:
    """Recursively convert dictionary keys to camelCase."""
    if isinstance(data, dict):
        return {to_camel_case(k): normalize_keys(v) for k, v in data.items()}
    if isinstance(data, list):
        return [normalize_keys(item) for item in data]
    return data


def parse_frontmatter(content: str) -> Optional[dict[str, Any]]:
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
            "@vocab": "https://schema.org/",
            "wiki": "https://wiki.example.org/",
            "foaf": "http://xmlns.com/foaf/0.1/",
        }
    elif isinstance(data["@context"], dict):
        for k, v in {
            "@vocab": "https://schema.org/",
            "wiki": "https://wiki.example.org/",
            "foaf": "http://xmlns.com/foaf/0.1/",
        }.items():
            if k not in data["@context"]:
                data["@context"][k] = v
    return data


def frontmatter_from_path(path: Path, content_predicate: Optional[str] = None) -> Optional[dict[str, Any]]:
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


def split_frontmatter_body(content: str) -> tuple[Optional[dict[str, Any]], str]:
    """Split markdown content into (frontmatter_dict, body_text).

    Returns (None, content) if no valid frontmatter is found.
    The body is the markdown text after the closing --- (or the full content if no frontmatter).
    """
    data = parse_frontmatter(content)
    if data is None:
        return None, content

    parts = content.split("---", 2)
    body = parts[2].strip() if len(parts) > 2 else ""
    return data, body


def normalize_frontmatter_str(content: str, standardize_keys: bool = True) -> str:
    """Normalize frontmatter string in a markdown file.

    Adds/updates @context and optionally standardizes key casing to camelCase.
    """
    if not content.startswith("---"):
        return content

    parts = content.split("---", 2)
    if len(parts) < 2:
        return content

    frontmatter_text = parts[1].strip()
    is_json = frontmatter_text.startswith("{")

    try:
        data = json.loads(frontmatter_text) if is_json else yaml.safe_load(frontmatter_text)
    except Exception:
        return content

    if not isinstance(data, dict):
        return content

    original = dict(data)
    data = ensure_context(data)

    if standardize_keys:
        data = normalize_keys(data)

    if data == original:
        return content

    if is_json:
        new_fm = json.dumps(data, indent=2)
    else:
        new_fm = yaml.dump(data, default_flow_style=False, sort_keys=False)

    return f"---\n{new_fm.strip()}\n---" + (parts[2] if len(parts) > 2 else "")


def normalize_all(input_dirs: Path | list[Path], standardize_keys: bool = True, dry_run: bool = False) -> dict[str, Any]:
    """Normalize frontmatter across all markdown files in input_dirs."""
    dirs = [input_dirs] if isinstance(input_dirs, Path) else input_dirs
    results = {"fixed": 0, "skipped": 0, "errors": []}

    for input_dir in dirs:
        if not input_dir.exists():
            continue
        for md_file in sorted(input_dir.glob("*.md")):
            try:
                original = md_file.read_text(encoding="utf-8")
                normalized = normalize_frontmatter_str(original, standardize_keys=standardize_keys)
                if normalized != original:
                    results["fixed"] += 1
                    if not dry_run:
                        md_file.write_text(normalized, encoding="utf-8")
                else:
                    results["skipped"] += 1
            except Exception as e:
                results["errors"].append({"file": md_file.name, "error": str(e)})

    return results
