"""In-process wiki corpus session wrapping config and graph lifecycle."""

from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path
from typing import TYPE_CHECKING

from rdflib import Graph

from .audit import merge_results, run_check, run_lint
from .config import Config
from .graph import load_graph
from .paths import routes_from_markdown_files, select_document_paths
from .runtime import resolve_runtime_config
from .schemas import (
    AuditReport,
    BuildOptions,
    BuildResult,
    ExportResult,
    FmtReport,
    InitOptions,
    LinkReport,
    RenderReport,
    ScaffoldResult,
)

if TYPE_CHECKING:
    from .link_ops import LinkOptions


class Wiki:
    """Loaded wiki configuration and graph session for library operations."""

    def __init__(self, config: Config) -> None:
        self.config = config

    @classmethod
    def load(
        cls,
        config_path: Path | str,
        *,
        wiki_inputs: Sequence[str] | None = None,
    ) -> Wiki:
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
    ) -> Wiki:
        return Wiki(resolve_runtime_config(self.config, base_url=base_url, url_style=url_style))

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

    def check(
        self,
        files: Sequence[Path] | None = None,
        *,
        strict: bool = False,
    ) -> AuditReport:
        file_filter, file_paths = self._file_filter(files)
        if file_paths is not None:
            report = run_check(self.config, file_filter=file_filter, file_paths=file_paths)
        else:
            report = run_check(self.config, file_filter=file_filter)
        if strict:
            report = report.apply_strict()
        return report

    def lint(
        self,
        files: Sequence[Path] | None = None,
        *,
        strict: bool = False,
    ) -> AuditReport:
        file_filter, _ = self._file_filter(files)
        report = run_lint(self.config, file_filter=file_filter)
        if strict:
            report = report.apply_strict()
        return report

    def preflight(self) -> AuditReport:
        return merge_results(self.lint(), self.check())

    def build(
        self,
        output_dir: Path | str = "_site",
        *,
        base_url: str | None = None,
        url_style: str | None = None,
        render: bool = False,
        reload: bool = False,
        cache: bool = False,
        no_check: bool = False,
        verbose: bool = False,
    ) -> BuildResult:
        from .publish import build_workspace
        wiki = self
        if base_url is not None or url_style is not None:
            wiki = self.with_runtime(base_url=base_url, url_style=url_style)
        options = BuildOptions(
            output_dir=Path(output_dir),
            render_first=render,
            reload_graph=reload,
            disk_cache=cache,
            skip_preflight=no_check,
            verbose=verbose,
        )
        return build_workspace(wiki, options)

    def format(
        self,
        files: Sequence[Path] | None = None,
        *,
        check: bool = False,
        verbose: bool = False,
    ) -> FmtReport:
        from .fmt_ops import format_files
        return format_files(self, files, check_only=check, verbose=verbose)

    def render(
        self,
        files: Sequence[Path] | None = None,
        *,
        check: bool = False,
        reload: bool = False,
        cache: bool = False,
        no_inference: bool = False,
    ) -> RenderReport:
        from .render_ops import render_workspace
        return render_workspace(
            self,
            files,
            check_only=check,
            reload=reload,
            disk_cache=cache,
            no_inference=no_inference,
        )

    def export(
        self,
        files: Sequence[Path] | None = None,
        *,
        format: str = "dict",
        mode: str = "expanded",
    ) -> ExportResult:
        from .export_ops import export_documents
        return export_documents(self, files, rdf_format=format, mode=mode)

    def link(
        self,
        files: Sequence[Path] | None = None,
        *,
        apply: bool = False,
        fix_broken: bool = False,
        dry_run: bool = False,
        check: bool = False,
        verbose: bool = False,
    ) -> LinkReport:
        from .link_ops import run_link, LinkOptions
        options = LinkOptions(
            apply=apply,
            fix_broken=fix_broken,
            dry_run=dry_run,
            check=check,
            verbose=verbose,
        )
        return run_link(self, files, options)

    def query(
        self,
        sparql_query: str,
        *,
        format: str = "table",
        no_inference: bool = False,
        reload: bool = False,
        cache: bool = False,
        jq: str | None = None,
        pretty: bool = False,
    ) -> str:
        from .format import run_query
        from .jqfilter import resolve_path
        import json

        graph = self.graph(infer=not no_inference, reload=reload, disk_cache=cache)
        result = run_query(
            graph,
            sparql_query,
            output_format="json" if jq is not None else format,
            base_iri=self.config.base_iri,
            pretty=pretty,
        )
        if jq is not None:
            matches = resolve_path(json.loads(result), jq)
            return "\n".join(str(m) for m in matches)
        return result

    def serve(
        self,
        *,
        host: str = "127.0.0.1",
        port: int = 8080,
        base_url: str | None = None,
        url_style: str | None = None,
        watch: bool = False,
    ) -> None:
        from .serve import run_server

        runtime_config = resolve_runtime_config(
            self.config,
            base_url=base_url,
            url_style=url_style,
        )
        run_server(runtime_config, host=host, port=port, watch=watch)

    @classmethod
    def init(
        cls,
        target_dir: Path | str,
        options: InitOptions,
        *,
        git: bool = False,
    ) -> ScaffoldResult:
        from .init_scaffold import scaffold_workspace
        return scaffold_workspace(Path(target_dir), options, init_git=git)
