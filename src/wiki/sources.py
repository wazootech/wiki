"""External source resolution and lockfile management.

wiki.yml declares desired sources; wiki.lock records the exact resolved
state. ``wiki install`` fetches and locks; ``wiki remove`` deletes.
"""

from __future__ import annotations

import logging
import re
import shutil
import subprocess
from dataclasses import dataclass, field
from io import StringIO
from pathlib import Path
from typing import Any

from ruamel.yaml import YAML

from .config import Config
from .schemas.sources import LOCKFILE_FILENAME, LockedSource, Lockfile, SourceConfig

logger = logging.getLogger(__name__)

_yaml = YAML()
_yaml.indent(mapping=2, sequence=4, offset=2)

_OWNER_REPO_SHORTHAND = re.compile(
    r"^(?P<owner>[a-zA-Z0-9._-]+)/(?P<repo>[a-zA-Z0-9._-]+?)(?:\.git)?$"
)


def _expand_source_url(url: str) -> str:
    """Expand ``owner/repo`` shorthand to ``https://github.com/owner/repo.git``.

    Full URLs (HTTPS, SSH) and non-GitHub URLs pass through unchanged.
    """
    match = _OWNER_REPO_SHORTHAND.match(url)
    if match:
        return f"https://github.com/{match.group('owner')}/{match.group('repo')}.git"
    return url


def _lockfile_path(config: Config) -> Path:
    return config.config_root / LOCKFILE_FILENAME


def _source_cache_dir(config: Config, source_name: str) -> Path:
    return config.config_root / ".wiki" / "sources" / source_name


def _config_path(config: Config) -> Path:
    return config.config_root / "wiki.yml"


def _load_lockfile(config: Config) -> Lockfile:
    return Lockfile.load(_lockfile_path(config))


def _save_lockfile(config: Config, lockfile: Lockfile) -> None:
    lockfile.save(_lockfile_path(config))


def _git_resolve_ref(ref: str, repo_dir: Path) -> str:
    result = subprocess.run(
        ["git", "rev-parse", ref],
        capture_output=True,
        text=True,
        cwd=repo_dir,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"Failed to resolve git ref {ref!r}: {result.stderr.strip()}"
        )
    return result.stdout.strip()


def _git_clone_or_fetch(source: SourceConfig, cache_dir: Path) -> Path:
    repo_dir = cache_dir / "repo"
    if repo_dir.exists():
        url_result = subprocess.run(
            ["git", "remote", "get-url", "origin"],
            capture_output=True,
            text=True,
            cwd=repo_dir,
        )
        if url_result.returncode == 0 and url_result.stdout.strip() != source.url:
            subprocess.run(
                ["git", "remote", "set-url", "origin", source.url],
                capture_output=True,
                text=True,
                cwd=repo_dir,
                check=True,
            )
            logger.info(
                "Updated remote URL for source from %s to %s",
                url_result.stdout.strip(),
                source.url,
            )

        result = subprocess.run(
            ["git", "fetch", "--tags", "--force", "origin", "+refs/heads/*:refs/heads/*"],
            capture_output=True,
            text=True,
            cwd=repo_dir,
        )
        if result.returncode != 0:
            raise RuntimeError(
                f"Failed to fetch {source.url}: {result.stderr.strip()}"
            )
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


def _git_prepare_ref(source: SourceConfig, repo_dir: Path) -> None:
    """After fetch, ensure the repo is checked out at the right ref.

    For pinned refs (branch, tag, or commit), checks out that ref.
    For unpinned sources (no ref), gets on a local branch if detached
    HEAD (handles switching from a pinned tag to an unpinned default).
    """
    ref = source.ref
    if ref is not None:
        subprocess.run(
            ["git", "checkout", ref, "--"],
            capture_output=True,
            text=True,
            cwd=repo_dir,
            check=True,
        )
    else:
        branch_result = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            capture_output=True,
            text=True,
            cwd=repo_dir,
        )
        if branch_result.stdout.strip() == "HEAD":
            sym_result = subprocess.run(
                ["git", "symbolic-ref", "refs/remotes/origin/HEAD"],
                capture_output=True,
                text=True,
                cwd=repo_dir,
            )
            if sym_result.returncode == 0:
                default_branch = sym_result.stdout.strip().removeprefix("refs/remotes/origin/")
                subprocess.run(
                    ["git", "checkout", default_branch, "--"],
                    capture_output=True,
                    text=True,
                    cwd=repo_dir,
                    check=True,
                )


def _source_resolved_path(source: SourceConfig, repo_dir: Path) -> Path:
    base = repo_dir / source.path if source.path else repo_dir
    if not base.exists():
        raise RuntimeError(
            f"Source {source.name!r}: path {source.path!r} does not exist"
        )
    return base.resolve()


def _infer_name_from_url(url: str) -> str:
    stem = url.rstrip("/").rsplit("/", 1)[-1]
    stem = re.sub(r"(\.wiki|\.git)$", "", stem, flags=re.IGNORECASE)
    return stem or "source"


def _parse_url_ref(url: str) -> tuple[str, str | None]:
    if "#" in url:
        url, ref = url.rsplit("#", 1)
        return url, ref or None
    return url, None


def _yaml_dump(data: object) -> str:
    buf = StringIO()
    _yaml.dump(data, buf)
    return buf.getvalue().rstrip() + "\n"


def _add_to_wiki_yml(config: Config, source: SourceConfig) -> None:
    config_path = _config_path(config)
    if not config_path.exists():
        raise RuntimeError("wiki.yml not found")

    raw = config_path.read_text(encoding="utf-8")
    data = _yaml.load(raw) or {}

    sources = data.get("sources")
    if sources is None:
        sources = []
        data["sources"] = sources

    if not isinstance(sources, list):
        raise RuntimeError("wiki.yml sources must be a list")

    for existing in sources:
        if isinstance(existing, dict) and existing.get("name") == source.name:
            raise RuntimeError(f"Source {source.name!r} already exists in wiki.yml")

    entry: dict[str, Any] = {"name": source.name, "type": "git", "url": source.url}
    if source.ref:
        entry["ref"] = source.ref
    if source.path:
        entry["path"] = source.path
    sources.append(entry)

    config_path.write_text(_yaml_dump(data), encoding="utf-8")


def _remove_from_wiki_yml(config: Config, name: str) -> None:
    config_path = _config_path(config)
    if not config_path.exists():
        return

    raw = config_path.read_text(encoding="utf-8")
    data = _yaml.load(raw) or {}

    sources = data.get("sources")
    if not isinstance(sources, list):
        return

    new_sources = [s for s in sources if not (isinstance(s, dict) and s.get("name") == name)]
    if len(new_sources) == len(sources):
        raise RuntimeError(f"Source {name!r} not found in wiki.yml")

    if new_sources:
        data["sources"] = new_sources
    else:
        del data["sources"]

    config_path.write_text(_yaml_dump(data), encoding="utf-8")


def install(config: Config, url: str | None = None) -> Lockfile:
    """Fetch and lock sources.

    With no url, fetches all sources from wiki.yml and updates wiki.lock.
    With a url, adds a new source to wiki.yml, fetches it, and updates
    wiki.lock.

    Returns the updated Lockfile.
    """
    if url:
        clean_url, ref = _parse_url_ref(url)
        clean_url = _expand_source_url(clean_url)
        name = _infer_name_from_url(clean_url)
        source = SourceConfig(name=name, type="git", url=clean_url, ref=ref)
        _add_to_wiki_yml(config, source)
        config.sources = list(config.sources) + [source]
    elif not config.sources:
        logger.info("No sources declared in wiki.yml.")
        return Lockfile()

    lockfile = _load_lockfile(config)

    for source in config.sources:
        logger.info("Installing source %r from %s", source.name, source.url)
        cache_dir = _source_cache_dir(config, source.name)
        repo_dir = _git_clone_or_fetch(source, cache_dir)
        _git_prepare_ref(source, repo_dir)

        resolved_ref = _git_resolve_ref("HEAD", repo_dir)
        resolved_path = _source_resolved_path(source, repo_dir)

        lockfile.sources[source.name] = LockedSource(
            url=source.url,
            resolved_ref=resolved_ref,
            ref=source.ref,
            path=source.path,
            fetched_at=Lockfile.timestamp(),
        )
        logger.info(
            "Locked source %r at %s -> %s",
            source.name,
            resolved_ref[:12],
            resolved_path,
        )

    _save_lockfile(config, lockfile)
    return lockfile


@dataclass
class SourceUpdate:
    """Result of checking a single source for updates."""

    name: str
    url: str
    previous_ref: str
    current_ref: str
    updated: bool


@dataclass
class UpdateResult:
    """Aggregate result of ``update()``."""

    updates: list[SourceUpdate] = field(default_factory=list)

    @property
    def count(self) -> int:
        return len(self.updates)

    @property
    def changed(self) -> list[SourceUpdate]:
        return [u for u in self.updates if u.updated]


def update(config: Config, name: str | None = None, *, dry_run: bool = False) -> UpdateResult:
    """Check locked sources for newer commits.

    Fetches each source's remote, resolves the current HEAD (or pinned ref),
    and compares against the locked SHA. With ``dry_run=True``, reports
    what would change without modifying wiki.lock.

    Returns an ``UpdateResult`` with per-source ``SourceUpdate`` entries.
    """
    lockfile = _load_lockfile(config)
    result = UpdateResult()

    sources = [s for s in config.sources if name is None or s.name == name]
    if not sources:
        if name:
            logger.warning("Source %r not found in wiki.yml.", name)
        return result

    for source in sources:
        locked = lockfile.sources.get(source.name)
        if locked is None:
            logger.warning("Source %r is not locked. Run 'wiki install' first.", source.name)
            continue

        cache_dir = _source_cache_dir(config, source.name)
        repo_dir = _git_clone_or_fetch(source, cache_dir)
        _git_prepare_ref(source, repo_dir)

        current_ref = _git_resolve_ref("HEAD", repo_dir)
        previous_ref = locked.resolved_ref
        updated = current_ref != previous_ref

        if updated and not dry_run:
            lockfile.sources[source.name] = LockedSource(
                url=source.url,
                resolved_ref=current_ref,
                ref=source.ref,
                path=source.path,
                fetched_at=Lockfile.timestamp(),
            )

        result.updates.append(SourceUpdate(
            name=source.name,
            url=source.url,
            previous_ref=previous_ref[:12] if previous_ref else "",
            current_ref=current_ref[:12],
            updated=updated,
        ))

    if not dry_run and result.changed:
        _save_lockfile(config, lockfile)

    return result


def remove(config: Config, name: str) -> None:
    """Remove a source from wiki.yml, its cache, and wiki.lock."""
    cache_dir = _source_cache_dir(config, name)
    if cache_dir.exists():
        shutil.rmtree(cache_dir)
        logger.info("Removed cache for source %r", name)

    lockfile = _load_lockfile(config)
    if name in lockfile.sources:
        del lockfile.sources[name]
        _save_lockfile(config, lockfile)
        logger.info("Removed lock entry for source %r", name)

    _remove_from_wiki_yml(config, name)
    logger.info("Removed source %r from wiki.yml", name)


def resolve(config: Config) -> list[Path]:
    """Return resolved local paths for all locked sources.

    Reads wiki.lock and returns the local paths of cached sources.
    Does NOT fetch — use ``install()`` to ensure sources are up to date.
    """
    if not config.sources:
        return []

    lockfile = _load_lockfile(config)
    resolved: list[Path] = []

    for source in config.sources:
        locked = lockfile.sources.get(source.name)
        if locked is None:
            logger.warning("Source %r is not locked. Run 'wiki install' first.", source.name)
            continue

        repo_dir = _source_cache_dir(config, source.name) / "repo"
        if not repo_dir.exists():
            logger.warning("Source %r is not cached. Run 'wiki install' first.", source.name)
            continue

        try:
            resolved.append(_source_resolved_path(source, repo_dir))
        except RuntimeError as exc:
            logger.warning("Source %r: %s", source.name, exc)
            continue

    return resolved
