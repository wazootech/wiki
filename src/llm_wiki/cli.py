"""Click CLI entrypoint defining subcommands and option handling."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Optional
import click

from .config import WikiConfig as Context
from .format import run_query, process_rdf_format
from .render import render_markdown_files
from .parser import normalize_all, normalize_frontmatter_str, frontmatter_from_path
from .graph import load_graph, graph_stats
from .audit import check_shacl_file, run_checks
from .jqfilter import resolve_path
from .format_choice import FormatChoice


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


@main.command()
@click.argument("file", required=False, type=click.Path(exists=True, path_type=Path))
@click.option("--normalize", is_flag=True, help="Normalize frontmatter key casing and formatting.")
@click.option("-v", "--verbose", is_flag=True, help="Show style/guideline warnings.")
@click.option("--strict", is_flag=True, help="Elevate all warnings to errors and exit with code 1.")
@click.pass_obj
def check(config: Context, file: Optional[Path], normalize: bool, verbose: bool, strict: bool) -> None:
    """Run unified checks: strict SHACL validation + style audits."""
    if normalize:
        if file:
            original = file.read_text(encoding="utf-8")
            normalized = normalize_frontmatter_str(original)
            if normalized != original:
                file.write_text(normalized, encoding="utf-8")
                if verbose:
                    click.echo(f"Normalized frontmatter in {file.name}")
        else:
            results = normalize_all(config.input_dirs)
            if verbose and results["fixed"] > 0:
                click.echo(f"Normalized frontmatter in {results['fixed']} files.")

    if file:
        res = check_shacl_file(file, config, verbose=verbose)
        conforms = True
        errors = []
        warnings = []

        if res is None:
            errors.append(f"No frontmatter found in {file.name}")
            conforms = False
        else:
            shacl_conforms, shacl_text = res
            if not shacl_conforms:
                conforms = False
                errors.append(f"SHACL Validation Violation in {file.name}:\n{shacl_text}")

        # Style audits specifically for this file (delegates to audit.py)
        from .audit import audit_filenames, audit_internal_links
        file_filter = {file.stem}
        warnings.extend(audit_filenames(config, file_filter=file_filter))
        warnings.extend(audit_internal_links(config, file_filter=file_filter))

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
@click.option("--jq", default=None, help="Extract values from JSON output using a key-path filter (implies -f json).")
@click.option("-v", "--verbose", is_flag=True, help="Print graph statistics before query results.")
@click.pass_obj
def query(context: Context, query_args: tuple[str, ...], output_format: str, output: Optional[Path], no_inference: bool, jq: Optional[str], verbose: bool) -> None:
    """Run a SPARQL SELECT or CONSTRUCT query."""
    if query_args:
        sparql_query = " ".join(query_args)
    elif not sys.stdin.isatty():
        sparql_query = sys.stdin.read()
    else:
        click.echo("Error: No query provided.", err=True)
        sys.exit(1)

    graph = load_graph(context, infer=not no_inference)

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
@click.option("--no-inference", is_flag=True, help="Skip OWL-RL inference.")
@click.option("--check", is_flag=True, help="Check if inline SPARQL blocks are up to date without modifying files. Exits with non-zero code if any are stale.")
@click.option("-v", "--verbose", is_flag=True, help="Print summary of updated files.")
@click.pass_obj
def render(context: Context, no_inference: bool, check: bool, verbose: bool) -> None:
    """Render inline SPARQL blocks in markdown files."""
    graph = load_graph(context, infer=not no_inference)
    success_count, error_count, stale_files = render_markdown_files(context, graph, dry_run=check)
    
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
@click.option("--base-url", default="/wiki", show_default=True,
              help="URL prefix for wiki pages. Empty string for root-level URLs.")
@click.option("--url-style", type=click.Choice(["file", "dir"]), default="file", show_default=True,
              help="File naming: <slug>.html (file) or <slug>/index.html (dir).")
@click.option("--render", is_flag=True, help="Run SPARQL dynamic block rendering on markdown files before building.")
@click.option("-v", "--verbose", is_flag=True, help="Print generated file paths.")
@click.pass_obj
def build(config: Context, output_dir: Path, base_url: str, url_style: str, render: bool, verbose: bool) -> None:
    """Build static HTML site from wiki markdown files."""
    from .site import build_site, build_index_html, build_page_html

    if render:
        graph = load_graph(config, infer=True)
        success, errors, stale = render_markdown_files(config, graph)
        if verbose and success > 0:
            click.echo(f"Rendered SPARQL dynamic blocks in {success} files.")

    if not any(d.exists() for d in config.input_dirs):
        dirs_str = ", ".join(str(d) for d in config.input_dirs)
        click.echo(f"Error: none of the input directories exist ({dirs_str}).", err=True)
        sys.exit(1)

    base_url = base_url.rstrip("/")
    site = build_site(config.input_dirs, base_url=base_url, url_style=url_style)
    output_dir = output_dir.resolve()

    page_output_dir = output_dir / base_url.strip("/") if base_url else output_dir
    page_output_dir.mkdir(parents=True, exist_ok=True)

    if url_style == "dir":
        for old in page_output_dir.rglob("index.html"):
            old.unlink()
    else:
        for old in page_output_dir.glob("**/*.html"):
            old.unlink()
    for d in sorted(page_output_dir.glob("**/*"), key=lambda p: len(str(p)), reverse=True):
        if d.is_dir() and not any(d.iterdir()):
            d.rmdir()

    index_html = build_index_html(site, base_url=base_url, url_style=url_style)
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
                section_dir = page_output_dir / parts[0]
                section_dir.mkdir(exist_ok=True)
                file_path = section_dir / f"{parts[1]}.html"
        file_path.write_text(build_page_html(page, site, base_url=base_url, url_style=url_style), encoding="utf-8")
        if verbose:
            rel_path = file_path.relative_to(output_dir)
            click.echo(f"  {rel_path}")

    if verbose:
        click.echo(f"\nBuilt {len(site.pages)} pages to {output_dir}")


@main.command()
@click.argument("file", required=False, type=click.Path(exists=True, path_type=Path))
@click.option("-o", "--output", type=click.Path(path_type=Path), help="File to write serialized RDF output.")
@click.option("-f", "--format", "rdf_format", type=FormatChoice(["dict", "json-ld", "turtle", "xml", "n3", "nt", "trig", "nquads"], case_sensitive=False), default="dict", show_default=True, help="Output format for RDF export.")
@click.pass_obj
def export(context: Context, file: Optional[Path], output: Optional[Path], rdf_format: str) -> None:
    """Compile and export wiki documents in a supported RDF format."""
    result_payload: Any = None

    if file:
        data = frontmatter_from_path(file, content_predicate=context.content_predicate)
        if data is None:
            click.echo(f"No valid frontmatter block found in {file.name}", err=True)
            sys.exit(1)

        processed_rdf = process_rdf_format(data, file.stem, context, rdf_format)
        result_payload = {
            "name": file.name,
            "rdf": processed_rdf,
        }
    else:
        converted_list = []
        for input_dir in context.input_dirs:
            if input_dir.exists():
                for md_file in sorted(input_dir.glob("*.md")):
                    data = frontmatter_from_path(md_file, content_predicate=context.content_predicate)
                    if data:
                        processed_rdf = process_rdf_format(data, md_file.stem, context, rdf_format)
                        converted_list.append({
                            "name": md_file.name,
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
@click.option("--base-url", default="/wiki", show_default=True,
              help="URL prefix for wiki pages. Empty string for root-level URLs.")
@click.pass_obj
def serve(config: Context, host: str, port: int, base_url: str) -> None:
    """Start a local HTTP server for browsing the wiki."""
    from .serve import run_server
    run_server(config.input_dirs, host=host, port=port, base_url=base_url.rstrip("/"))


if __name__ == "__main__":
    main()
