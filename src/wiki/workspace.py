"""In-process wiki workspace session wrapping config and graph lifecycle."""

from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path

from rdflib import Graph

from .audit import merge_results, run_check, run_lint
from .config import Config
from .graph import load_graph
from .paths import routes_from_markdown_files, select_document_paths
from .runtime import resolve_runtime_config
from .schemas import AuditReport


class Workspace:
    """Loaded wiki configuration and graph session for library operations."""

    def __init__(self, config: Config) -> None:
        self.config = config

    @classmethod
    def load(
        cls,
        config_path: Path | str,
        *,
        wiki_inputs: Sequence[str] | None = None,
    ) -> Workspace:
        config = Config.load(Path(config_path))
        if wiki_inputs:
            config.wiki.inputs = [
                Path(entry) if Path(entry).is_absolute() else config.config_root / entry
                for entry in wiki_inputs
            ]
        return cls(config)

    def with_runtime(
        self,
        *,
        base_url: str | None = None,
        url_style: str | None = None,
    ) -> Workspace:
        return Workspace(resolve_runtime_config(self.config, base_url=base_url, url_style=url_style))

    def graph(
        self,
        *,
        infer: bool = True,
        reload: bool = False,
        disk_cache: bool = False,
    ) -> Graph:
        return load_graph(
            self.config,
            infer=infer,
            reload=reload,
            disk_cache=disk_cache,
        )

    def _file_filter(self, files: Sequence[Path] | None) -> tuple[set[str] | None, list[Path] | None]:
        if not files:
            return None, None
        file_filter = routes_from_markdown_files(self.config, tuple(files))
        file_paths = select_document_paths(self.config, tuple(files))
        return file_filter, file_paths

    def check(self, files: Sequence[Path] | None = None) -> AuditReport:
        file_filter, file_paths = self._file_filter(files)
        if file_paths is not None:
            return run_check(self.config, file_filter=file_filter, file_paths=file_paths)
        return run_check(self.config, file_filter=file_filter)

    def lint(self, files: Sequence[Path] | None = None) -> AuditReport:
        file_filter, _ = self._file_filter(files)
        return run_lint(self.config, file_filter=file_filter)

    def preflight(self) -> AuditReport:
        return merge_results(self.lint(), self.check())
