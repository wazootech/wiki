"""YAML and JSON frontmatter parsing, normalization, and document loading logic."""

from __future__ import annotations

import json
import logging
import tomllib
from pathlib import Path
from typing import Any

import yaml
from linked_markdown import LMD_NO_FRONTMATTER, LinkedMarkdownError, extract

logger = logging.getLogger(__name__)

DOCUMENT_EXTENSIONS = {".md", ".yaml", ".yml", ".json", ".toml"}
DATA_DOCUMENT_EXTENSIONS = {".yaml", ".yml", ".json", ".toml"}


def parse_frontmatter(content: str) -> dict[str, Any] | None:
    try:
        return extract(content).attrs
    except LinkedMarkdownError:
        return None


def ensure_context(data: dict[str, Any]) -> dict[str, Any]:
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
    try:
        suffix = path.suffix.lower()
        if suffix == ".md":
            return frontmatter_from_path(path, content_predicate=content_predicate)

        content = path.read_text(encoding="utf-8")
        if suffix == ".json":
            data = json.loads(content)
        elif suffix == ".toml":
            data = tomllib.loads(content)
        elif suffix in DATA_DOCUMENT_EXTENSIONS:
            data = yaml.safe_load(content)
        else:
            return None

        if not isinstance(data, dict):
            return None
        return ensure_context(data)
    except Exception as exc:
        logger.debug("document_data_from_path(%s): %s", path, exc)
        return None


def frontmatter_from_path(path: Path, content_predicate: str | None = None) -> dict[str, Any] | None:
    try:
        content = path.read_text(encoding="utf-8")
        result = extract(content)
        data = ensure_context(result.attrs)

        if content_predicate:
            body = result.body.strip()
            if body:
                data[content_predicate] = body

        return data
    except LinkedMarkdownError:
        return None
    except Exception as exc:
        logger.debug("frontmatter_from_path(%s): %s", path, exc)
        return None


def split_frontmatter_body(content: str) -> tuple[dict[str, Any] | None, str]:
    try:
        result = extract(content)
        return result.attrs, result.body.strip()
    except LinkedMarkdownError as e:
        if e.code == LMD_NO_FRONTMATTER:
            return None, content
        return None, content


def split_document_body(path: Path) -> tuple[dict[str, Any] | None, str]:
    suffix = path.suffix.lower()
    if suffix == ".md":
        try:
            return split_frontmatter_body(path.read_text(encoding="utf-8"))
        except Exception as exc:
            logger.debug("split_document_body(%s): %s", path, exc)
            return None, ""

    data = document_data_from_path(path)
    return data, ""
