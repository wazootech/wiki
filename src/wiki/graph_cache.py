"""Vault fingerprinting and graph caches.

Build the vault graph once per process and reuse it for every SPARQL query and
render in that process, so OWL-RL expansion and vault parsing are not repeated
for each block or CLI subcommand. Optional disk warm-start can persist a graph
between one-shot CLI invocations.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from rdflib import Graph

from . import __version__
from .config import WikiConfig

# In-process graph cache: (vault_fingerprint, infer) -> Graph
_process_graph_cache: dict[tuple[str, bool], Graph] = {}


def cache_dir(config: WikiConfig) -> Path:
    """Directory for optional on-disk graph cache artifacts."""
    return config.config_root / ".wiki" / "cache"


def _config_fingerprint(config: WikiConfig) -> dict[str, Any]:
    namespaces = {
        prefix: str(ns)
        for prefix, ns in sorted(config.context.namespaces.items(), key=lambda item: item[0])
    }
    return {
        "wiki_base": config.wiki_base,
        "uri_ext": config.uri_ext,
        "content_predicate": config.content_predicate,
        "exclude": sorted(config.exclude),
        "namespaces": namespaces,
    }


def iter_vault_files(config: WikiConfig) -> list[Path]:
    """All non-excluded files under input_dirs that contribute to the graph."""
    files: list[Path] = []
    cache_root = cache_dir(config).resolve()
    for input_dir in config.input_dirs:
        if not input_dir.exists():
            continue
        for file_path in sorted(input_dir.rglob("*")):
            if not file_path.is_file() or config.is_excluded(file_path):
                continue
            try:
                if file_path.resolve().is_relative_to(cache_root):
                    continue
            except ValueError:
                continue
            files.append(file_path)
    return files


def vault_manifest(config: WikiConfig) -> dict[str, Any]:
    """Build a stable manifest describing vault inputs (without infer flag)."""
    entries = []
    for file_path in iter_vault_files(config):
        stat = file_path.stat()
        entries.append(
            {
                "path": config.relative_to_root(file_path),
                "size": stat.st_size,
                "mtime_ns": stat.st_mtime_ns,
            }
        )
    return {
        "version": __version__,
        "config": _config_fingerprint(config),
        "files": entries,
    }


def vault_fingerprint(config: WikiConfig) -> str:
    """SHA-256 hex digest of the vault manifest."""
    payload = json.dumps(vault_manifest(config), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _cache_key(config: WikiConfig, infer: bool) -> tuple[str, bool]:
    return (vault_fingerprint(config), infer)


def _disk_cache_prefix(infer: bool) -> str:
    return "graph-infer" if infer else "graph-asserted"


def disk_cache_path(config: WikiConfig, infer: bool) -> Path:
    """Path to the persisted graph for the current vault fingerprint."""
    fp = vault_fingerprint(config)
    return cache_dir(config) / f"{_disk_cache_prefix(infer)}-{fp}.nt"


def get_process_graph(config: WikiConfig, infer: bool) -> Graph | None:
    """Return the in-memory graph for this vault fingerprint and infer mode, if loaded."""
    return _process_graph_cache.get(_cache_key(config, infer))


def get_disk_graph(config: WikiConfig, infer: bool) -> Graph | None:
    """Return a persisted graph for this vault fingerprint and infer mode, if present."""
    cache_path = disk_cache_path(config, infer)
    if not cache_path.exists():
        return None
    try:
        graph = Graph()
        graph.parse(cache_path, format="nt")
        return graph
    except Exception:
        try:
            cache_path.unlink()
        except OSError:
            pass
        return None


def set_process_graph(config: WikiConfig, infer: bool, graph: Graph) -> None:
    """Store a graph in the in-process cache, dropping stale entries for the same infer mode."""
    fp = vault_fingerprint(config)
    stale_keys = [key for key in _process_graph_cache if key[1] == infer and key[0] != fp]
    for key in stale_keys:
        del _process_graph_cache[key]
    _process_graph_cache[(fp, infer)] = graph


def set_disk_graph(config: WikiConfig, infer: bool, graph: Graph) -> None:
    """Persist a graph for reuse across one-shot CLI invocations."""
    root = cache_dir(config)
    root.mkdir(parents=True, exist_ok=True)
    cache_path = disk_cache_path(config, infer)
    for stale in root.glob(f"{_disk_cache_prefix(infer)}-*.nt"):
        if stale != cache_path:
            try:
                stale.unlink()
            except OSError:
                pass
    cache_path.write_text(graph.serialize(format="nt"), encoding="utf-8")


def clear_process_graph(config: WikiConfig, infer: bool) -> None:
    """Drop the in-process graph entry for the current vault fingerprint."""
    _process_graph_cache.pop(_cache_key(config, infer), None)


def clear_disk_graph(config: WikiConfig, infer: bool) -> None:
    """Drop the persisted graph entry for the current vault fingerprint."""
    try:
        disk_cache_path(config, infer).unlink()
    except OSError:
        pass


def clear_all_process_graphs() -> None:
    """Clear the entire in-process graph cache (tests and watch reload)."""
    _process_graph_cache.clear()
