"""Vault fingerprinting and in-process RDF graph cache (runtime only, no disk I/O)."""

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
    for input_dir in config.input_dirs:
        if not input_dir.exists():
            continue
        for file_path in sorted(input_dir.rglob("*")):
            if not file_path.is_file() or config.is_excluded(file_path):
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


def get_process_graph(config: WikiConfig, infer: bool) -> Graph | None:
    """Return the in-memory graph for this vault fingerprint and infer mode, if loaded."""
    return _process_graph_cache.get(_cache_key(config, infer))


def set_process_graph(config: WikiConfig, infer: bool, graph: Graph) -> None:
    """Store a graph in the in-process cache, dropping stale entries for the same infer mode."""
    fp = vault_fingerprint(config)
    stale_keys = [key for key in _process_graph_cache if key[1] == infer and key[0] != fp]
    for key in stale_keys:
        del _process_graph_cache[key]
    _process_graph_cache[(fp, infer)] = graph


def clear_process_graph(config: WikiConfig, infer: bool) -> None:
    """Drop the in-process graph entry for the current vault fingerprint."""
    _process_graph_cache.pop(_cache_key(config, infer), None)


def clear_all_process_graphs() -> None:
    """Clear the entire in-process graph cache (tests and watch reload)."""
    _process_graph_cache.clear()
