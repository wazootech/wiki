"""SPARQL result formatting, query execution, and RDF serialization helpers."""

from __future__ import annotations

import json
from typing import Any


def _wiki_link(s: str, wiki_base: str) -> str:
    """Convert a wiki URI to a [[slug]] wikilink if applicable."""
    if not (wiki_base and s.startswith(wiki_base)):
        return s
    slug = s[len(wiki_base):]
    if slug.endswith(".md"):
        slug = slug[:-3]
    if "/" not in slug:
        return f"[[{slug}]]"
    return s


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


def markdown_format(result: Any, wiki_base: str | None = None) -> str:
    """Format SPARQL SELECT results as a GitHub Flavored Markdown table, rendering wiki links when applicable."""
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
            vals = [_wiki_link(str(v), wiki_base) if v is not None else ""
                    for v in row]
        else:
            vals = [_wiki_link(str(row.get(k)), wiki_base) if row.get(k) is not None else ""
                    for k in keys]
        lines.append("| " + " | ".join(vals) + " |")

    return "\n".join(lines)


def run_query(graph: Any, query: str, output_format: str = "table", wiki_base: str | None = None) -> str:
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
        rows = list(result)
        if not rows:
            return "(no results)"
        keys = [str(v) for v in result.vars]
        lines = ["\t".join(keys)]
        for row in rows:
            vals = [str(row.get(k, "")) for k in keys]
            lines.append("\t".join(vals))
        return "\n".join(lines)
    elif output_format in ("markdown", "md"):
        return markdown_format(result, wiki_base=wiki_base)
    else:
        return table_format(result)


def process_rdf_format(data: dict[str, Any], file_stem: str, context: Any, output_format: str) -> Any:
    """Convert frontmatter dict to the requested RDF serialization format.

    Used by the export command to convert frontmatter dicts into various RDF formats.
    """
    if output_format == "dict":
        return data

    from .graph import frontmatter_to_graph

    graph = frontmatter_to_graph(data, context, file_id=file_stem)

    if output_format in ("json-ld", "jsonld"):
        serialized = graph.serialize(format="json-ld", indent=2)
        return json.loads(serialized)

    if output_format == "nquads":
        from rdflib import Dataset
        dataset = Dataset()
        default = dataset.default_graph
        for s, p, o in graph:
            default.add((s, p, o))
        return dataset.serialize(format="nquads")

    rdf_format = output_format
    return graph.serialize(format=rdf_format, indent=2)
