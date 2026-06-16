"""Static asset discovery, validation, and manifest helpers."""

from __future__ import annotations

import posixpath
from pathlib import Path, PurePosixPath
from urllib.parse import quote, unquote

from .config import Config
from .links import is_external_link, split_target
from .paths import OutputEntry


def iter_asset_files(config: Config) -> list[Path]:
    assets: list[Path] = []
    for asset_dir in config.wiki.assets:
        if not asset_dir.exists() or asset_dir.is_symlink():
            continue
        for path in sorted(asset_dir.rglob("*")):
            if config.is_excluded(path) or path.is_dir() or path.is_symlink():
                continue
            assets.append(path)
    return assets


def audit_assets(config: Config) -> list[str]:
    warnings: list[str] = []
    for asset_dir in config.wiki.assets:
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


_PACKAGED_ASSET_FILENAMES = frozenset()


def write_packaged_asset(filename: str, dest: Path) -> None:
    """Write a bundled asset from the wiki package to dest."""
    raise ValueError(f"Unknown packaged asset: {filename!r}")


def build_asset_manifest(config: Config, owned_output_dir: Path, base_url: str) -> list[OutputEntry]:
    entries: list[OutputEntry] = []
    base = base_url.rstrip("/") if base_url else ""
    seen_outputs: set[Path] = set()
    for asset in iter_asset_files(config):
        rel = config.relative_to_root(asset)
        rel_parts = [part for part in PurePosixPath(rel).parts if part]
        output_path = owned_output_dir.joinpath(*rel_parts)
        seen_outputs.add(output_path.resolve())
        encoded = quote(rel, safe="/()_-.$~")
        public_url = f"{base}/{encoded}" if base else f"/{encoded}"
        entries.append(OutputEntry(source=asset, output_path=output_path, public_url=public_url, kind="asset"))
    entries.extend(_packaged_asset_entries(config, owned_output_dir, base, seen_outputs))
    return entries


def _packaged_asset_entries(
    config: Config,
    owned_output_dir: Path,
    base: str,
    seen_outputs: set[Path],
) -> list[OutputEntry]:
    from importlib.resources import files as resource_files

    entries: list[OutputEntry] = []
    for filename in sorted(_PACKAGED_ASSET_FILENAMES):
        packaged = resource_files("wiki").joinpath(f"assets/{filename}")
        if not packaged.is_file():
            continue
        rel = f"assets/{filename}"
        output_path = owned_output_dir / "assets" / filename
        if output_path.resolve() in seen_outputs:
            continue
        workspace_asset = config.config_root / "assets" / filename
        source = workspace_asset if workspace_asset.is_file() else None
        encoded = quote(rel, safe="/()_-.$~")
        public_url = f"{base}/{encoded}" if base else f"/{encoded}"
        entries.append(OutputEntry(source=source, output_path=output_path, public_url=public_url, kind="asset"))
    return entries


def resolve_asset_path(config: Config, current_file: Path, target: str) -> Path | None:
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
    for asset_dir in config.wiki.assets:
        try:
            candidate.relative_to(asset_dir.resolve())
            return candidate
        except ValueError:
            continue
    return None


def asset_reference_issue(config: Config, current_file: Path, target: str) -> str | None:
    asset_path = resolve_asset_path(config, current_file, target)
    if asset_path is None:
        return f"points outside configured assets: {target}"
    if config.is_excluded(asset_path):
        return f"points to excluded asset: {target}"
    if asset_path.is_symlink():
        return f"points to symlink asset, which will not be copied: {target}"
    if not asset_path.exists() or not asset_path.is_file():
        return f"points to missing asset: {target}"
    return None
