"""External source resolution and lockfile management.

Treats external data sources like a package manager: wiki.yml declares the
desired sources, wiki.lock records the exact resolved state for reproducible
builds, and wiki source update refreshes and re-locks.
"""

from __future__ import annotations

import hashlib
import logging
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from .config import Config
from .schemas.sources import LOCKFILE_FILENAME, Lockfile, LockedSource, SourceConfig

logger = logging.getLogger(__name__)


def _lockfile_path(config: Config) -> Path:
    return config.config_root / LOCKFILE_FILENAME


def _source_cache_dir(config: Config, source_name: str) -> Path:
    return config.config_root / ".wiki" / "sources" / source_name


def _load_lockfile(config: Config) -> Lockfile:
    return Lockfile.load(_lockfile_path(config))


def _save_lockfile(config: Config, lockfile: Lockfile) -> None:
    lockfile.save(_lockfile_path(config))


def _git_hash_object(ref: str, repo_path: Path) -> str:
    """Resolve a git ref to a full SHA-256 commit hash."""
    result = subprocess.run(
        ["git", "rev-parse", ref],
        capture_output=True,
        text=True,
        cwd=repo_path,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"Failed to resolve git ref {ref!r}: {result.stderr.strip()}"
        )
    return result.stdout.strip()


def _git_fetch(source: SourceConfig, cache_dir: Path) -> Path:
    """Clone or fetch a git source into the local cache."""
    repo_dir = cache_dir / "repo"
    if repo_dir.exists():
        try:
            result = subprocess.run(
                ["git", "fetch", "--tags", "--force", "origin"],
                capture_output=True,
                text=True,
                cwd=repo_dir,
            )
            if result.returncode != 0:
                raise RuntimeError(
                    f"Failed to fetch {source.url}: {result.stderr.strip()}"
                )
        except Exception as exc:
            raise RuntimeError(
                f"Failed to fetch {source.url}: {exc}"
            ) from exc
    else:
        cache_dir.mkdir(parents=True, exist_ok=True)
        result = subprocess.run(
            ["git", "clone", "--depth", "1", source.url, str(repo_dir)],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            shutil.rmtree(cache_dir, ignore_errors=True)
            raise RuntimeError(
                f"Failed to clone {source.url}: {result.stderr.strip()}"
            )
    return repo_dir


def _git_checkout(ref: str, repo_dir: Path) -> None:
    """Checkout a specific ref in the repo."""
    result = subprocess.run(
        ["git", "checkout", ref, "--"],
        capture_output=True,
        text=True,
        cwd=repo_dir,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"Failed to checkout {ref!r}: {result.stderr.strip()}"
        )


def _git_resolve_head(repo_dir: Path) -> str:
    """Resolve HEAD to a commit SHA."""
    return _git_hash_object("HEAD", repo_dir)


def _compute_content_hash(repo_dir: Path) -> str:
    """Compute a SHA-256 hash of all tracked files in the repo."""
    result = subprocess.run(
        ["git", "ls-files", "-z"],
        capture_output=True,
        text=True,
        cwd=repo_dir,
    )
    if result.returncode != 0:
        return ""
    files = result.stdout.split("\0") if result.stdout else []
    hasher = hashlib.sha256()
    for file_path in sorted(f for f in files if f):
        try:
            content = (repo_dir / file_path).read_bytes()
            hasher.update(file_path.encode("utf-8"))
            hasher.update(b"\0")
            hasher.update(content)
            hasher.update(b"\0")
        except OSError:
            continue
    return hasher.hexdigest()


def _resolve_source_path(source: SourceConfig, repo_dir: Path) -> Path:
    """Return the local path for a source's content."""
    base = repo_dir
    if source.path:
        base = repo_dir / source.path
    if not base.exists():
        raise RuntimeError(
            f"Source {source.name!r}: path {source.path!r} does not exist in the repository"
        )
    return base.resolve()


def resolve(config: Config) -> list[Path]:
    """Resolve all external sources to local paths using the lockfile.

    Reads each source declaration from config, checks the lockfile for
    cached state, and returns the resolved local paths. Does NOT fetch —
    use ``update()`` to refresh sources first.
    """
    if not config.sources:
        return []

    lockfile = _load_lockfile(config)
    resolved: list[Path] = []

    for source in config.sources:
        locked = lockfile.sources.get(source.name)
        if locked is None:
            logger.warning(
                "Source %r is not locked. Run 'wiki source update' to fetch and lock it.",
                source.name,
            )
            continue

        cache_dir = _source_cache_dir(config, source.name)
        repo_dir = cache_dir / "repo"
        if not repo_dir.exists():
            logger.warning(
                "Source %r is not cached locally. Run 'wiki source update' to fetch it.",
                source.name,
            )
            continue

        resolved_path = _resolve_source_path(source, repo_dir)
        resolved.append(resolved_path)

    return resolved


def update(config: Config) -> Lockfile:
    """Fetch and lock all declared sources.

    Clones or fetches each source, pins the resolved ref in wiki.lock,
    and returns the updated Lockfile.
    """
    lockfile = _load_lockfile(config)

    for source in config.sources:
        logger.info("Updating source %r from %s", source.name, source.url)
        cache_dir = _source_cache_dir(config, source.name)
        repo_dir = _git_fetch(source, cache_dir)

        ref_to_check = source.ref or "HEAD"
        if ref_to_check != "HEAD":
            _git_checkout(ref_to_check, repo_dir)

        resolved_ref = _git_resolve_head(repo_dir)
        content_hash = _compute_content_hash(repo_dir)

        lockfile.sources[source.name] = LockedSource(
            url=source.url,
            resolved_ref=resolved_ref,
            ref=source.ref,
            path=source.path,
            content_hash=content_hash,
            fetched_at=lockfile.timestamp(),
        )
        logger.info(
            "Locked source %r at %s (%s)",
            source.name,
            resolved_ref[:12],
            content_hash[:12] + "..." if content_hash else "no hash",
        )

    _save_lockfile(config, lockfile)
    return lockfile


def status(config: Config) -> list[dict[str, Any]]:
    """Return the current status of each source vs the lockfile.

    Returns a list of dicts with keys: name, type, url, declared_ref,
    locked_ref, locked_hash, cached, is_pinned, is_dirty.
    """
    lockfile = _load_lockfile(config)
    results: list[dict[str, Any]] = []

    for source in config.sources:
        locked = lockfile.sources.get(source.name)
        cache_dir = _source_cache_dir(config, source.name)
        repo_dir = cache_dir / "repo"
        cached = repo_dir.exists()

        is_pinned = locked is not None
        is_dirty = False
        if cached and locked and locked.resolved_ref:
            try:
                head = _git_hash_object("HEAD", repo_dir)
                is_dirty = head != locked.resolved_ref
            except RuntimeError:
                is_dirty = True

        results.append({
            "name": source.name,
            "type": source.type,
            "url": source.url,
            "declared_ref": source.ref,
            "locked_ref": locked.resolved_ref[:12] if locked and locked.resolved_ref else None,
            "locked_hash": locked.content_hash[:12] + "..." if locked and locked.content_hash else None,
            "cached": cached,
            "is_pinned": is_pinned,
            "is_dirty": is_dirty,
        })

    return results
