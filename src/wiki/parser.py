"""YAML and JSON frontmatter parsing, normalization, and document loading logic."""

from __future__ import annotations

import json
import logging
import re
import tomllib
from pathlib import Path
from typing import Any

import yaml
from linked_markdown import LMD_NO_FRONTMATTER, LinkedMarkdownError, extract

logger = logging.getLogger(__name__)

DOCUMENT_EXTENSIONS = {".md", ".yaml", ".yml", ".json", ".toml"}
DATA_DOCUMENT_EXTENSIONS = {".yaml", ".yml", ".json", ".toml"}

BOM = "\ufeff"

# Closing delimiters linked_markdown accepts for a frontmatter block.
_FRONTMATTER_CLOSER_RE = re.compile(r"^(?:---|\+\+\+|= (?:yaml|json|toml) =)[ \t]*$")


def read_text_tolerant(path: Path) -> str:
    """Read a document as UTF-8, tolerating (and stripping) a leading BOM.

    Windows editors — Notepad, PowerShell redirection, VS Code's "UTF-8 with
    BOM" — save text with a UTF-8 BOM. Read as plain UTF-8 it survives as a
    body character, which breaks structured parsers downstream (JSON) and
    makes mdformat mistake frontmatter for prose (wiki#312).
    """
    return path.read_text(encoding="utf-8-sig")


def frontmatter_error(content: str) -> str | None:
    """Return why a document's frontmatter cannot be parsed, else ``None``.

    A document without a frontmatter block is not an error: this reports only
    blocks that were opened but could not be read. Callers use it as a guard
    before rewriting a file, because mdformat has no idea a broken block is
    frontmatter and would flatten it into prose (wiki#312).
    """
    text = content.lstrip(BOM)
    try:
        extract(text)
    except LinkedMarkdownError as exc:
        if exc.code == LMD_NO_FRONTMATTER:
            return None
        # An opener with no closer is not a frontmatter block to the renderer:
        # mdformat keeps a lone `---` as a thematic break, so there is nothing
        # to lose. Refuse only blocks mdformat could misread as frontmatter.
        if not any(_FRONTMATTER_CLOSER_RE.match(line) for line in text.splitlines()[1:]):
            return None
        if exc.cause is not None:
            return f"{exc.code}: {exc.cause}"
        return str(exc)
    except Exception as exc:  # pragma: no cover - defensive, unknown parse failures
        return str(exc)
    return None


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

        content = read_text_tolerant(path)
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
        content = read_text_tolerant(path)
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
            return split_frontmatter_body(read_text_tolerant(path))
        except Exception as exc:
            logger.debug("split_document_body(%s): %s", path, exc)
            return None, ""

    data = document_data_from_path(path)
    return data, ""
