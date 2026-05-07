"""Click CLI entrypoint defining subcommands and option handling."""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any, Optional
import click

from .context import WikiConfig as Context
from .frontmatter import normalize_all, normalize_frontmatter_str, frontmatter_from_path
from .rdf import load_graph, graph_stats
from .reasoning import apply_inference
from .validation import validate_all, validate_file, validate_summary, run_checks


def table_format(result: Any) -> str:
    """Format SPARQL SELECT results as a simple ASCII table."""
    rows = list(result)
    if not rows:
        return "(no results)"

    try:
        keys = [str(v) for v in result.vars]
    except Exception:
        keys = []

    if not keys and rows:
        first = rows[0]
        if isinstance(first, tuple):
            keys = [f"?v{i}" for i in range(len(first))]
        elif hasattr(first, "keys"):
            keys = list(first.keys())
        else:
            return str(rows)

    if not keys:
        return "(empty query)"

    col_widths = [len(str(k)) for k in keys]
    for row in rows:
        if isinstance(row, tuple):
            vals = [str(v) for v in row]
        else:
            vals = [str(row.get(k, "")) for k in keys]
        for i, val in enumerate(vals):
            if i < len(col_widths):
                col_widths[i] = max(col_widths[i], len(val))

    header = " | ".join(str(k).ljust(col_widths[i]) for i, k in enumerate(keys))
    sep = "-+-".join("-" * w for w in col_widths)
    lines = [header, sep]
    for row in rows:
        if isinstance(row, tuple):
            vals = [str(v) for v in row]
        else:
            vals = [str(row.get(k, "")) for k in keys]
        line = " | ".join(
            vals[i].ljust(col_widths[i]) if i < len(vals) else "" for i in range(len(keys))
        )
        lines.append(line)

    return "\n".join(lines)


def markdown_format(result: Any) -> str:
    """Format SPARQL SELECT results as a GitHub Flavored Markdown table."""
    rows = list(result)
    if not rows:
        return "(no results)"

    try:
        keys = [str(v) for v in result.vars]
    except Exception:
        keys = []

    if not keys and rows:
        first = rows[0]
        if isinstance(first, tuple):
            keys = [f"v{i}" for i in range(len(first))]
        elif hasattr(first, "keys"):
            keys = list(first.keys())
        else:
            return str(rows)

    if not keys:
        return "(empty query)"

    headers = [k.capitalize() for k in keys]
    header_line = "| " + " | ".join(headers) + " |"
    divider_line = "| " + " | ".join(["---"] * len(keys)) + " |"

    lines = [header_line, divider_line]
    for row in rows:
        if isinstance(row, tuple):
            vals = []
            for v in row:
                if v is None:
                    vals.append("")
                else:
                    s = str(v)
                    match = re.search(r"https://(?:book\.etok\.me|EthanThatOneKid\.github\.io/book)/wiki/([^/]+)\.md", s)
                    if match:
                        s = f"[[{match.group(1)}]]"
                    vals.append(s)
        else:
            vals = []
            for k in keys:
                v = row.get(k)
                if v is None:
                    vals.append("")
                else:
                    s = str(v)
                    match = re.search(r"https://(?:book\.etok\.me|EthanThatOneKid\.github\.io/book)/wiki/([^/]+)\.md", s)
                    if match:
                        s = f"[[{match.group(1)}]]"
                    vals.append(s)
        lines.append("| " + " | ".join(vals) + " |")

    return "\n".join(lines)


def run_query(graph: Any, query: str, output_format: str = "table") -> str:
    """Run a SPARQL SELECT or CONSTRUCT query against the graph, returning formatted output."""
    q = query.strip().upper()
    is_construct = q.startswith("CONSTRUCT") or q.startswith("DESCRIBE")

    if is_construct:
        result = graph.query(query)
        if output_format in ("turtle", "nt", "n3"):
            return result.serialize(format=output_format)
        return result.serialize(format="turtle")

    result = graph.query(query)

    if output_format == "json":
        return result.serialize(format="json").decode("utf-8")
    elif output_format == "csv":
        return result.serialize(format="csv").decode("utf-8")
    elif output_format == "tsv":
        return result.serialize(format="tsv").decode("utf-8")
    elif output_format in ("markdown", "md"):
        return markdown_format(result)
    else:
        return table_format(result)


# Matches the starting comment, query inside, and ending comment block with SPARQL inside
SPARQL_BLOCK_REGEX = re.compile(
    r"<!--\s*sparql:start\s*-->\s*```sparql\s*(.*?)\s*```\s*(.*?)\s*<!--\s*sparql:end\s*-->",
    re.DOTALL | re.IGNORECASE
)


def render_markdown_files(wiki_dir: Path, graph: Any) -> int:
    """Iterate over all markdown files, parse and replace dynamic SPARQL sections inline."""
    count = 0
    for md_file in wiki_dir.glob("*.md"):
        content = md_file.read_text(encoding="utf-8")
        modified = False

        def replacer(match: re.Match) -> str:
            nonlocal modified
            query = match.group(1).strip()
            try:
                rendered_markdown = run_query(graph, query, output_format="markdown")
                modified = True
                return f"<!-- sparql:start -->\n```sparql\n{query}\n```\n\n{rendered_markdown}\n<!-- sparql:end -->"
            except Exception as e:
                click.echo(f"Error rendering query in {md_file.name}: {e}", err=True)
                return str(match.group(0))

        new_content = SPARQL_BLOCK_REGEX.sub(replacer, content)
        if modified and new_content != content:
            md_file.write_text(new_content, encoding="utf-8")
            count += 1

    return count


@click.group()
@click.option("--wiki-dir", default=None, help="Directory containing wiki markdown files.")
@click.option("--shapes-dir", default=None, help="Directory containing SHACL shape files.")
@click.option("--reasoning-dir", default=None, help="Directory containing OWL/RDFS axioms.")
@click.option("--raw-dir", default=None, help="Directory containing raw markdown files.")
@click.pass_context
def main(ctx: click.Context, wiki_dir: Optional[str], shapes_dir: Optional[str], reasoning_dir: Optional[str], raw_dir: Optional[str]) -> None:
    """Query, validate, and manage your semantic LLM wiki."""
    config = Context.load()
    if wiki_dir:
        config.wiki_dir = Path(wiki_dir)
    if shapes_dir:
        config.shapes_dir = Path(shapes_dir)
    if reasoning_dir:
        config.reasoning_dir = Path(reasoning_dir)
    if raw_dir:
        config.raw_dir = Path(raw_dir)
    ctx.obj = config


@main.command()
@click.option("-v", "--verbose", is_flag=True, help="Show style/guideline warnings.")
@click.option("--strict", is_flag=True, help="Elevate all warnings to errors and exit with code 1.")
@click.pass_obj
def check(config: Context, verbose: bool, strict: bool) -> None:
    """Run unified checks: strict SHACL validation + style audits."""
    results = run_checks(config)

    conforms = results["conforms"]
    errors = results["errors"]
    warnings = results["warnings"]

    if strict and warnings:
        errors.extend(warnings)
        warnings = []
        conforms = False

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
@click.option("-v", "--verbose", is_flag=True, help="Print full validation report.")
@click.option("--summary", is_flag=True, help="Print per-file conformance summary.")
@click.option("--format", type=click.Choice(["text", "json"]), default="text", help="Output format.")
@click.option("--no-inference", is_flag=True, help="Skip loading reasoning axioms.")
@click.pass_obj
def validate(context: Context, file: Optional[Path], verbose: bool, summary: bool, format: str, no_inference: bool) -> None:
    """Validate wiki documents against SHACL shapes."""
    if file:
        result = validate_file(file, context, verbose=verbose)
        if result is None:
            click.echo("No frontmatter found in file.", err=True)
            sys.exit(1)
        conforms, text = result
        if format == "json":
            click.echo(json.dumps({"file": file.name, "conforms": conforms}))
        else:
            click.echo(f"[{'PASS' if conforms else 'FAIL'}] {file.name}")
            if verbose or not conforms:
                click.echo(text)
        sys.exit(0 if conforms else 1)

    if summary:
        results = validate_summary(context)
        if format == "json":
            click.echo(json.dumps(results, indent=2))
        else:
            total = len(results["conforms"]) + len(results["fails"]) + len(results["errors"])
            click.echo(f"Validated: {total} files")
            click.echo(f"Conforms:  {len(results['conforms'])}")
            click.echo(f"Fails:     {len(results['fails'])}")
            click.echo(f"Errors:    {len(results['errors'])}")
            if results["fails"]:
                click.echo("\nFailing files:")
                for name in results["fails"]:
                    click.echo(f"  - {name}")
            if results["errors"]:
                click.echo("\nError files:")
                for e in results["errors"]:
                    click.echo(f"  - {e['file']}: {e['reason']}")
        sys.exit(1 if results["fails"] or results["errors"] else 0)

    conforms, text = validate_all(context, verbose=verbose)
    if format == "json":
        click.echo(json.dumps({"conforms": conforms}))
    else:
        click.echo(f"[{'PASS' if conforms else 'FAIL'}] SHACL validation")
        if verbose or not conforms:
            click.echo(text)
    sys.exit(0 if conforms else 1)


@main.command()
@click.argument("query_args", nargs=-1, required=False)
@click.option("-f", "--format", "output_format", type=click.Choice(["table", "json", "csv", "tsv", "turtle", "n3", "markdown", "md"]), default="table")
@click.option("-o", "--output", type=click.Path(path_type=Path), help="Write output to specified file.")
@click.option("--no-inference", is_flag=True, help="Skip OWL-RL inference.")
@click.option("-v", "--verbose", is_flag=True, help="Print graph statistics before query results.")
@click.pass_obj
def query(context: Context, query_args: tuple[str, ...], output_format: str, output: Optional[Path], no_inference: bool, verbose: bool) -> None:
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
        result = run_query(graph, sparql_query, output_format=output_format)
        if output:
            output.write_text(result, encoding="utf-8")
            click.echo(f"Written results to {output}")
        else:
            click.echo(result)
    except Exception as e:
        click.echo(f"Query Execution Error: {e}", err=True)
        sys.exit(1)


@main.command()
@click.option("--no-inference", is_flag=True, help="Skip OWL-RL inference.")
@click.option("-v", "--verbose", is_flag=True, help="Print summary of updated files.")
@click.pass_obj
def render(context: Context, no_inference: bool, verbose: bool) -> None:
    """Render inline SPARQL blocks in markdown files."""
    graph = load_graph(context, infer=not no_inference)
    count = render_markdown_files(context.wiki_dir, graph)
    if verbose:
        click.echo(f"Successfully updated {count} markdown files with rendered SPARQL outputs.")



@main.group()
def frontmatter() -> None:
    """Utilities for normalizing and converting frontmatter."""
    pass


@frontmatter.command("normalize")
@click.argument("file", required=False, type=click.Path(exists=True, path_type=Path))
@click.option("--dry-run", is_flag=True, help="Print count of changes without writing them.")
@click.option("--standardize/--no-standardize", default=True, help="Standardize property key casing to camelCase.")
@click.option("-v", "--verbose", is_flag=True, help="Print summary of changes.")
@click.pass_obj
def normalize(context: Context, file: Optional[Path], dry_run: bool, standardize: bool, verbose: bool) -> None:
    """Normalize and format document frontmatter blocks."""
    if file:
        original = file.read_text(encoding="utf-8")
        normalized = normalize_frontmatter_str(original, standardize_keys=standardize)
        if normalized != original:
            if not dry_run:
                file.write_text(normalized, encoding="utf-8")
                if verbose:
                    click.echo(f"Normalized frontmatter in {file.name}")
            else:
                click.echo(f"[DRY-RUN] Would normalize frontmatter in {file.name}")
        else:
            if verbose:
                click.echo(f"Frontmatter in {file.name} is already normalized.")
        sys.exit(0)

    results = normalize_all(context.wiki_dir, standardize_keys=standardize, dry_run=dry_run)
    if dry_run:
        click.echo(f"[DRY-RUN] Would fix {results['fixed']} files, skipped {results['skipped']}")
    else:
        if verbose:
            click.echo(f"Normalized frontmatter in {results['fixed']} files, skipped {results['skipped']}")
    sys.exit(0)


@frontmatter.command("jsonld")
@click.argument("file", required=False, type=click.Path(exists=True, path_type=Path))
@click.option("-o", "--output", type=click.Path(path_type=Path), help="File to write canonical JSON-LD array.")
@click.pass_obj
def jsonld(context: Context, file: Optional[Path], output: Optional[Path]) -> None:
    """Convert parsed frontmatter blocks to canonical JSON-LD."""
    if file:
        data = frontmatter_from_path(file)
        if data is None:
            click.echo(f"No valid frontmatter block found in {file.name}", err=True)
            sys.exit(1)
        jsonld_str = json.dumps(data, indent=2)
        if output:
            output.write_text(jsonld_str, encoding="utf-8")
            click.echo(f"Written JSON-LD to {output}")
        else:
            click.echo(jsonld_str)
        sys.exit(0)

    converted_list = []
    if context.wiki_dir.exists():
        for md_file in sorted(context.wiki_dir.glob("*.md")):
            data = frontmatter_from_path(md_file)
            if data:
                converted_list.append({"file": md_file.name, "jsonld": data})

    output_str = json.dumps(converted_list, indent=2)
    if output:
        output.write_text(output_str, encoding="utf-8")
        click.echo(f"Compiled and written JSON-LD array to {output}")
    else:
        click.echo(output_str)


if __name__ == "__main__":
    main()
