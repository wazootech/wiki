"""Click CLI entrypoint defining subcommands and option handling."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import click

from . import upgrade as upgrade_module
from .cli_output import exit_audit_report, print_check_messages
from .errors import BuildError, UpgradeError
from .export_ops import export_documents
from .fmt_ops import format_files
from .format import run_query
from .format_choice import FormatChoice
from .graph import graph_stats
from .init_scaffold import parse_github_repo, resolve_init_options, scaffold_workspace
from .jqfilter import resolve_path
from .link_ops import LinkOptions, run_link
from .publish import build_workspace
from .render_ops import render_workspace
from .runtime import resolve_runtime_config
from .schemas import BuildOptions
from .upgrade import PACKAGE_NAME, check_version, perform_upgrade
from .workspace import Workspace

FILE_COMMANDS = ("check", "lint", "link", "render", "export", "fmt")


def optional_files_argument(f):
    """Decorator: zero or more FILE positionals (``nargs=-1``).

    Handlers receive ``files: tuple[Path, ...]``. Omit FILE for whole-wiki mode.
    """
    return click.argument(
        "files",
        nargs=-1,
        required=False,
        type=click.Path(exists=True, path_type=Path),
    )(f)


@click.group()
@click.option(
    "--wiki-inputs",
    "wiki_inputs",
    multiple=True,
    default=None,
    help="Override wiki.inputs from wiki.yml (.md, .yaml, .json; repeatable).",
)
@click.option(
    "-c",
    "--config",
    "config_path",
    default=".",
    help="Path to wiki.yml or directory containing wiki.yml/wiki.yaml/wiki.json (default: current directory).",
)
@click.pass_context
def main(ctx: click.Context, wiki_inputs: tuple[str, ...] | None, config_path: str) -> None:
    """Query, validate, and manage your semantic LLM wiki."""
    try:
        workspace = Workspace.load(
            config_path,
            wiki_inputs=list(wiki_inputs) if wiki_inputs else None,
        )
    except ValueError as exc:
        raise click.ClickException(str(exc)) from exc
    ctx.obj = workspace


@main.command()
@optional_files_argument
@click.option("-v", "--verbose", is_flag=True, help="Show integrity audit warnings.")
@click.option("--strict", is_flag=True, help="Elevate all warnings to errors and exit with code 1.")
@click.pass_obj
def check(workspace: Workspace, files: tuple[Path, ...], verbose: bool, strict: bool) -> None:
    """Integrity checks: SHACL, JSON Schema, routes, collisions, layout (FILE...: SHACL + JSON Schema)."""
    try:
        report = workspace.check(list(files) if files else None)
    except ValueError as exc:
        raise click.ClickException(str(exc)) from exc
    exit_audit_report(report, verbose=verbose, strict=strict)


@main.command()
@optional_files_argument
@click.option("-v", "--verbose", is_flag=True, help="Show convention audit warnings.")
@click.option("--strict", is_flag=True, help="Elevate all warnings to errors and exit with code 1.")
@click.pass_obj
def lint(workspace: Workspace, files: tuple[Path, ...], verbose: bool, strict: bool) -> None:
    """Convention audits: links, filenames, headings, and link style."""
    try:
        report = workspace.lint(list(files) if files else None)
    except ValueError as exc:
        raise click.ClickException(str(exc)) from exc
    exit_audit_report(report, verbose=verbose, strict=strict)


@main.command()
@optional_files_argument
@click.option("--apply", is_flag=True, help="Insert suggested internal links (format from link.style in wiki.yml).")
@click.option("--fix-broken", is_flag=True, help="Repair unambiguous broken internal links.")
@click.option("-n", "--dry-run", is_flag=True, help="Preview apply/fix changes without writing files.")
@click.option("-c", "--check", is_flag=True, help="Exit 1 if link opportunities or broken links remain.")
@click.option("-v", "--verbose", is_flag=True, help="Show target titles in suggestions; list changed files when applying.")
@click.pass_obj
def link(
    workspace: Workspace,
    files: tuple[Path, ...],
    apply: bool,
    fix_broken: bool,
    dry_run: bool,
    check: bool,
    verbose: bool,
) -> None:
    """Suggest or repair internal links for wiki pages."""
    try:
        options = LinkOptions(
            apply=apply,
            fix_broken=fix_broken,
            dry_run=dry_run,
            check=check,
            verbose=verbose,
        )
        report = run_link(workspace, list(files) if files else None, options)
    except ValueError as exc:
        raise click.ClickException(str(exc)) from exc

    for line in options.lines:
        click.echo(line)
    if fix_broken and report.fixes and verbose:
        prefix = "would fix" if dry_run else "fixed"
        for changed_path in report.changed_paths:
            click.echo(f"{prefix} {changed_path}")
    elif apply and report.changed_paths and (verbose or dry_run):
        prefix = "would update" if dry_run else "updated"
        for changed_path in report.changed_paths:
            click.echo(f"{prefix} {changed_path}")

    if check and not report.ok:
        sys.exit(1)
    if fix_broken and not apply:
        sys.exit(0)
    if apply:
        sys.exit(0)
    if report.opportunities == 0:
        sys.exit(0)
    sys.exit(1 if check else 0)


@main.command()
@click.argument("query_args", nargs=-1, required=False)
@click.option(
    "-f",
    "--format",
    "output_format",
    type=FormatChoice(
        ["table", "json", "csv", "tsv", "turtle", "n3", "markdown"],
        case_sensitive=False,
    ),
    default="table",
    show_default=True,
    help="Output format for query results.",
)
@click.option("-o", "--output", type=click.Path(path_type=Path), help="Write output to specified file.")
@click.option("--no-inference", is_flag=True, help="Skip OWL-RL inference.")
@click.option("--reload", is_flag=True, help="Rebuild the in-memory graph from wiki sources.")
@click.option(
    "--cache",
    "disk_cache",
    is_flag=True,
    help="Persist the graph under .wiki/cache for faster reuse across new CLI processes.",
)
@click.option("--jq", default=None, help="Extract values from JSON output using a key-path filter (implies -f json).")
@click.option(
    "--pretty",
    is_flag=True,
    help="Rich table for SELECT results (stdout only; not with -o or --jq).",
)
@click.option("-v", "--verbose", is_flag=True, help="Print graph statistics before query results.")
@click.pass_obj
def query(
    workspace: Workspace,
    query_args: tuple[str, ...],
    output_format: str,
    output: Path | None,
    no_inference: bool,
    reload: bool,
    disk_cache: bool,
    jq: str | None,
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

    config = workspace.config
    graph = workspace.graph(infer=not no_inference, reload=reload, disk_cache=disk_cache)

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
            base_iri=config.base_iri,
            pretty=pretty,
        )
        if output:
            output.write_text(result, encoding="utf-8")
            click.echo(f"Written results to {output}")
        elif jq is not None:
            matches = resolve_path(json.loads(result), jq)
            for match in matches:
                click.echo(match)
        else:
            click.echo(result)
    except (ValueError, SyntaxError, TypeError, RuntimeError) as exc:
        click.echo(f"Query Execution Error: {exc}", err=True)
        sys.exit(1)


@main.command()
@optional_files_argument
@click.option("--no-inference", is_flag=True, help="Skip OWL-RL inference.")
@click.option("--reload", is_flag=True, help="Rebuild the in-memory graph from wiki sources before rendering.")
@click.option(
    "--cache",
    "disk_cache",
    is_flag=True,
    help="Persist the graph under .wiki/cache for faster reuse across new CLI processes.",
)
@click.option(
    "--check",
    is_flag=True,
    help="Check if inline SPARQL blocks are up to date without modifying files. Exits with non-zero code if any are stale.",
)
@click.option("-v", "--verbose", is_flag=True, help="Print summary of updated files.")
@click.pass_obj
def render(
    workspace: Workspace,
    files: tuple[Path, ...],
    no_inference: bool,
    reload: bool,
    disk_cache: bool,
    check: bool,
    verbose: bool,
) -> None:
    """Render inline SPARQL blocks in markdown files."""
    try:
        report = render_workspace(
            workspace,
            list(files) if files else None,
            check_only=check,
            reload=reload,
            disk_cache=disk_cache,
            no_inference=no_inference,
        )
    except ValueError as exc:
        raise click.ClickException(str(exc)) from exc

    for error in report.render_errors:
        click.echo(error, err=True)

    if check:
        if report.stale_files:
            click.echo("Error: Inline SPARQL blocks are out of date in the following files:", err=True)
            for stale in report.stale_files:
                click.echo(f"  - {stale}", err=True)
            sys.exit(1)
        if verbose:
            click.echo("All dynamic SPARQL blocks are fully up to date.")
        return

    if verbose:
        parts = [f"Updated {report.updated_count} files"]
        if report.error_count:
            parts.append(f"{report.error_count} errors")
        click.echo(f"Rendered SPARQL: {', '.join(parts)}.")


@main.command()
@click.option(
    "--output-dir",
    default="_site",
    show_default=True,
    type=click.Path(path_type=Path),
    help="Directory to write site files.",
)
@click.option(
    "--site-base-url",
    "site_base_url",
    default=None,
    help="Override site.base_url. Empty string for root-level URLs.",
)
@click.option(
    "--site-url-style",
    "site_url_style",
    type=click.Choice(["file", "dir"]),
    default=None,
    help="Override site.url_style: <slug>.html (file) or <slug>/index.html (dir).",
)
@click.option("--render", is_flag=True, help="Render inline SPARQL blocks before building.")
@click.option("--reload", is_flag=True, help="Rebuild graph before --render (no effect without --render).")
@click.option("--cache", "disk_cache", is_flag=True, help="Persist graph under .wiki/cache when using --render.")
@click.option("--no-check", is_flag=True, help="Skip lint and check preflight before building.")
@click.option("-v", "--verbose", is_flag=True, help="Print generated file paths.")
@click.pass_obj
def build(
    workspace: Workspace,
    output_dir: Path,
    site_base_url: str | None,
    site_url_style: str | None,
    render: bool,
    reload: bool,
    disk_cache: bool,
    no_check: bool,
    verbose: bool,
) -> None:
    """Build static HTML site from wiki documents."""
    runtime = workspace.with_runtime(base_url=site_base_url, url_style=site_url_style)
    options = BuildOptions(
        output_dir=output_dir,
        render_first=render,
        reload_graph=reload,
        disk_cache=disk_cache,
        skip_preflight=no_check,
        verbose=verbose,
    )
    try:
        result = build_workspace(runtime, options)
    except BuildError as exc:
        click.echo(f"Error: {exc}", err=True)
        sys.exit(1)

    if render and verbose and options.render_first and result.ok:
        click.echo("Rendered SPARQL dynamic blocks before build.")

    if not result.ok:
        if result.error_message:
            click.echo(f"Error: {result.error_message}", err=True)
            sys.exit(1)
        if result.preflight is not None:
            errors, warnings = result.preflight.messages()
            print_check_messages(errors, warnings, verbose)
            sys.exit(1)

    if verbose:
        for rel_path in result.written_paths:
            click.echo(f"  {rel_path}")
        click.echo(
            f"\nBuilt {result.page_count} pages and {result.asset_count} assets to {output_dir}"
        )


@main.command()
@optional_files_argument
@click.option("-o", "--output", type=click.Path(path_type=Path), help="File to write serialized RDF output.")
@click.option(
    "-f",
    "--format",
    "rdf_format",
    type=FormatChoice(
        ["dict", "json-ld", "turtle", "xml", "n3", "nt", "trig", "nquads"],
        case_sensitive=False,
    ),
    default="dict",
    show_default=True,
    help="Output format for RDF export.",
)
@click.option(
    "--mode",
    type=click.Choice(["expanded", "compacted"], case_sensitive=False),
    default="expanded",
    show_default=True,
    help="Serialization mode for formats that support compaction.",
)
@click.pass_obj
def export(
    workspace: Workspace,
    files: tuple[Path, ...],
    output: Path | None,
    rdf_format: str,
    mode: str,
) -> None:
    """Export document frontmatter as RDF or JSON-LD."""
    try:
        result = export_documents(
            workspace,
            list(files) if files else None,
            rdf_format=rdf_format,
            mode=mode,
        )
    except ValueError as exc:
        raise click.ClickException(str(exc)) from exc

    if not result.ok:
        click.echo(f"Error: {result.error_message}", err=True)
        sys.exit(1)

    _raw_formats = {"turtle", "xml", "n3", "nt", "trig", "nquads"}
    if output:
        output.write_text(result.output, encoding="utf-8")
        if rdf_format in _raw_formats and (not files or len(files) == 1):
            click.echo(f"Written {rdf_format} output to {output}")
        else:
            desc = "payload array" if files and len(files) != 1 else "payload"
            click.echo(f"Written {desc} to {output}")
    else:
        click.echo(result.output)


@main.command()
@click.option("--host", default="127.0.0.1", show_default=True, help="Host to bind the server to.")
@click.option("--port", default=8080, type=int, show_default=True, help="Port to serve on.")
@click.option(
    "--site-base-url",
    "site_base_url",
    default=None,
    help="Override site.base_url. Empty string for root-level URLs.",
)
@click.option(
    "--site-url-style",
    "site_url_style",
    default=None,
    type=click.Choice(["file", "dir"]),
    help="Override site.url_style: <slug>.html (file) or <slug>/ (dir).",
)
@click.option(
    "--watch",
    is_flag=True,
    help="Watch wiki; rebuild graph, SPARQL blocks, site, and reload browser.",
)
@click.pass_obj
def serve(
    workspace: Workspace,
    host: str,
    port: int,
    site_base_url: str | None,
    site_url_style: str | None,
    watch: bool,
) -> None:
    """Start a local HTTP server for browsing the wiki."""
    from .serve import run_server

    runtime_config = resolve_runtime_config(
        workspace.config,
        base_url=site_base_url,
        url_style=site_url_style,
    )
    run_server(runtime_config, host=host, port=port, watch=watch)


@main.command()
@click.option("--git", "init_git", is_flag=True, help="Run git init after scaffolding the workspace.")
@click.option(
    "--repo",
    default=None,
    help="GitHub owner/repo; infer graph.context.wiki and site.base_url for GitHub Pages.",
)
@click.option(
    "--graph-context-wiki",
    "graph_context_wiki",
    default=None,
    help="Override graph.context.wiki (overrides --repo inference).",
)
@click.option(
    "--site-base-url",
    "site_base_url",
    default=None,
    help="Override site.base_url (default /wiki or inferred from --repo).",
)
@click.option(
    "--site-url-style",
    "site_url_style",
    type=click.Choice(["file", "dir"]),
    default=None,
    help="Override site.url_style.",
)
@click.option(
    "--graph-content-predicate",
    "graph_content_predicate",
    default=None,
    help="Override graph.content_predicate.",
)
@click.option(
    "--link-style",
    "link_style",
    type=click.Choice(["standard", "wikilink"]),
    default=None,
    help="Override link.style.",
)
@click.option(
    "--wiki-inputs",
    "wiki_inputs",
    multiple=True,
    default=None,
    help="Override wiki.inputs (repeatable).",
)
@click.option("--graph-base-iri", "graph_base_iri", default=None, help="Override graph.base_iri.")
@click.option(
    "--graph-implicit-types",
    "graph_implicit_types",
    type=str,
    multiple=True,
    help="Default types applied to untyped documents.",
)
@click.option(
    "--graph-implicit-types-policy",
    "graph_implicit_types_policy",
    type=click.Choice(["fallback", "append"]),
    default=None,
    help="Strategy when applying graph.implicit_types.",
)
@click.option(
    "--graph-include-file-extension/--no-graph-include-file-extension",
    "graph_include_file_extension",
    default=None,
    help="Override graph.include_file_extension.",
)
def init(
    init_git: bool,
    repo: str | None,
    graph_context_wiki: str | None,
    site_base_url: str | None,
    site_url_style: str | None,
    graph_content_predicate: str | None,
    link_style: str | None,
    wiki_inputs: tuple[str, ...],
    graph_base_iri: str | None,
    graph_implicit_types: tuple[str, ...],
    graph_implicit_types_policy: str | None,
    graph_include_file_extension: bool | None,
) -> None:
    """Scaffold a new wiki workspace in the current directory."""
    cwd = Path.cwd()
    config_path = cwd / "wiki.yml"
    legacy_config_path = cwd / "wiki.yaml"
    readme_path = cwd / "README.md"
    wiki_dir = cwd / "wiki"

    if config_path.exists() or legacy_config_path.exists():
        click.echo(
            "Error: wiki.yml or wiki.yaml already exists. Use a new directory or remove the config file.",
            err=True,
        )
        sys.exit(1)
    if readme_path.exists():
        click.echo(
            "Error: README.md already exists. Use a new directory or remove README.md.",
            err=True,
        )
        sys.exit(1)
    if wiki_dir.exists() and any(wiki_dir.iterdir()):
        click.echo(
            "Error: wiki/ is not empty. Use a new directory or clear wiki/ before init.",
            err=True,
        )
        sys.exit(1)

    if repo is not None:
        try:
            parse_github_repo(repo)
        except ValueError as exc:
            click.echo(f"Error: {exc}", err=True)
            sys.exit(1)

    def prompt_context_wiki(default: str) -> str:
        return str(click.prompt("Custom wiki namespace IRI (graph.context.wiki)", default=default))

    init_options = resolve_init_options(
        repo=repo,
        graph_context_wiki=graph_context_wiki,
        site_base_url=site_base_url,
        site_url_style=site_url_style,
        graph_content_predicate=graph_content_predicate,
        link_style=link_style,
        cwd=cwd,
        init_git=init_git,
        prompt_context_wiki=prompt_context_wiki,
        wiki_inputs=list(wiki_inputs) if wiki_inputs else None,
        graph_base_iri=graph_base_iri,
        graph_implicit_types=list(graph_implicit_types) if graph_implicit_types else None,
        graph_implicit_types_policy=graph_implicit_types_policy,
        graph_include_file_extension=graph_include_file_extension,
    )

    result = scaffold_workspace(cwd, init_options, init_git=init_git)
    if not result.ok:
        click.echo(f"Error: {result.error_message}", err=True)
        sys.exit(1)
    click.echo(result.message)


@main.command()
@optional_files_argument
@click.option(
    "--check",
    is_flag=True,
    help="Check formatting without writing files back. Exits with code 1 if any files would change.",
)
@click.option("-v", "--verbose", is_flag=True, help="Print fmt config source and formatted file names.")
@click.pass_obj
def fmt(workspace: Workspace, files: tuple[Path, ...], check: bool, verbose: bool) -> None:
    """Format markdown wiki pages using mdformat."""
    from .fmt_util import describe_fmt_source

    try:
        if verbose and files:
            click.echo(f"Using {describe_fmt_source(files[0], workspace.config)}.")
        elif verbose and not files:
            from .paths import iter_markdown_files

            markdown_files = iter_markdown_files(workspace.config)
            if markdown_files:
                click.echo(f"Using {describe_fmt_source(markdown_files[0], workspace.config)}.")

        report = format_files(
            workspace,
            list(files) if files else None,
            check_only=check,
            verbose=verbose,
        )
    except ValueError as exc:
        raise click.ClickException(str(exc)) from exc

    for line in report.verbose_lines:
        click.echo(line)

    if check:
        if report.stale_files:
            click.echo("Error: The following files are not correctly formatted:", err=True)
            for stale in report.stale_files:
                click.echo(f"  - {stale.name}", err=True)
            sys.exit(1)
        if verbose:
            click.echo("All files are correctly formatted.")
        return

    if not report.ok:
        click.echo(report.error_message, err=True)
        sys.exit(1)

    if report.formatted_count > 0:
        click.echo(f"Format complete. Reformatted {report.formatted_count} files.")


@main.command()
@click.option("-c", "--check", "check_only", is_flag=True, help="Check for updates without upgrading.")
@click.option("-y", "--yes", "auto_yes", is_flag=True, help="Skip confirmation prompt and upgrade immediately.")
@click.option("-v", "--verbose", is_flag=True, help="Show pip install output.")
def upgrade(check_only: bool, auto_yes: bool, verbose: bool) -> None:
    """Check for updates and upgrade the wiki CLI."""
    current, latest, is_outdated = check_version()
    path_warning = upgrade_module.get_windows_path_mismatch_warning()

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
        if verbose:
            cmd = [sys.executable, "-m", "pip", "install", "--upgrade", PACKAGE_NAME]
            click.echo(f"Running: {' '.join(cmd)}")
        perform_upgrade(verbose=verbose)
        click.echo(f"Upgraded to {latest}.")
    except UpgradeError as exc:
        raise click.ClickException(str(exc)) from exc
    except subprocess.SubprocessError as exc:
        click.echo(f"Upgrade failed: {exc}", err=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
