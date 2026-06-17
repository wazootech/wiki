"""Render SPARQL blocks via workspace session."""

from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path

from .paths import select_markdown_paths
from .render import render_markdown_files
from .schemas import RenderReport
from .workspace import Wiki


def _render_workspace(
    workspace: Wiki,
    files: Sequence[Path] | None = None,
    *,
    check_only: bool = False,
    reload: bool = False,
    disk_cache: bool = False,
    no_inference: bool = False,
) -> RenderReport:
    config = workspace.config
    explicit_files: tuple[Path, ...] = ()
    if files:
        select_markdown_paths(config, tuple(files))
        explicit_files = tuple(files)

    graph = workspace.graph(
        infer=not no_inference,
        reload=reload,
        disk_cache=disk_cache,
    )
    success_count, error_count, stale_files, render_errors = render_markdown_files(
        config,
        graph,
        dry_run=check_only,
        explicit_files=explicit_files,
    )
    if disk_cache and not check_only and success_count > 0:
        workspace.graph(infer=not no_inference, reload=True, disk_cache=True)

    ok = not stale_files if check_only else error_count == 0
    return RenderReport(
        ok=ok,
        updated_count=success_count,
        error_count=error_count,
        stale_files=stale_files,
        render_errors=render_errors,
    )
