"""Persistent RDF graph cache keyed on vault fingerprint."""

from __future__ import annotations

import hashlib
import json
import pickle
import shutil
from pathlib import Path
from typing import Any

from rdflib import Graph

from . import __version__
from .config import WikiConfig

CACHE_DIR_NAME = ".wiki/cache"
MANIFEST_ASSERTED_NAME = "manifest-asserted.json"
MANIFEST_INFERRED_NAME = "manifest-inferred.json"
GRAPH_ASSERTED_NAME = "graph-asserted.pkl"
GRAPH_INFERRED_NAME = "graph-inferred.pkl"
RENDER_STATE_NAME = "render-state.json"


def get_cache_dir(config: WikiConfig) -> Path:
    return config.config_root / CACHE_DIR_NAME


def _graph_cache_path(config: WikiConfig, infer: bool) -> Path:
    name = GRAPH_INFERRED_NAME if infer else GRAPH_ASSERTED_NAME
    return get_cache_dir(config) / name


def _manifest_path(config: WikiConfig, infer: bool) -> Path:
    name = MANIFEST_INFERRED_NAME if infer else MANIFEST_ASSERTED_NAME
    return get_cache_dir(config) / name


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


def _is_cache_path(config: WikiConfig, file_path: Path) -> bool:
    cache_dir = get_cache_dir(config).resolve()
    resolved = file_path.resolve()
    return resolved == cache_dir or cache_dir in resolved.parents


def iter_vault_files(config: WikiConfig) -> list[Path]:
    """All non-excluded files under input_dirs that contribute to the graph."""
    files: list[Path] = []
    for input_dir in config.input_dirs:
        if not input_dir.exists():
            continue
        for file_path in sorted(input_dir.rglob("*")):
            if not file_path.is_file() or config.is_excluded(file_path):
                continue
            if _is_cache_path(config, file_path):
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


def _read_manifest(config: WikiConfig, infer: bool) -> dict[str, Any] | None:
    path = _manifest_path(config, infer)
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else None
    except (OSError, json.JSONDecodeError):
        return None


def load_cached_graph(config: WikiConfig, infer: bool) -> Graph | None:
    """Return a cached graph when manifest and serialized graph match the vault."""
    current_fp = vault_fingerprint(config)
    manifest = _read_manifest(config, infer)
    graph_path = _graph_cache_path(config, infer)

    if manifest is None or not graph_path.is_file():
        return None

    if manifest.get("vault_fingerprint") != current_fp:
        return None
    if manifest.get("version") != __version__:
        return None

    try:
        with graph_path.open("rb") as handle:
            loaded = pickle.load(handle)
    except (OSError, pickle.PickleError, TypeError, AttributeError):
        return None
    if not isinstance(loaded, Graph):
        return None
    config.bind_namespaces(loaded)
    return loaded


def save_cached_graph(config: WikiConfig, graph: Graph, infer: bool) -> None:
    """Serialize graph and write manifest for the current vault fingerprint."""
    cache_dir = get_cache_dir(config)
    cache_dir.mkdir(parents=True, exist_ok=True)
    graph_path = _graph_cache_path(config, infer)
    with graph_path.open("wb") as handle:
        pickle.dump(graph, handle, protocol=pickle.HIGHEST_PROTOCOL)

    manifest = {
        "version": __version__,
        "vault_fingerprint": vault_fingerprint(config),
        "infer": infer,
    }
    _manifest_path(config, infer).write_text(json.dumps(manifest, indent=2), encoding="utf-8")


def invalidate_cache(config: WikiConfig) -> None:
    """Remove the entire graph cache directory."""
    cache_dir = get_cache_dir(config)
    if cache_dir.exists():
        shutil.rmtree(cache_dir)


def render_state_path(config: WikiConfig) -> Path:
    return get_cache_dir(config) / RENDER_STATE_NAME


def load_render_state(config: WikiConfig) -> dict[str, Any] | None:
    path = render_state_path(config)
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else None
    except (OSError, json.JSONDecodeError):
        return None


def save_render_state(config: WikiConfig, state: dict[str, Any]) -> None:
    path = render_state_path(config)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, indent=2), encoding="utf-8")


def file_stat_entry(config: WikiConfig, md_file: Path) -> dict[str, int]:
    stat = md_file.stat()
    return {
        "mtime_ns": stat.st_mtime_ns,
        "size": stat.st_size,
    }
