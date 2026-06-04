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
from .audit import check_shacl_file, run_checks
from .jqfilter import resolve_path
from .format_choice import FormatChoice
from .paths import iter_document_files


@click.group()
@click.option("--input-dir", "cli_input_dirs", multiple=True, default=None, help="Directory containing wiki markdown files or RDF data files (repeatable).")
@click.option("-c", "--config", "config_path", default=".", help="Path to wiki.yaml or directory containing wiki.yaml/wiki.yml/wiki.json (default: current directory).")
@click.pass_context
def main(ctx: click.Context, cli_input_dirs: tuple[str, ...] | None, config_path: str) -> None:
    """Query, validate, and manage your semantic LLM wiki."""
    config = Context.load(Path(config_path))
    if cli_input_dirs:
        config.input_dirs = [Path(d) for d in cli_input_dirs]

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
@click.argument("file", required=False, type=click.Path(exists=True, path_type=Path))
@click.option("-v", "--verbose", is_flag=True, help="Show style/guideline warnings.")
@click.option("--strict", is_flag=True, help="Elevate all warnings to errors and exit with code 1.")
@click.pass_obj
def check(config: Context, file: Optional[Path], verbose: bool, strict: bool) -> None:
    """Run unified checks: strict SHACL validation + style audits."""
    if file:
        res = check_shacl_file(file, config, verbose=verbose)
        conforms = True
        errors = []
        warnings = []

        if res is None:
            errors.append(f"No valid document metadata found in {file.name}")
            conforms = False
        else:
            shacl_conforms, shacl_text = res
            if not shacl_conforms:
                conforms = False
                errors.append(f"SHACL Validation Violation in {file.name}:\n{shacl_text}")

        # Style audits specifically for this file (delegates to audit.py)
        from .audit import (
            audit_broken_links,
            audit_filenames,
            audit_headings,
            file_slug_for_path,
        )
        try:
            file_filter = {file_slug_for_path(config, file)}
            warnings.extend(audit_filenames(config, file_filter=file_filter))
            warnings.extend(audit_broken_links(config, file_filter=file_filter))
            warnings.extend(audit_headings(config, file_filter=file_filter))
        except ValueError as exc:
            errors.append(str(exc))
            conforms = False

        if strict and warnings:
            errors.extend(warnings)
            warnings = []
            conforms = False

        _exit_check_results(conforms, errors, warnings, verbose)

    results = run_checks(config)

    conforms = results["conforms"]
    errors = results["errors"]
    warnings = results["warnings"]

    if strict and warnings:
        errors.extend(warnings)
        warnings = []
        conforms = False

    _exit_check_results(conforms, errors, warnings, verbose)


@main.command()
@click.argument("query_args", nargs=-1, required=False)
@click.option("-f", "--format", "output_format", type=FormatChoice(["table", "json", "csv", "tsv", "turtle", "n3", "markdown"], case_sensitive=False), default="table", show_default=True, help="Output format for query results.")
@click.option("-o", "--output", type=click.Path(path_type=Path), help="Write output to specified file.")
@click.option("--no-inference", is_flag=True, help="Skip OWL-RL inference.")
@click.option("--reload", is_flag=True, help="Rebuild the in-memory graph from vault sources.")
@click.option("--jq", default=None, help="Extract values from JSON output using a key-path filter (implies -f json).")
@click.option("-v", "--verbose", is_flag=True, help="Print graph statistics before query results.")
@click.pass_obj
def query(
    context: Context,
    query_args: tuple[str, ...],
    output_format: str,
    output: Optional[Path],
    no_inference: bool,
    reload: bool,
    jq: Optional[str],
    verbose: bool,
) -> None:
    """Run a SPARQL SELECT or CONSTRUCT query."""
    if query_args:
        sparql_query = " ".join(query_args)
    elif not sys.stdin.isatty():
        sparql_query = sys.stdin.read()
    else:
        click.echo("Error: No query provided.", err=True)
        sys.exit(1)

    graph = load_graph(
        context,
        infer=not no_inference,
        reload=reload,
    )

    if verbose:
        stats = graph_stats(graph)
        click.echo(f"Graph stats: {stats['triples']} triples, {stats['subjects']} subjects\n")

    try:
        if jq is not None:
            output_format = "json"
        result = run_query(graph, sparql_query, output_format=output_format, wiki_base=context.wiki_base)
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
@click.argument("file", required=False, type=click.Path(exists=True, path_type=Path))
@click.option("--glob", "glob_filters", multiple=True, help="Render only markdown files matching this glob. Repeatable.")
@click.option("--no-inference", is_flag=True, help="Skip OWL-RL inference.")
@click.option("--reload", is_flag=True, help="Rebuild the in-memory graph from vault sources before rendering.")
@click.option("--check", is_flag=True, help="Check if inline SPARQL blocks are up to date without modifying files. Exits with non-zero code if any are stale.")
@click.option("-v", "--verbose", is_flag=True, help="Print summary of updated files.")
@click.pass_obj
def render(
    context: Context,
    file: Optional[Path],
    glob_filters: tuple[str, ...],
    no_inference: bool,
    reload: bool,
    check: bool,
    verbose: bool,
) -> None:
    """Render inline SPARQL blocks in markdown files."""
    if file is not None and file.suffix.lower() != ".md":
        click.echo(f"Error: render only supports markdown files, got {file.name}.", err=True)
        sys.exit(1)

    graph = load_graph(
        context,
        infer=not no_inference,
        reload=reload,
    )
    success_count, error_count, stale_files = render_markdown_files(
        context,
        graph,
        dry_run=check,
        file_filter=file,
        glob_filters=glob_filters,
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
@click.argument("file", required=True, type=click.Path(exists=True, path_type=Path))
@click.pass_obj
def view(config: Context, file: Path) -> None:
    """Render a single wiki document as a terminal-friendly infobox view."""
    if file.suffix.lower() not in {".md", ".yaml", ".yml", ".json"}:
        click.echo(f"Error: view only supports wiki document files, got {file.name}.", err=True)
        sys.exit(1)

    from .view import render_document_view

    try:
        output = render_document_view(file, config, base_url=config.base_url, url_style=config.url_style)
    except ValueError as exc:
        click.echo(f"Error: {exc}", err=True)
        sys.exit(1)

    click.echo(output, nl=False)


@main.command()
@click.option("--output-dir", default="_site", show_default=True,
              type=click.Path(path_type=Path), help="Directory to write site files.")
@click.option("--base-url", default=None,
              help="URL prefix for wiki pages. Empty string for root-level URLs.")
@click.option("--url-style", type=click.Choice(["file", "dir"]), default=None,
              help="File naming: <slug>.html (file) or <slug>/index.html (dir).")
@click.option("--render", is_flag=True, help="Run SPARQL dynamic block rendering on markdown files before building.")
@click.option("--reload", is_flag=True, help="Rebuild the in-memory graph before rendering SPARQL blocks.")
@click.option("--no-check", is_flag=True, help="Skip configurable wiki checks before building.")
@click.option("-v", "--verbose", is_flag=True, help="Print generated file paths.")
@click.pass_obj
def build(
    config: Context,
    output_dir: Path,
    base_url: str | None,
    url_style: str | None,
    render: bool,
    reload: bool,
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
        )
        success, errors, stale = render_markdown_files(config, graph)
        if verbose and success > 0:
            click.echo(f"Rendered SPARQL dynamic blocks in {success} files.")

    if not any(d.exists() for d in config.input_dirs):
        dirs_str = ", ".join(str(d) for d in config.input_dirs)
        click.echo(f"Error: none of the input directories exist ({dirs_str}).", err=True)
        sys.exit(1)

    base_url = (config.base_url if base_url is None else base_url).rstrip("/")
    url_style = config.url_style if url_style is None else url_style
    config.base_url = base_url
    config.url_style = url_style

    if not no_check:
        results = run_checks(config)
        _print_check_messages(results["errors"], results["warnings"], verbose)
        if results["errors"] or not results["conforms"]:
            sys.exit(1)

    site = build_site(config, base_url=base_url, url_style=url_style)
    output_dir = output_dir.resolve()

    # Load custom HTML template if configured; silently fall back to default if file missing
    html_template_str: str | None = None
    if config.html_template is not None and config.html_template.is_file():
        html_template_str = config.html_template.read_text(encoding="utf-8")

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
        index_html = build_index_html(site, base_url=base_url, url_style=url_style, html_template=html_template_str)
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
        file_path.write_text(build_page_html(page, site, base_url=base_url, url_style=url_style, html_template=html_template_str), encoding="utf-8")
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
@click.argument("file", required=False, type=click.Path(exists=True, path_type=Path))
@click.option("-o", "--output", type=click.Path(path_type=Path), help="File to write serialized RDF output.")
@click.option("-f", "--format", "rdf_format", type=FormatChoice(["dict", "json-ld", "turtle", "xml", "n3", "nt", "trig", "nquads"], case_sensitive=False), default="dict", show_default=True, help="Output format for RDF export.")
@click.pass_obj
def export(context: Context, file: Optional[Path], output: Optional[Path], rdf_format: str) -> None:
    """Compile and export wiki documents in a supported RDF format."""
    result_payload: Any = None

    if file:
        data = document_data_from_path(file, content_predicate=context.content_predicate)
        if data is None:
            click.echo(f"No valid document metadata found in {file.name}", err=True)
            sys.exit(1)

        processed_rdf = process_rdf_format(data, file.stem, context, rdf_format)
        result_payload = {
            "name": file.name,
            "rdf": processed_rdf,
        }
    else:
        converted_list = []
        from .audit import file_slug_for_path
        for file_path in iter_document_files(context):
            data = document_data_from_path(file_path, content_predicate=context.content_predicate)
            if data:
                processed_rdf = process_rdf_format(data, file_slug_for_path(context, file_path), context, rdf_format)
                converted_list.append({
                    "name": file_path.name,
                    "rdf": processed_rdf
                })
        result_payload = converted_list

    # Standard serialization formats (non-JSON wrappers) get raw RDF output
    _raw_formats = {"turtle", "xml", "n3", "nt", "trig", "nquads"}
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
              type=click.Choice(["file", "dir"]), help="URL style: <slug>.html (file) or <slug>/ (dir). Defaults to urlStyle in config.")
@click.option("--watch", is_flag=True, help="Watch vault files; rebuild graph, SPARQL blocks, and site on change.")
@click.pass_obj
def serve(config: Context, host: str, port: int, base_url: str | None, url_style: str | None, watch: bool) -> None:
    """Start a local HTTP server for browsing the wiki."""
    from .serve import run_server
    resolved_base_url = (config.base_url if base_url is None else base_url).rstrip("/")
    resolved_url_style = config.url_style if url_style is None else url_style
    config.base_url = resolved_base_url
    config.url_style = resolved_url_style
    run_server(config, host=host, port=port, base_url=resolved_base_url, url_style=resolved_url_style, watch=watch)


@main.command()
@click.option("--force", is_flag=True, help="Overwrite existing scaffold files if present.")
def init(force: bool) -> None:
    """Interactively scaffold a new wiki workspace in the current directory."""
    import yaml

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

    wiki_base = click.prompt("Custom base URI prefix", default="https://wiki.example.org/")
    wiki_base = str(wiki_base).rstrip("/") + "/"

    context_map: dict[str, str] = {
        "schema": "https://schema.org/",
        "wiki": wiki_base,
        "foaf": "http://xmlns.com/foaf/0.1/",
        "dc": "http://purl.org/dc/elements/1.1/",
        "dcterms": "http://purl.org/dc/terms/",
        "sh": "http://www.w3.org/ns/shacl#",
        "xsd": "http://www.w3.org/2001/XMLSchema#",
    }

    cfg = {
        "inputDirs": ["wiki"],
        "wikiBase": wiki_base,
        "baseUrl": "/wiki",
        "urlStyle": "dir",
        "filenamePattern": "[A-Za-z0-9_()-]+",
        "check": {"filenamePattern": "warning", "brokenLinks": "warning"},
        "context": context_map,
        "html_template": "index.html",
    }

    wiki_dir.mkdir(parents=True, exist_ok=True)
    readme_path.write_text(
        "# My Wiki\n\n"
        "A semantic markdown knowledge base powered by the Wiki CLI.\n\n"
        "## Workspace Layout\n\n"
        "- `wiki.yaml` — Workspace configuration and namespace prefixes.\n"
        "- `wiki/` — Contains markdown files with semantic frontmatter.\n"
        "  - `Person_Shape.md` — Validation shape for Person documents.\n"
        "  - `Ethan_Davidson.md` — An example Person document.\n\n"
        "## Commands\n\n"
        "- **Check** (runs SHACL validation and hygiene checks):\n"
        "  ```bash\n"
        "  wiki check\n"
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

    config_path.write_text(yaml.safe_dump(cfg, sort_keys=False), encoding="utf-8")

    # Seed index.html HTML template from packaged resource
    index_html_path = cwd / "index.html"
    if not force and index_html_path.exists():
        click.echo("Warning: index.html already exists (not overwritten). Use --force to replace.", err=True)
    else:
        try:
            from importlib.resources import files as pkg_files
            seed_template = pkg_files("wiki").joinpath("templates/index.html").read_text(encoding="utf-8")
            index_html_path.write_text(seed_template, encoding="utf-8")
        except Exception as exc:
            click.echo(f"Warning: could not seed index.html template: {exc}", err=True)

    click.echo("Initialized wiki.yaml, README.md, wiki/ starter files, and index.html template.")


@main.command()
@click.argument("file", required=False, type=click.Path(exists=True, path_type=Path))
@click.option("--check", is_flag=True, help="Check formatting without writing files back. Exits with code 1 if any files would change.")
@click.option("-v", "--verbose", is_flag=True, help="Print names of formatted files.")
@click.pass_obj
def fmt(config: Context, file: Optional[Path], check: bool, verbose: bool) -> None:
    """Format markdown vault pages using mdformat."""
    import mdformat
    from .paths import iter_markdown_files

    if file:
        if file.suffix.lower() != ".md":
            click.echo(f"Error: fmt only supports markdown files, got {file.name}.", err=True)
            sys.exit(1)
        files = [file]
    else:
        files = iter_markdown_files(config)

    stale_files = []
    success_count = 0

    for f in files:
        try:
            original = f.read_text(encoding="utf-8")
            formatted = mdformat.text(original, extensions=["wikilink", "frontmatter", "gfm"])
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
    from .upgrade import check_version, perform_upgrade

    current, latest, is_outdated = check_version()

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
