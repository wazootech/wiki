"""Static asset discovery, validation, and manifest helpers."""

from __future__ import annotations

import posixpath
from pathlib import Path, PurePosixPath
from urllib.parse import quote, unquote, urlsplit

from .config import WikiConfig
from .links import is_external_link, split_target
from .paths import OutputEntry


def iter_asset_files(config: WikiConfig) -> list[Path]:
    assets: list[Path] = []
    for asset_dir in config.asset_dirs:
        if not asset_dir.exists() or asset_dir.is_symlink():
            continue
        for path in sorted(asset_dir.rglob("*")):
            if config.is_excluded(path) or path.is_dir() or path.is_symlink():
                continue
            assets.append(path)
    return assets


def audit_asset_dirs(config: WikiConfig) -> list[str]:
    warnings: list[str] = []
    for asset_dir in config.asset_dirs:
        if config.is_excluded(asset_dir):
            continue
        if not asset_dir.exists():
            warnings.append(f"Asset directory does not exist: {asset_dir}")
        elif asset_dir.is_symlink():
            warnings.append(f"Asset directory is a symlink and will not be copied: {asset_dir}")
        elif not asset_dir.is_dir():
            warnings.append(f"Asset directory is not a directory: {asset_dir}")
        for path in sorted(asset_dir.rglob("*")) if asset_dir.exists() and asset_dir.is_dir() and not asset_dir.is_symlink() else []:
            if path.is_symlink() and not config.is_excluded(path):
                warnings.append(f"Asset symlink will not be copied: {path}")
    return warnings


def build_asset_manifest(config: WikiConfig, owned_output_dir: Path, base_url: str) -> list[OutputEntry]:
    entries: list[OutputEntry] = []
    base = base_url.rstrip("/") if base_url else ""
    for asset in iter_asset_files(config):
        rel = config.relative_to_root(asset)
        rel_parts = [part for part in PurePosixPath(rel).parts if part]
        output_path = owned_output_dir.joinpath(*rel_parts)
        encoded = quote(rel, safe="/()_-.$~")
        public_url = f"{base}/{encoded}" if base else f"/{encoded}"
        entries.append(OutputEntry(source=asset, output_path=output_path, public_url=public_url, kind="asset"))
    return entries


def resolve_asset_path(config: WikiConfig, current_file: Path, target: str) -> Path | None:
    if is_external_link(target):
        return None
    page_part, _ = split_target(target)
    page_part = unquote(page_part.split("?")[0]).replace("\\", "/").strip()
    if not page_part or page_part.startswith("/"):
        return None
    try:
        current_rel = current_file.resolve().relative_to(config.config_root.resolve()).as_posix()
    except ValueError:
        current_rel = current_file.as_posix()
    current_dir = posixpath.dirname(current_rel)
    combined = posixpath.normpath(posixpath.join(current_dir, page_part))
    if combined.startswith("../") or combined == "..":
        return None
    candidate = (config.config_root / Path(combined)).resolve()
    for asset_dir in config.asset_dirs:
        try:
            candidate.relative_to(asset_dir.resolve())
            return candidate
        except ValueError:
            continue
    return None


def asset_reference_issue(config: WikiConfig, current_file: Path, target: str) -> str | None:
    asset_path = resolve_asset_path(config, current_file, target)
    if asset_path is None:
        return f"points outside configured asset_dirs: {target}"
    if config.is_excluded(asset_path):
        return f"points to excluded asset: {target}"
    if asset_path.is_symlink():
        return f"points to symlink asset, which will not be copied: {target}"
    if not asset_path.exists() or not asset_path.is_file():
        return f"points to missing asset: {target}"
    return None
