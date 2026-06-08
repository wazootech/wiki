"""Click CLI entrypoint defining subcommands and option handling."""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any, Optional
import click

from .config import WikiConfig as Context
from .format import run_query, process_rdf_format
from .render import render_markdown_files
from .parser import document_data_from_path
from .graph import load_graph, graph_stats
from .audit import check_shacl_file, merge_results, run_check, run_lint
from .jqfilter import resolve_path
from .format_choice import FormatChoice
from .paths import (
    iter_document_files,
    iter_markdown_files,
    route_for_document_file,
    routes_from_markdown_files,
    select_document_paths,
    select_markdown_paths,
)

FILE_COMMANDS = ("check", "lint", "link", "render", "export", "fmt")


def optional_files_argument(f):
    """Decorator: zero or more FILE positionals (``nargs=-1``).

    Handlers receive ``files: tuple[Path, ...]``. Omit FILE for whole-vault mode.
    """
    return click.argument(
        "files",
        nargs=-1,
        required=False,
        type=click.Path(exists=True, path_type=Path),
    )(f)


@click.group()
@click.option("--input-dir", "cli_input_dirs", multiple=True, default=None, help="Override vault.inputs from wiki.yaml (.md, .yaml, .json; repeatable).")
@click.option("-c", "--config", "config_path", default=".", help="Path to wiki.yaml or directory containing wiki.yaml/wiki.yml/wiki.json (default: current directory).")
@click.pass_context
def main(ctx: click.Context, cli_input_dirs: tuple[str, ...] | None, config_path: str) -> None:
    """Query, validate, and manage your semantic LLM wiki."""
    try:
        config = Context.load(Path(config_path))
    except ValueError as exc:
        raise click.ClickException(str(exc)) from exc
    if cli_input_dirs:
        config.vault.inputs = [
            Path(d) if Path(d).is_absolute() else config.config_root / d
            for d in cli_input_dirs
        ]

    ctx.obj = config


def _exit_check_results(conforms: bool, errors: list[str], warnings: list[str], verbose: bool) -> None:
    """Print check results and exit with appropriate code."""
    if conforms and not errors:
        if verbose and warnings:
            click.echo("Warnings:", err=True)
            for w in warnings:
                click.echo(f"  - {w}", err=True)
        sys.exit(0)

    if errors:
        click.echo("Errors:", err=True)
        for e in errors:
            click.echo(f"  - {e}", err=True)

    if verbose and warnings:
        click.echo("Warnings:", err=True)
        for w in warnings:
            click.echo(f"  - {w}", err=True)

    sys.exit(1 if not conforms else 0)


def _print_check_messages(errors: list[str], warnings: list[str], verbose: bool) -> None:
    if errors:
        click.echo("Errors:", err=True)
        for e in errors:
            click.echo(f"  - {e}", err=True)
    if verbose and warnings:
        click.echo("Warnings:", err=True)
        for w in warnings:
            click.echo(f"  - {w}", err=True)


@main.command()
@optional_files_argument
@click.option("-v", "--verbose", is_flag=True, help="Show integrity audit warnings.")
@click.option("--strict", is_flag=True, help="Elevate all warnings to errors and exit with code 1.")
@click.pass_obj
def check(config: Context, files: tuple[Path, ...], verbose: bool, strict: bool) -> None:
    """Integrity checks: SHACL, routes, collisions, layout (FILE...: SHACL only)."""
    if files:
        conforms = True
        errors: list[str] = []
        warnings: list[str] = []

        for file in files:
            res = check_shacl_file(file, config, verbose=verbose)
            if res is None:
                errors.append(f"No valid document metadata found in {file.name}")
                conforms = False
            else:
                shacl_conforms, shacl_text = res
                if not shacl_conforms:
                    conforms = False
                    errors.append(f"SHACL Validation Violation in {file.name}:\n{shacl_text}")

        if strict and warnings:
            errors.extend(warnings)
            warnings = []
            conforms = False

        _exit_check_results(conforms, errors, warnings, verbose)

    results = run_check(config)

    conforms = results["conforms"]
    errors = results["errors"]
    warnings = results["warnings"]

    if strict and warnings:
        errors.extend(warnings)
        warnings = []
        conforms = False

    _exit_check_results(conforms, errors, warnings, verbose)


@main.command()
@optional_files_argument
@click.option("-v", "--verbose", is_flag=True, help="Show convention audit warnings.")
@click.option("--strict", is_flag=True, help="Elevate all warnings to errors and exit with code 1.")
@click.pass_obj
def lint(config: Context, files: tuple[Path, ...], verbose: bool, strict: bool) -> None:
    """Convention audits: links, filenames, headings, and link style."""
    file_filter = None
    if files:
        try:
            file_filter = routes_from_markdown_files(config, files)
        except ValueError as exc:
            raise click.ClickException(str(exc)) from exc

    results = run_lint(config, file_filter=file_filter)

    conforms = results["conforms"]
    errors = results["errors"]
    warnings = results["warnings"]

    if strict and warnings:
        errors.extend(warnings)
        warnings = []
        conforms = False

    _exit_check_results(conforms, errors, warnings, verbose)


@main.command()
@optional_files_argument
@click.option("--apply", is_flag=True, help="Insert suggested internal links (format from link.style in wiki.yaml).")
@click.option("--fix-broken", is_flag=True, help="Repair unambiguous broken internal links.")
@click.option("-n", "--dry-run", is_flag=True, help="Preview apply/fix changes without writing files.")
@click.option("-c", "--check", is_flag=True, help="Exit 1 if link opportunities or broken links remain.")
@click.option("-v", "--verbose", is_flag=True, help="Show target titles in suggestions; list changed files when applying.")
@click.pass_obj
def link(
    config: Context,
    files: tuple[Path, ...],
    apply: bool,
    fix_broken: bool,
    dry_run: bool,
    check: bool,
    verbose: bool,
) -> None:
    """Suggest or repair internal links for vault pages."""
    from .link_fix import apply_broken_link_fixes, find_broken_link_fixes, remaining_broken_links
    from .link_suggest import apply_link_opportunities, find_link_opportunities
    from .links import format_internal_link

    file_filter = None
    if files:
        try:
            file_filter = routes_from_markdown_files(config, files)
        except ValueError as exc:
            raise click.ClickException(str(exc)) from exc

    if fix_broken:
        fixes = find_broken_link_fixes(config, file_filter=file_filter)
        for fix in fixes:
            click.echo(
                f"{fix.issue.source_path.name}: "
                f"{fix.issue.link_kind} [{fix.issue.raw_target}] -> {fix.description}"
            )
        if fixes:
            changed = apply_broken_link_fixes(config, fixes, dry_run=dry_run)
            if verbose:
                prefix = "would fix" if dry_run else "fixed"
                for changed_path in changed:
                    click.echo(f"{prefix} {changed_path}")
        if check:
            remaining = remaining_broken_links(
                config,
                file_filter=file_filter,
                fixes=fixes if dry_run else None,
            )
            if remaining:
                sys.exit(1)
        if not apply:
            sys.exit(0)

    opportunities = find_link_opportunities(config, file_filter=file_filter)
    if apply:
        if opportunities:
            changed = apply_link_opportunities(config, opportunities, dry_run=dry_run)
            if verbose or dry_run:
                prefix = "would update" if dry_run else "updated"
                for changed_path in changed:
                    click.echo(f"{prefix} {changed_path}")
        if check and find_link_opportunities(config, file_filter=file_filter):
            sys.exit(1)
        sys.exit(0)

    if not opportunities:
        sys.exit(0)

    for item in opportunities:
        suggestion = format_internal_link(item.target_route, item.matched_text, config.link.style)
        target = f"{item.target_route} ({item.target_title})" if verbose else suggestion
        click.echo(
            f"{item.source_file}:{item.line}:{item.column}: "
            f'"{item.matched_text}" -> {target}'
        )
    sys.exit(1 if check else 0)


@main.command()
@click.argument("query_args", nargs=-1, required=False)
@click.option("-f", "--format", "output_format", type=FormatChoice(["table", "json", "csv", "tsv", "turtle", "n3", "markdown"], case_sensitive=False), default="table", show_default=True, help="Output format for query results.")
@click.option("-o", "--output", type=click.Path(path_type=Path), help="Write output to specified file.")
@click.option("--no-inference", is_flag=True, help="Skip OWL-RL inference.")
@click.option("--reload", is_flag=True, help="Rebuild the in-memory graph from vault sources.")
@click.option("--cache", "disk_cache", is_flag=True, help="Persist the graph under .wiki/cache for faster reuse across new CLI processes.")
@click.option("--jq", default=None, help="Extract values from JSON output using a key-path filter (implies -f json).")
@click.option("--pretty", is_flag=True, help="Rich table for SELECT results (stdout only; not with -o or --jq).")
@click.option("-v", "--verbose", is_flag=True, help="Print graph statistics before query results.")
@click.pass_obj
def query(
    context: Context,
    query_args: tuple[str, ...],
    output_format: str,
    output: Optional[Path],
    no_inference: bool,
    reload: bool,
    disk_cache: bool,
    jq: Optional[str],
    pretty: bool,
    verbose: bool,
) -> None:
    """Run SPARQL SELECT or CONSTRUCT (query argument or stdin)."""
    if query_args:
        sparql_query = " ".join(query_args)
    elif not sys.stdin.isatty():
        sparql_query = sys.stdin.read()
    else:
        click.echo("Error: No query provided.", err=True)
        sys.exit(1)

    if pretty:
        if output is not None:
            click.echo("Error: --pretty writes to stdout only; do not use -o/--output.", err=True)
            sys.exit(1)
        if jq is not None:
            click.echo("Error: --pretty is incompatible with --jq.", err=True)
            sys.exit(1)
        if output_format != "table":
            click.echo("Error: --pretty only supports table format (default -f table).", err=True)
            sys.exit(1)

    graph = load_graph(
        context,
        infer=not no_inference,
        reload=reload,
        disk_cache=disk_cache,
    )

    if verbose:
        stats = graph_stats(graph)
        click.echo(f"Graph stats: {stats['triples']} triples, {stats['subjects']} subjects\n")

    try:
        if jq is not None:
            output_format = "json"
        result = run_query(
            graph,
            sparql_query,
            output_format=output_format,
            wiki_base=context.wiki_base,
            pretty=pretty,
        )
        if output:
            output.write_text(result, encoding="utf-8")
            click.echo(f"Written results to {output}")
        elif jq is not None:
            matches = resolve_path(json.loads(result), jq)
            for m in matches:
                click.echo(m)
        else:
            click.echo(result)
    except (ValueError, SyntaxError, TypeError, RuntimeError) as e:
        click.echo(f"Query Execution Error: {e}", err=True)
        sys.exit(1)


@main.command()
@optional_files_argument
@click.option("--no-inference", is_flag=True, help="Skip OWL-RL inference.")
@click.option("--reload", is_flag=True, help="Rebuild the in-memory graph from vault sources before rendering.")
@click.option("--cache", "disk_cache", is_flag=True, help="Persist the graph under .wiki/cache for faster reuse across new CLI processes.")
@click.option("--check", is_flag=True, help="Check if inline SPARQL blocks are up to date without modifying files. Exits with non-zero code if any are stale.")
@click.option("-v", "--verbose", is_flag=True, help="Print summary of updated files.")
@click.pass_obj
def render(
    context: Context,
    files: tuple[Path, ...],
    no_inference: bool,
    reload: bool,
    disk_cache: bool,
    check: bool,
    verbose: bool,
) -> None:
    """Render inline SPARQL blocks in markdown files."""
    if files:
        try:
            select_markdown_paths(context, files)
        except ValueError as exc:
            raise click.ClickException(str(exc)) from exc

    graph = load_graph(
        context,
        infer=not no_inference,
        reload=reload,
        disk_cache=disk_cache,
    )
    success_count, error_count, stale_files = render_markdown_files(
        context,
        graph,
        dry_run=check,
        explicit_files=files,
    )
    if disk_cache and not check and success_count > 0:
        load_graph(
            context,
            infer=not no_inference,
            reload=True,
            disk_cache=True,
        )
    
    if check:
        if stale_files:
            click.echo("Error: Inline SPARQL blocks are out of date in the following files:", err=True)
            for f in stale_files:
                click.echo(f"  - {f}", err=True)
            sys.exit(1)
        if verbose:
            click.echo("All dynamic SPARQL blocks are fully up to date.")
        return

    if verbose:
        parts = [f"Updated {success_count} files"]
        if error_count:
            parts.append(f"{error_count} errors")
        click.echo(f"Rendered SPARQL: {', '.join(parts)}.")


@main.command()
@click.option("--output-dir", default="_site", show_default=True,
              type=click.Path(path_type=Path), help="Directory to write site files.")
@click.option("--base-url", default=None,
              help="URL prefix for wiki pages. Empty string for root-level URLs.")
@click.option("--url-style", type=click.Choice(["file", "dir"]), default=None,
              help="File naming: <slug>.html (file) or <slug>/index.html (dir).")
@click.option("--render", is_flag=True, help="Render inline SPARQL blocks before building.")
@click.option("--reload", is_flag=True, help="Rebuild graph before --render (no effect without --render).")
@click.option("--cache", "disk_cache", is_flag=True, help="Persist graph under .wiki/cache when using --render.")
@click.option("--no-check", is_flag=True, help="Skip lint and check preflight before building.")
@click.option("-v", "--verbose", is_flag=True, help="Print generated file paths.")
@click.pass_obj
def build(
    config: Context,
    output_dir: Path,
    base_url: str | None,
    url_style: str | None,
    render: bool,
    reload: bool,
    disk_cache: bool,
    no_check: bool,
    verbose: bool,
) -> None:
    """Build static HTML site from wiki documents."""
    from .assets import build_asset_manifest
    from .site import build_site, build_index_html, build_page_html

    if render:
        graph = load_graph(
            config,
            infer=True,
            reload=reload,
            disk_cache=disk_cache,
        )
        success, errors, stale = render_markdown_files(config, graph)
        if disk_cache and success > 0:
            load_graph(
                config,
                infer=True,
                reload=True,
                disk_cache=True,
            )
        if verbose and success > 0:
            click.echo(f"Rendered SPARQL dynamic blocks in {success} files.")

    if not any(d.exists() for d in config.vault.inputs):
        dirs_str = ", ".join(str(d) for d in config.vault.inputs)
        click.echo(f"Error: none of the input directories exist ({dirs_str}).", err=True)
        sys.exit(1)

    base_url = (config.site.base_url if base_url is None else base_url).rstrip("/")
    url_style = config.site.url_style if url_style is None else url_style
    config.site.base_url = base_url
    config.site.url_style = url_style

    if not no_check:
        lint_results = run_lint(config)
        check_results = run_check(config)
        results = merge_results(lint_results, check_results)
        _print_check_messages(results["errors"], results["warnings"], verbose)
        if results["errors"] or not results["conforms"]:
            sys.exit(1)

    site = build_site(config, base_url=base_url, url_style=url_style)
    output_dir = output_dir.resolve()

    # Load site wiki page layout if configured; silently fall back to default if file missing
    page_layout_str: str | None = None
    if config.page_layout is not None and config.page_layout.is_file():
        page_layout_str = config.page_layout.read_text(encoding="utf-8")

    page_output_dir = output_dir / base_url.strip("/") if base_url else output_dir
    from .assets import build_asset_manifest
    from .paths import build_page_manifest, detect_output_collisions

    manifest = build_page_manifest(config, page_output_dir, base_url, url_style) + build_asset_manifest(config, page_output_dir, base_url)
    collision_issues = detect_output_collisions(manifest)
    if collision_issues:
        _print_check_messages(collision_issues, [], verbose=True)
        sys.exit(1)

    if page_output_dir.exists():
        shutil.rmtree(page_output_dir)
    page_output_dir.mkdir(parents=True, exist_ok=True)

    has_root_index = any(page.full_slug == "" for page in site.pages)
    if not has_root_index:
        index_html = build_index_html(site, base_url=base_url, url_style=url_style, page_layout=page_layout_str)
        (page_output_dir / "index.html").write_text(index_html, encoding="utf-8")
        if verbose:
            rel = page_output_dir.relative_to(output_dir)
            click.echo(f"  {rel / 'index.html'}")

    for page in site.pages:
        if url_style == "dir":
            p = page_output_dir / page.full_slug
            p.mkdir(parents=True, exist_ok=True)
            file_path = p / "index.html"
        else:
            parts = page.full_slug.split("/")
            if len(parts) == 1:
                file_path = page_output_dir / f"{parts[0]}.html"
            else:
                section_dir = page_output_dir.joinpath(*parts[:-1])
                section_dir.mkdir(parents=True, exist_ok=True)
                file_path = section_dir / f"{parts[-1]}.html"
        file_path.write_text(build_page_html(page, site, base_url=base_url, url_style=url_style, page_layout=page_layout_str), encoding="utf-8")
        if verbose:
            rel_path = file_path.relative_to(output_dir)
            click.echo(f"  {rel_path}")

    asset_entries = build_asset_manifest(config, page_output_dir, base_url)
    for entry in asset_entries:
        entry.output_path.parent.mkdir(parents=True, exist_ok=True)
        if entry.source is not None:
            shutil.copy2(entry.source, entry.output_path)
        if verbose:
            rel_path = entry.output_path.relative_to(output_dir)
            click.echo(f"  {rel_path}")

    if verbose:
        click.echo(f"\nBuilt {len(site.pages)} pages and {len(asset_entries)} assets to {output_dir}")


@main.command()
@optional_files_argument
@click.option("-o", "--output", type=click.Path(path_type=Path), help="File to write serialized RDF output.")
@click.option("-f", "--format", "rdf_format", type=FormatChoice(["dict", "json-ld", "turtle", "xml", "n3", "nt", "trig", "nquads"], case_sensitive=False), default="dict", show_default=True, help="Output format for RDF export.")
@click.option("--mode", type=click.Choice(["expanded", "compacted"], case_sensitive=False), default="expanded", show_default=True, help="Serialization mode for formats that support compaction.")
@click.pass_obj
def export(context: Context, files: tuple[Path, ...], output: Optional[Path], rdf_format: str, mode: str) -> None:
    """Export document frontmatter as RDF or JSON-LD."""
    result_payload: Any = None
    _raw_formats = {"turtle", "xml", "n3", "nt", "trig", "nquads"}

    if files:
        if len(files) > 1 and rdf_format in _raw_formats:
            click.echo(
                "Error: raw RDF export formats require a single FILE or whole-vault export (omit FILE).",
                err=True,
            )
            sys.exit(1)
        try:
            selected = select_document_paths(context, files)
        except ValueError as exc:
            raise click.ClickException(str(exc)) from exc

        converted_list = []
        for file_path in selected:
            data = document_data_from_path(file_path, content_predicate=context.graph.content_predicate)
            if data is None:
                click.echo(f"No valid document metadata found in {file_path.name}", err=True)
                sys.exit(1)
            processed_rdf = process_rdf_format(
                data, route_for_document_file(context, file_path), context, rdf_format, mode=mode
            )
            converted_list.append({
                "name": file_path.name,
                "rdf": processed_rdf,
            })
        result_payload = converted_list[0] if len(converted_list) == 1 else converted_list
    else:
        converted_list = []
        for file_path in iter_document_files(context):
            data = document_data_from_path(file_path, content_predicate=context.graph.content_predicate)
            if data:
                processed_rdf = process_rdf_format(
                    data, route_for_document_file(context, file_path), context, rdf_format, mode=mode
                )
                converted_list.append({
                    "name": file_path.name,
                    "rdf": processed_rdf
                })
        result_payload = converted_list

    # Standard serialization formats (non-JSON wrappers) get raw RDF output
    if rdf_format in _raw_formats and not isinstance(result_payload, list):
        output_str = result_payload["rdf"] if isinstance(result_payload["rdf"], str) else json.dumps(result_payload["rdf"], indent=2, default=str)
        if output:
            output.write_text(output_str, encoding="utf-8")
            click.echo(f"Written {rdf_format} output to {output}")
        else:
            click.echo(output_str)
    else:
        output_str = json.dumps(result_payload, indent=2, default=str)
        if output:
            output.write_text(output_str, encoding="utf-8")
            desc = "payload array" if isinstance(result_payload, list) else "payload"
            click.echo(f"Written {desc} to {output}")
        else:
            click.echo(output_str)


@main.command()
@click.option("--host", default="127.0.0.1", show_default=True, help="Host to bind the server to.")
@click.option("--port", default=8080, type=int, show_default=True, help="Port to serve on.")
@click.option("--base-url", default=None,
              help="URL prefix for wiki pages. Empty string for root-level URLs.")
@click.option("--style", "url_style", default=None,
              type=click.Choice(["file", "dir"]), help="URL style: <slug>.html (file) or <slug>/ (dir). Defaults to url_style in config.")
@click.option("--watch", is_flag=True, help="Watch vault; rebuild graph, SPARQL blocks, site, and reload browser.")
@click.pass_obj
def serve(config: Context, host: str, port: int, base_url: str | None, url_style: str | None, watch: bool) -> None:
    """Start a local HTTP server for browsing the wiki."""
    from .serve import run_server
    resolved_base_url = (config.site.base_url if base_url is None else base_url).rstrip("/")
    resolved_url_style = config.site.url_style if url_style is None else url_style
    config.site.base_url = resolved_base_url
    config.site.url_style = resolved_url_style
    run_server(config, host=host, port=port, base_url=resolved_base_url, url_style=resolved_url_style, watch=watch)


@main.command()
@click.option("--force", is_flag=True, help="Overwrite wiki.yaml, README.md, wiki/, and layouts/default.html.")
@click.option("--git", "init_git", is_flag=True, help="Run git init after scaffolding the workspace.")
@click.option("--repo", default=None, help="GitHub owner/repo; infer wiki_base and base_url for GitHub Pages.")
@click.option("--wiki-base", default=None, help="Explicit wiki_base URI (overrides --repo inference).")
@click.option("--base-url", default=None, help="URL prefix for built/served pages (default /wiki or inferred from --repo).")
@click.option("--url-style", default=None, type=click.Choice(["file", "dir"]), help="URL style: dir or file.")
@click.option("--wazoo", default=None, help="context.wazoo namespace URI (default https://schema.wazoo.dev/).")
@click.option("--content-predicate", default=None, help="Optional content_predicate CURIE (e.g. schema:articleBody).")
@click.option("--link-style", default=None, type=click.Choice(["markdown", "wikilink"]), help="link.style in wiki.yaml (markdown or wikilink).")
def init(
    force: bool,
    init_git: bool,
    repo: str | None,
    wiki_base: str | None,
    base_url: str | None,
    url_style: str | None,
    wazoo: str | None,
    content_predicate: str | None,
    link_style: str | None,
) -> None:
    """Scaffold a new wiki workspace in the current directory."""
    import shutil
    import subprocess

    from .init_scaffold import (
        render_default_layout,
        render_wiki_yaml,
        resolve_init_options,
    )

    cwd = Path.cwd()
    config_path = cwd / "wiki.yaml"
    readme_path = cwd / "README.md"
    wiki_dir = cwd / "wiki"

    if not force:
        if config_path.exists():
            click.echo("Error: wiki.yaml already exists. Use --force to overwrite.", err=True)
            sys.exit(1)
        if readme_path.exists():
            click.echo("Error: README.md already exists. Use --force to overwrite.", err=True)
            sys.exit(1)
        if wiki_dir.exists() and any(wiki_dir.iterdir()):
            click.echo("Error: wiki/ is not empty. Use --force to overwrite.", err=True)
            sys.exit(1)

    if repo is not None:
        try:
            from .init_scaffold import parse_github_repo
            parse_github_repo(repo)
        except ValueError as exc:
            click.echo(f"Error: {exc}", err=True)
            sys.exit(1)

    def prompt_wiki_base(default: str) -> str:
        return str(click.prompt("Custom base URI prefix", default=default))

    init_options = resolve_init_options(
        repo=repo,
        wiki_base=wiki_base,
        base_url=base_url,
        url_style=url_style,
        wazoo=wazoo,
        content_predicate=content_predicate,
        link_style=link_style,
        cwd=cwd,
        init_git=init_git,
        prompt_wiki_base=prompt_wiki_base,
    )
    config_content = render_wiki_yaml(init_options)

    wiki_dir.mkdir(parents=True, exist_ok=True)
    readme_path.write_text(
        "# My Wiki\n\n"
        "A semantic markdown knowledge base powered by the Wiki CLI.\n\n"
        "## Workspace Layout\n\n"
        "- `wiki.yaml` — Workspace configuration, namespace prefixes, and `fmt` defaults.\n"
        "- `wiki/` — Contains markdown files with semantic frontmatter.\n"
        "  - `Person_Shape.md` — Validation shape for Person documents.\n"
        "  - `Ethan_Davidson.md` — An example Person document.\n\n"
        "## Commands\n\n"
        "- **Check** (integrity: SHACL, route safety, layout frontmatter):\n"
        "  ```bash\n"
        "  wiki check\n"
        "  ```\n"
        "- **Lint** (conventions: broken links, filename pattern, heading style):\n"
        "  ```bash\n"
        "  wiki lint\n"
        "  ```\n"
        "- **Preview** (starts a local dev server with auto-reload):\n"
        "  ```bash\n"
        "  wiki serve --watch\n"
        "  ```\n"
        "- **Build** (compiles to static HTML site):\n"
        "  ```bash\n"
        "  wiki build\n"
        "  ```\n",
        encoding="utf-8",
    )
    (wiki_dir / "Person_Shape.md").write_text(
        "---\n"
        "id: wiki:PersonShape\n"
        "type: sh:NodeShape\n"
        "sh:targetClass: schema:Person\n"
        "sh:property:\n"
        "  - sh:path: schema:givenName\n"
        "    sh:datatype: xsd:string\n"
        "    sh:minCount: 1\n"
        "  - sh:path: schema:familyName\n"
        "    sh:datatype: xsd:string\n"
        "    sh:minCount: 1\n"
        "---\n\n"
        "# Person shape\n\n"
        "Defines validation rules for Person profiles in this wiki.\n",
        encoding="utf-8",
    )
    seed_template = render_default_layout(init_options)

    (wiki_dir / "Ethan_Davidson.md").write_text(
        "---\n"
        "type: schema:Person\n"
        "givenName: Ethan\n"
        "familyName: Davidson\n"
        "---\n\n"
        "# Ethan Davidson\n\n"
        "Welcome to my personal wiki page! This page serves as a starting point and conforming example of a Person profile.\n",
        encoding="utf-8",
    )

    config_path.write_text(config_content, encoding="utf-8")

    layouts_dir = cwd / "layouts"
    default_layout_path = layouts_dir / "default.html"
    layouts_dir.mkdir(parents=True, exist_ok=True)
    if force or not default_layout_path.exists():
        default_layout_path.write_text(seed_template, encoding="utf-8")

    if init_git:
        if shutil.which("git") is None:
            click.echo("Error: git was requested with --git, but no git executable was found on PATH.", err=True)
            sys.exit(1)
        try:
            subprocess.run(["git", "init"], cwd=cwd, check=True, capture_output=True, text=True)
        except subprocess.CalledProcessError as exc:
            stderr = exc.stderr.strip() if exc.stderr else "unknown git init error"
            click.echo(f"Error: git init failed: {stderr}", err=True)
            sys.exit(1)

    message = "Initialized wiki.yaml, README.md, wiki/ starter files, and layouts/default.html."
    if init_git:
        message += " Ran git init."
    click.echo(message)


@main.command()
@optional_files_argument
@click.option("--check", is_flag=True, help="Check formatting without writing files back. Exits with code 1 if any files would change.")
@click.option("-v", "--verbose", is_flag=True, help="Print fmt config source and formatted file names.")
@click.pass_obj
def fmt(config: Context, files: tuple[Path, ...], check: bool, verbose: bool) -> None:
    """Format markdown vault pages using mdformat."""
    from .fmt_util import describe_fmt_source, format_markdown

    if files:
        try:
            target_files = select_markdown_paths(config, files)
        except ValueError as exc:
            raise click.ClickException(str(exc)) from exc
    else:
        target_files = iter_markdown_files(config)

    if verbose and target_files:
        click.echo(f"Using {describe_fmt_source(target_files[0], config)}.")

    stale_files = []
    success_count = 0

    for f in target_files:
        try:
            original = f.read_text(encoding="utf-8")
            formatted = format_markdown(original, f, config)
            if original != formatted:
                stale_files.append(f)
                if not check:
                    f.write_text(formatted, encoding="utf-8")
                    if verbose:
                        click.echo(f"Formatted {f.name}")
                    success_count += 1
            else:
                if verbose:
                    click.echo(f"Already formatted {f.name}")
        except Exception as e:
            click.echo(f"Error formatting {f.name}: {e}", err=True)
            sys.exit(1)

    if check:
        if stale_files:
            click.echo("Error: The following files are not correctly formatted:", err=True)
            for f in stale_files:
                click.echo(f"  - {f.name}", err=True)
            sys.exit(1)
        if verbose:
            click.echo("All files are correctly formatted.")
        return

    if verbose and not check:
        click.echo(f"Format complete. Reformatted {success_count} files.")


@main.command()
@click.option("-c", "--check", "check_only", is_flag=True, help="Check for updates without upgrading.")
@click.option("-y", "--yes", "auto_yes", is_flag=True, help="Skip confirmation prompt and upgrade immediately.")
@click.option("-v", "--verbose", is_flag=True, help="Show pip install output.")
def upgrade(check_only: bool, auto_yes: bool, verbose: bool) -> None:
    """Check for updates and upgrade the wiki CLI."""
    from .upgrade import check_version, get_windows_path_mismatch_warning, perform_upgrade

    current, latest, is_outdated = check_version()
    path_warning = get_windows_path_mismatch_warning()

    if current is None:
        click.echo("Error: cannot determine current version (package not found?).", err=True)
        sys.exit(1)

    if latest is None:
        click.echo("Error: cannot reach PyPI to check for updates.", err=True)
        sys.exit(1)

    if is_outdated:
        click.echo(f"Update available: {current} -> {latest}")
    else:
        click.echo(f"You're up to date ({current}).")

    if path_warning:
        click.echo(path_warning, err=True)

    if check_only:
        sys.exit(0 if not is_outdated else 1)

    if not is_outdated:
        return

    if not auto_yes:
        click.confirm("Upgrade now?", default=True, abort=True)

    try:
        perform_upgrade(verbose=verbose)
        click.echo(f"Upgraded to {latest}.")
    except subprocess.SubprocessError as e:  # type: ignore[name-defined]
        click.echo(f"Upgrade failed: {e}", err=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
