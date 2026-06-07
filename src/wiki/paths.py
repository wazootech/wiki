"""Path, route, URL, and output-manifest helpers for wiki pages."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote

from .config import WikiConfig
from .parser import DOCUMENT_EXTENSIONS


UNSAFE_ROUTE_CHARS = set("?#%")


@dataclass(frozen=True)
class PageRoute:
    source: Path
    route: str


@dataclass(frozen=True)
class OutputEntry:
    source: Path | None
    output_path: Path
    public_url: str
    kind: str


def iter_document_files(config: WikiConfig) -> list[Path]:
    doc_files: list[Path] = []
    for input_dir in config.input_dirs:
        if input_dir.exists():
            for file_path in sorted(input_dir.rglob("*")):
                if not file_path.is_file() or file_path.suffix.lower() not in DOCUMENT_EXTENSIONS:
                    continue
                if not config.is_excluded(file_path):
                    doc_files.append(file_path)
    return doc_files


def iter_markdown_files(config: WikiConfig) -> list[Path]:
    return [file_path for file_path in iter_document_files(config) if file_path.suffix.lower() == ".md"]


def route_for_document_file(config: WikiConfig, file_path: Path) -> str:
    rel = _relative_to_input_dir(config, file_path).with_suffix("").as_posix()
    parts = [part for part in rel.split("/") if part]
    if parts and parts[-1] == "index":
        parts = parts[:-1]
    _validate_route_parts(parts, file_path)
    return "/".join(parts)


def page_routes(config: WikiConfig) -> list[PageRoute]:
    return [PageRoute(source=file_path, route=route_for_document_file(config, file_path)) for file_path in iter_document_files(config)]


def page_url(base_url: str, route: str, url_style: str) -> str:
    base = base_url.rstrip("/") if base_url else ""
    encoded = quote(route, safe="/()_-.$~")
    if url_style == "file":
        if encoded:
            return f"{base}/{encoded}.html" if base else f"/{encoded}.html"
        return f"{base}/index.html" if base else "/index.html"
    if encoded:
        return f"{base}/{encoded}/" if base else f"/{encoded}/"
    return f"{base}/" if base else "/"


def page_output_path(owned_output_dir: Path, route: str, url_style: str) -> Path:
    if url_style == "file":
        if not route:
            return owned_output_dir / "index.html"
        parts = route.split("/")
        return owned_output_dir.joinpath(*parts[:-1], f"{parts[-1]}.html")
    if not route:
        return owned_output_dir / "index.html"
    return owned_output_dir.joinpath(*route.split("/"), "index.html")


def build_page_manifest(config: WikiConfig, owned_output_dir: Path, base_url: str, url_style: str) -> list[OutputEntry]:
    return [
        OutputEntry(
            source=route.source,
            output_path=page_output_path(owned_output_dir, route.route, url_style),
            public_url=page_url(base_url, route.route, url_style),
            kind="page",
        )
        for route in page_routes(config)
    ]


def detect_output_collisions(entries: list[OutputEntry]) -> list[str]:
    issues: list[str] = []
    seen_paths: dict[str, OutputEntry] = {}
    seen_urls: dict[str, OutputEntry] = {}
    for entry in entries:
        path_key = str(entry.output_path).lower()
        url_key = entry.public_url.lower()
        previous_path = seen_paths.get(path_key)
        if previous_path is not None:
            issues.append(_collision_message("output path", previous_path, entry))
        else:
            seen_paths[path_key] = entry
        previous_url = seen_urls.get(url_key)
        if previous_url is not None:
            issues.append(_collision_message("public URL", previous_url, entry))
        else:
            seen_urls[url_key] = entry
    return issues


def validate_filename_pattern(config: WikiConfig, md_file: Path) -> str | None:
    if not config.filename_pattern:
        return None
    if md_file.suffix.lower() != ".md":
        return None
    try:
        pattern = re.compile(config.filename_pattern)
    except re.error as exc:
        return f"Invalid filename_pattern: {exc}"
    if pattern.fullmatch(md_file.name) is None:
        return f"Filename '{md_file.name}' does not match filename_pattern."
    return None


def validate_route_safety(config: WikiConfig) -> list[str]:
    issues: list[str] = []
    for file_path in iter_document_files(config):
        try:
            route_for_document_file(config, file_path)
        except ValueError as exc:
            issues.append(str(exc))
    return issues


def _relative_to_input_dir(config: WikiConfig, md_file: Path) -> Path:
    for root in config.input_dirs:
        try:
            return md_file.relative_to(root)
        except ValueError:
            continue
    return md_file


def _validate_route_parts(parts: list[str], source: Path) -> None:
    for part in parts:
        if part in {"", ".", ".."}:
            raise ValueError(f"Unsafe route for {source}: path segments cannot be empty, '.', or '..'.")
        if any(ch.isspace() for ch in part):
            raise ValueError(f"Unsafe route for {source}: spaces are not allowed in page paths.")
        if any(ord(ch) < 32 for ch in part):
            raise ValueError(f"Unsafe route for {source}: control characters are not allowed in page paths.")
        found = sorted(ch for ch in UNSAFE_ROUTE_CHARS if ch in part)
        if found:
            chars = "".join(found)
            raise ValueError(f"Unsafe route for {source}: characters '{chars}' are not allowed in page paths.")


def _collision_message(kind: str, first: OutputEntry, second: OutputEntry) -> str:
    return (
        f"Output collision on {kind} '{first.public_url}': "
        f"{_source_label(first)} conflicts with {_source_label(second)}."
    )


def _source_label(entry: OutputEntry) -> str:
    if entry.source is None:
        return entry.kind
    return f"{entry.kind} {entry.source}"
