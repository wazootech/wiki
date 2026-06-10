"""SPARQL result formatting, query execution, and RDF serialization helpers."""

from __future__ import annotations

import json
import re
from io import StringIO
from typing import Any

from rdflib import Graph
from rich import box
from rich.console import Console
from rich.table import Table

from .format_choice import FormatChoice
from .schemas.metadata import METADATA_VIEWS, MetadataView

# Pygments has no dedicated N3/TriG/N-Triples lexers; "nt" aliases to NestedTextLexer.
METADATA_PYGMENTS_LEXER_ALIASES: dict[str, str] = {
    "n3": "turtle",
    "trig": "turtle",
    "nt": "turtle",
}

_METADATA_VIEW_IDS = {view.id for view in METADATA_VIEWS}
_METADATA_FORMATS = {view.format for view in METADATA_VIEWS}
_FORMAT_ALIASES = FormatChoice.FORMAT_ALIASES


def _wiki_link(s: str, base_iri: str, known_slugs: set[str] | None = None) -> str:
    """Convert a wiki URI to a standard markdown link if applicable."""
    if not (base_iri and s.startswith(base_iri)):
        return s
    slug = s[len(base_iri):]
    if slug.endswith(".md"):
        slug = slug[:-3]
    if "/" not in slug:
        if known_slugs is not None and slug not in known_slugs:
            return s
        return f"[{slug}]({slug}.md)"
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


def _select_result_keys(result: Any, rows: list[Any]) -> list[str]:
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

    return keys


def _select_row_values(row: Any, keys: list[str]) -> list[str]:
    if isinstance(row, tuple):
        return [str(v) for v in row]
    return [str(row.get(k, "")) for k in keys]


def pretty_table_format(result: Any) -> str:
    """Format SPARQL SELECT results as a Rich ASCII table for terminal display."""
    rows = list(result)
    if not rows:
        return "(no results)"

    keys = _select_result_keys(result, rows)
    if not keys:
        return "(empty query)"

    buffer = StringIO()
    console = Console(file=buffer, force_terminal=False, color_system=None, width=100)
    table = Table(show_header=True, header_style="bold", box=box.ASCII, pad_edge=False)
    for key in keys:
        table.add_column(key)
    for row in rows:
        table.add_row(*_select_row_values(row, keys))
    console.print(table)
    return buffer.getvalue()


def markdown_format(result: Any, base_iri: str | None = None, known_slugs: set[str] | None = None) -> str:
    """Format SPARQL SELECT results as a GitHub Flavored Markdown table, rendering standard markdown links when applicable."""
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

    header_line = "| " + " | ".join(keys) + " |"
    divider_line = "| " + " | ".join(["---"] * len(keys)) + " |"

    lines = [header_line, divider_line]
    for row in rows:
        if isinstance(row, tuple):
            vals = [_wiki_link(str(v), base_iri, known_slugs) if v is not None else ""
                    for v in row]
        else:
            vals = [_wiki_link(str(row.get(k)), base_iri, known_slugs) if row.get(k) is not None else ""
                    for k in keys]
        lines.append("| " + " | ".join(vals) + " |")

    return "\n".join(lines)


def run_query(
    graph: Any,
    query: str,
    output_format: str = "table",
    base_iri: str | None = None,
    known_slugs: set[str] | None = None,
    *,
    pretty: bool = False,
) -> str:
    """Run a SPARQL SELECT or CONSTRUCT query against the graph, returning formatted output."""
    query_form = detect_query_form(query)
    is_construct = query_form in {"CONSTRUCT", "DESCRIBE"}

    if pretty and is_construct:
        raise ValueError("--pretty only supports SELECT queries (not CONSTRUCT or DESCRIBE).")

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
        return markdown_format(result, base_iri=base_iri, known_slugs=known_slugs)
    elif pretty:
        return pretty_table_format(result)
    else:
        return table_format(result)


_SPARQL_FORM_RE = re.compile(r"\b(SELECT|ASK|CONSTRUCT|DESCRIBE)\b", re.IGNORECASE)
_SPARQL_UPDATE_RE = re.compile(r"^(INSERT|DELETE|LOAD|CLEAR|CREATE|DROP|COPY|MOVE|ADD|WITH)\b", re.IGNORECASE)


def _strip_sparql_prelude(query: str) -> str:
    """Remove comments and PREFIX/BASE declarations before query-form detection."""
    text = re.sub(r"^[ \t]*(?:#.*)?$", "", query, flags=re.MULTILINE)
    text = re.sub(r"\bPREFIX\b\s+[^\n\r]+", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\bBASE\b\s+[^\n\r]+", "", text, flags=re.IGNORECASE)
    return text.lstrip()


def detect_query_form(query: str) -> str:
    """Return the SPARQL query form keyword from *query*."""
    text = _strip_sparql_prelude(query)
    match = _SPARQL_FORM_RE.search(text)
    if not match:
        raise ValueError("Could not determine SPARQL query form.")
    return match.group(1).upper()


def is_sparql_update(query: str) -> bool:
    """Return True when *query* looks like a SPARQL Update operation."""
    text = _strip_sparql_prelude(query)
    return _SPARQL_UPDATE_RE.search(text) is not None


def resolve_metadata_pygments_lexer(lexer: str) -> str:
    """Map metadata view lexer names to Pygments lexer aliases that exist."""
    return METADATA_PYGMENTS_LEXER_ALIASES.get(lexer, lexer)


def normalize_metadata_mode(mode: str | None) -> str:
    """Normalize the metadata/RDF display mode to a known value."""
    return "compacted" if str(mode).strip().lower() == "compacted" else "expanded"


def normalize_metadata_format(fmt: str | None) -> str:
    """Normalize a metadata RDF format name or alias to a canonical export format."""
    raw = str(fmt or "json-ld").strip()
    if not raw:
        return "json-ld"
    lookup = raw.casefold()
    canonical = _FORMAT_ALIASES.get(lookup, raw.casefold())
    if canonical in _METADATA_FORMATS:
        return canonical
    if lookup in _METADATA_FORMATS:
        return lookup
    return "json-ld"


def resolve_metadata_view(fmt: str | None, mode: str | None) -> str:
    """Map format + mode query params to a metadata view id."""
    normalized_format = normalize_metadata_format(fmt)
    if normalized_format == "json-ld":
        return "json-ld-compacted"
    for view in METADATA_VIEWS:
        if view.format == normalized_format:
            return view.id
    return "json-ld-compacted"


_JSONLD_CONTEXT_SPECIAL_KEYS = frozenset({"@vocab", "@base", "@language", "@version", "@protected"})
_JSONLD_QNAME_PREFIX_RE = re.compile(r"^([A-Za-z_][\w.-]*):([^:]+)$")


def _collect_jsonld_prefixes(value: Any, prefixes: set[str]) -> None:
    """Collect CURIE prefixes used in a compacted JSON-LD value tree."""
    if isinstance(value, dict):
        for key, item in value.items():
            if key == "@context":
                continue
            match = _JSONLD_QNAME_PREFIX_RE.match(key)
            if match:
                prefixes.add(match.group(1))
            _collect_jsonld_prefixes(item, prefixes)
    elif isinstance(value, list):
        for item in value:
            _collect_jsonld_prefixes(item, prefixes)
    elif isinstance(value, str):
        match = _JSONLD_QNAME_PREFIX_RE.match(value)
        if match:
            prefixes.add(match.group(1))


def _prune_jsonld_context(document: dict[str, Any]) -> dict[str, Any]:
    """Drop unused namespace bindings from a compacted JSON-LD @context."""
    context = document.get("@context")
    if not isinstance(context, dict):
        return document

    used_prefixes: set[str] = set()
    for key, value in document.items():
        if key == "@context":
            continue
        _collect_jsonld_prefixes({key: value}, used_prefixes)

    pruned_context = {
        prefix: uri
        for prefix, uri in context.items()
        if prefix in used_prefixes or prefix in _JSONLD_CONTEXT_SPECIAL_KEYS
    }
    if pruned_context == context:
        return document
    return {**document, "@context": pruned_context}


def serialize_rdf_graph(graph: Graph, output_format: str, mode: str = "expanded", context: Any = None) -> Any:
    """Serialize an RDF graph in the requested format and display mode."""
    normalized_mode = normalize_metadata_mode(mode)

    if output_format in ("json-ld", "jsonld"):
        kwargs: dict[str, Any] = {"indent": 2}
        if normalized_mode == "compacted":
            context_data = None
            if context is not None:
                if hasattr(context, "namespaces"):
                    context_data = {prefix: str(namespace) for prefix, namespace in context.namespaces.items()}
                elif isinstance(context, dict):
                    context_data = context
            if context_data:
                kwargs["context"] = context_data
                kwargs["auto_compact"] = True
        serialized = graph.serialize(format="json-ld", **kwargs)
        document = json.loads(serialized)
        if normalized_mode == "compacted" and isinstance(document, dict) and "@context" in document:
            document = _prune_jsonld_context(document)
        return document

    if output_format == "nquads":
        return _serialize_nquads_graph(graph)

    return graph.serialize(format=output_format, indent=2)


def _serialize_nquads_graph(graph: Graph) -> str:
    """Serialize a single RDF graph as N-Quads without deprecated rdflib APIs."""
    lines = []
    for subject, predicate, obj in graph:
        lines.append(f"{subject.n3()} {predicate.n3()} {obj.n3()} .")
    return "\n".join(lines) + ("\n" if lines else "")


def process_rdf_format(
    data: dict[str, Any],
    file_stem: str,
    context: Any,
    output_format: str,
    mode: str = "expanded",
) -> Any:
    """Convert frontmatter dict to the requested RDF serialization format.

    Used by the export command to convert frontmatter dicts into various RDF formats.
    """
    if output_format == "dict":
        return data

    from .graph import frontmatter_to_graph

    graph = frontmatter_to_graph(data, context, file_id=file_stem)
    return serialize_rdf_graph(graph, output_format, mode=mode, context=context)
