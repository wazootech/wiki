"""In-process Wiki session wrapping config, graph lifecycle, and operations."""

from __future__ import annotations

import json
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from rdflib import Graph

from .audit import _merge_results, _run_check, _run_lint
from .config import Config
from .fmt_util import format_markdown
from .format import process_rdf_format
from .graph import load_graph
from .link_fix import (
    apply_broken_link_fixes,
    find_broken_link_fixes,
    remaining_broken_links,
)
from .link_suggest import apply_link_opportunities, find_link_opportunities
from .links import format_internal_link
from .parser import document_data_from_path
from .paths import (
    iter_document_files,
    iter_markdown_files,
    route_for_document_file,
    routes_from_markdown_files,
    select_document_paths,
    select_markdown_paths,
)
from .render import render_markdown_files
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

_RAW_FORMATS = frozenset({"turtle", "xml", "n3", "nt", "trig", "nquads"})


def _resolve_runtime_config(
    config: Config,
    *,
    base_url: str | None = None,
    url_style: str | None = None,
) -> Config:
    runtime_config = config.model_copy(deep=True)
    if base_url is not None:
        runtime_config.site.base_url = base_url.rstrip("/")
    if url_style is not None:
        runtime_config.site.url_style = url_style
    return runtime_config


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
        return Wiki(_resolve_runtime_config(self.config, base_url=base_url, url_style=url_style))

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
            report = _run_check(self.config, file_filter=file_filter, file_paths=file_paths)
        else:
            report = _run_check(self.config, file_filter=file_filter)
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
        report = _run_lint(self.config, file_filter=file_filter)
        if strict:
            report = report.apply_strict()
        return report

    def preflight(self) -> AuditReport:
        return _merge_results(self.lint(), self.check())

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
        from .publish import _build_static_site
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
        return _build_static_site(wiki, options)

    def format(
        self,
        files: Sequence[Path] | None = None,
        *,
        check: bool = False,
        verbose: bool = False,
    ) -> FmtReport:
        config = self.config
        if files:
            target_files = select_markdown_paths(config, tuple(files))
        else:
            target_files = list(iter_markdown_files(config))

        report = FmtReport()
        for file_path in target_files:
            try:
                original = file_path.read_text(encoding="utf-8")
                formatted = format_markdown(original, file_path, config)
                if original != formatted:
                    report.stale_files.append(file_path)
                    if not check:
                        file_path.write_text(formatted, encoding="utf-8")
                        report.formatted_count += 1
                        if verbose:
                            report.verbose_lines.append(f"Formatted {file_path.name}")
                elif verbose:
                    report.verbose_lines.append(f"Already formatted {file_path.name}")
            except Exception as exc:
                report.ok = False
                report.error_message = f"Error formatting {file_path.name}: {exc}"
                return report

        report.ok = not report.stale_files if check else True
        return report

    def render(
        self,
        files: Sequence[Path] | None = None,
        *,
        check: bool = False,
        reload: bool = False,
        cache: bool = False,
        no_inference: bool = False,
    ) -> RenderReport:
        config = self.config
        explicit_files: tuple[Path, ...] = ()
        if files:
            select_markdown_paths(config, tuple(files))
            explicit_files = tuple(files)

        graph = self.graph(
            infer=not no_inference,
            reload=reload,
            disk_cache=cache,
        )
        success_count, error_count, stale_files, render_errors = render_markdown_files(
            config,
            graph,
            dry_run=check,
            explicit_files=explicit_files,
        )
        if cache and not check and success_count > 0:
            self.graph(infer=not no_inference, reload=True, disk_cache=True)

        ok = not stale_files if check else error_count == 0
        return RenderReport(
            ok=ok,
            updated_count=success_count,
            error_count=error_count,
            stale_files=stale_files,
            render_errors=render_errors,
        )

    def export(
        self,
        files: Sequence[Path] | None = None,
        *,
        format: str = "dict",
        mode: str = "expanded",
    ) -> ExportResult:
        config = self.config
        result_payload: Any

        if files:
            if len(files) > 1 and format in _RAW_FORMATS:
                return ExportResult(
                    ok=False,
                    error_message=(
                        "raw RDF export formats require a single FILE or whole-wiki export (omit FILE)."
                    ),
                )
            selected = select_document_paths(config, tuple(files))
            converted_list = []
            for file_path in selected:
                data = document_data_from_path(file_path, content_predicate=config.graph.content_predicate)
                if data is None:
                    return ExportResult(
                        ok=False,
                        error_message=f"No valid document metadata found in {file_path.name}",
                    )
                converted_list.append(
                    {
                        "name": file_path.name,
                        "rdf": process_rdf_format(
                            data,
                            route_for_document_file(config, file_path),
                            config,
                            format,
                            mode=mode,
                        ),
                    }
                )
            result_payload = converted_list[0] if len(converted_list) == 1 else converted_list
        else:
            converted_list = []
            for file_path in iter_document_files(config):
                data = document_data_from_path(file_path, content_predicate=config.graph.content_predicate)
                if data:
                    converted_list.append(
                        {
                            "name": file_path.name,
                            "rdf": process_rdf_format(
                                data,
                                route_for_document_file(config, file_path),
                                config,
                                format,
                                mode=mode,
                            ),
                        }
                    )
            result_payload = converted_list

        if format in _RAW_FORMATS and not isinstance(result_payload, list):
            output_str = (
                result_payload["rdf"]
                if isinstance(result_payload["rdf"], str)
                else json.dumps(result_payload["rdf"], indent=2, default=str)
            )
        else:
            output_str = json.dumps(result_payload, indent=2, default=str)

        return ExportResult(ok=True, output=output_str)

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
        config = self.config
        file_filter = routes_from_markdown_files(config, tuple(files)) if files else None
        report = LinkReport()
        lines = report.lines

        if fix_broken:
            fixes = find_broken_link_fixes(config, file_filter=file_filter)
            report.fixes = len(fixes)
            for fix in fixes:
                lines.append(
                    f"{fix.issue.source_path.name}: "
                    f"{fix.issue.link_kind} [{fix.issue.raw_target}] -> {fix.description}"
                )
            changed: list[Path] = []
            if fixes:
                changed = apply_broken_link_fixes(config, fixes, dry_run=dry_run)
                report.changed_paths.extend(changed)
            if check:
                remaining = remaining_broken_links(
                    config,
                    file_filter=file_filter,
                    fixes=fixes if dry_run else None,
                )
                report.remaining_broken = len(remaining)
                report.ok = report.remaining_broken == 0
            if not apply:
                return report

        opportunities = find_link_opportunities(config, file_filter=file_filter)
        report.opportunities = len(opportunities)

        if apply:
            if opportunities:
                changed = apply_link_opportunities(config, opportunities, dry_run=dry_run)
                report.changed_paths.extend(changed)
            if check:
                remaining_opportunities = find_link_opportunities(config, file_filter=file_filter)
                report.ok = len(remaining_opportunities) == 0
            return report

        if not opportunities:
            report.ok = True
            return report

        for item in opportunities:
            suggestion = format_internal_link(item.target_route, item.matched_text, config.link.style)
            target = f"{item.target_route} ({item.target_title})" if verbose else suggestion
            lines.append(
                f"{item.source_file}:{item.line}:{item.column}: "
                f'"{item.matched_text}" -> {target}'
            )
        report.ok = not check
        return report

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

        runtime_config = _resolve_runtime_config(
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
        from .init_scaffold import _scaffold_wiki

        return _scaffold_wiki(Path(target_dir), options, init_git=git)
