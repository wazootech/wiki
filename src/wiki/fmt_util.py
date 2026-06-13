"""Markdown formatting helpers for wiki fmt (mdformat config + SPARQL shields)."""

from __future__ import annotations

import re
import tomllib
from pathlib import Path
from typing import Any

import mdformat
from mdformat._conf import DEFAULT_OPTS, InvalidConfError, read_toml_opts, _validate_keys, _validate_values
import mdformat.plugins

from .config import Config

DEFAULT_FMT_EXTENSIONS = ("wikilink", "frontmatter", "gfm")

DEFAULT_FMT_OPTS: dict[str, Any] = {
    "wrap": "no",
    "end_of_line": "lf",
    "extensions": ["gfm", "frontmatter", "wikilink"],
}

SPARQL_REGION_RE = re.compile(
    r"<!--\s*sparql:start\b.*?<!--\s*sparql:end\s*-->",
    re.DOTALL | re.IGNORECASE,
)
_SPARQL_PLACEHOLDER = "WIKI_FMT_SPARQL_BLOCK_{index}"


def _shield_sparql_blocks(text: str) -> tuple[str, list[str]]:
    blocks: list[str] = []

    def repl(match: re.Match[str]) -> str:
        blocks.append(match.group(0))
        return f"\n\n<!-- {_SPARQL_PLACEHOLDER.format(index=len(blocks) - 1)} -->\n\n"

    return SPARQL_REGION_RE.sub(repl, text), blocks


def _restore_sparql_blocks(text: str, blocks: list[str]) -> str:
    for index, block in enumerate(blocks):
        placeholder = f"<!-- {_SPARQL_PLACEHOLDER.format(index=index)} -->"
        text = text.replace(placeholder, block, 1)
    return text


def _load_toml_opts(path: Path) -> dict[str, Any]:
    with path.open("rb") as handle:
        try:
            toml_opts = tomllib.load(handle)
        except tomllib.TOMLDecodeError as exc:
            raise ValueError(f"Invalid TOML syntax in {path}: {exc}") from exc
    try:
        _validate_keys(toml_opts, path)
        _validate_values(toml_opts, path)
    except InvalidConfError as exc:
        raise ValueError(str(exc)) from exc
    return dict(toml_opts)


def _resolve_fmt_toml_opts(file_path: Path, config: Config) -> tuple[dict[str, Any], str]:
    if config.fmt is not None and config.fmt.options is not None:
        if not config.fmt.options:
            return dict(DEFAULT_FMT_OPTS), "inline fmt in wiki config"
        return config.fmt.options, "inline fmt in wiki config"

    root = config.config_root
    if config.fmt is not None and config.fmt.toml is not None:
        pointed = config.fmt.toml
        if pointed.is_file():
            return _load_toml_opts(pointed), f"fmt from {pointed.relative_to(root).as_posix()}"

    default_path = root / ".mdformat.toml"
    if default_path.is_file():
        return _load_toml_opts(default_path), ".mdformat.toml at config root"

    toml_opts, conf_path = read_toml_opts(file_path.parent)
    if conf_path is not None:
        return dict(toml_opts), str(conf_path)

    return dict(DEFAULT_FMT_OPTS), "Wiki CLI fmt defaults"


def describe_fmt_source(file_path: Path, config: Config) -> str:
    """Human-readable description of which fmt config source would be used."""
    _, source = _resolve_fmt_toml_opts(file_path, config)
    return source


def _mdformat_options(
    file_path: Path, config: Config
) -> tuple[dict[str, Any], tuple[str, ...]]:
    toml_opts, _ = _resolve_fmt_toml_opts(file_path, config)
    opts: dict[str, Any] = {**DEFAULT_OPTS, **toml_opts}
    if opts.get("extensions") is None:
        return opts, DEFAULT_FMT_EXTENSIONS
    return opts, tuple(opts["extensions"])


def format_markdown(original: str, file_path: Path, config: Config) -> str:
    """Format markdown, honoring wiki fmt config and preserving SPARQL render blocks."""
    shielded, blocks = _shield_sparql_blocks(original)
    opts, extensions = _mdformat_options(file_path, config)
    try:
        enabled_parserplugins = {
            name: mdformat.plugins.PARSER_EXTENSIONS[name] for name in extensions
        }
    except KeyError as exc:
        raise ValueError(
            f"The required {exc.args[0]!r} mdformat extension is not installed."
        ) from exc
    formatted = mdformat.text(
        shielded,
        options=opts,
        extensions=enabled_parserplugins,
        _filename=str(file_path),
    )
    return _restore_sparql_blocks(formatted, blocks)
