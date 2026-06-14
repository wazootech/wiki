"""RDF Lib graph loading, frontmatter-to-triple conversion, and blank node resolution."""

from __future__ import annotations

import logging
import re
import warnings
from pathlib import Path
from typing import Any

from bs4 import BeautifulSoup, Tag, XMLParsedAsHTMLWarning
from rdflib import RDF, BNode, Graph, Literal, URIRef
from rdflib.namespace import XSD
from rdflib.parser import InputSource, Parser, StringInputSource
from rdflib.plugin import register

from .config import Config, Context
from .parser import document_data_from_path
from .paths import iter_document_files, route_for_document_file

logger = logging.getLogger(__name__)
DEFAULT_MICRODATA_VOCAB = "https://schema.org/"


def kebab_case(s: str) -> str:
    """Convert a string to kebab-case for URI segments."""
    s = str(s).lower().strip()
    s = re.sub(r"[\s\-]+", "-", s)
    s = re.sub(r"[^a-z0-9\-]", "", s)
    return s


def _slugify_path(p: Path) -> str:
    """Compute a stable nested slug (posix, no extension) for wiki files."""
    return p.with_suffix("").as_posix().strip("/").lower()


def _file_slug(file_path: Path, input_dirs: list[Path]) -> str:
    for root in input_dirs:
        try:
            rel = file_path.relative_to(root)
            return _slugify_path(rel)
        except ValueError:
            continue
    return _slugify_path(file_path)


def resolve_predicate(key: str, context: Context) -> URIRef:
    """Map a frontmatter key to an RDF predicate URI using managed namespaces.

    Resolution order: CURIE (prefix:localName) → wiki.* dotted keys → schema: default.
    Non-schema vocabulary must use an explicit prefix (for example rdfs:label).
    """
    if ":" in key:
        prefix, name = key.split(":", 1)
        if prefix in context.namespaces:
            return context.namespaces[prefix][name]
    if key.startswith("wiki."):
        return context.namespaces["wiki"][key[5:]]
    return context.namespaces["schema"][key]


def resolve_type(t: Any, context: Context) -> URIRef:
    """Map a frontmatter type to an RDF type URI using managed namespaces."""
    if isinstance(t, str):
        if ":" in t:
            prefix, name = t.split(":", 1)
            if prefix in context.namespaces:
                return context.namespaces[prefix][name]
        return context.namespaces["schema"][t]
    return URIRef(str(t))


def resolve_object(key: str, value: Any, graph: Graph, subject: URIRef, context: Context) -> None:
    """Add a predicate-object pair to the graph, recursively handling nested structures."""
    pred = resolve_predicate(key, context)

    if isinstance(value, dict):
        if "@id" in value:
            uri = value["@id"]
            if ":" in uri:
                prefix, name = uri.split(":", 1)
                if prefix in context.namespaces:
                    uri = str(context.namespaces[prefix][name])
            graph.add((subject, pred, URIRef(uri)))
        elif "@type" in value:
            blank = URIRef(f"_:blank-{kebab_case(key)}-{id(value)}")
            graph.add((subject, pred, blank))
            graph.add((blank, RDF.type, URIRef(f"{context.namespaces['schema']}{value['@type']}")))
            for k, v in value.items():
                if not k.startswith("@"):
                    resolve_object(k, v, graph, blank, context)
        else:
            blank = URIRef(f"_:blank-{kebab_case(key)}-{id(value)}")
            graph.add((subject, pred, blank))
            for k, v in value.items():
                if not k.startswith("@"):
                    resolve_object(k, v, graph, blank, context)
    elif isinstance(value, str):
        if value.startswith("http"):
            graph.add((subject, pred, URIRef(value)))
        elif ":" in value and " " not in value and "\n" not in value:
            prefix, name = value.split(":", 1)
            if prefix in context.namespaces:
                graph.add((subject, pred, URIRef(context.namespaces[prefix][name])))
            else:
                graph.add((subject, pred, Literal(value)))
        else:
            graph.add((subject, pred, Literal(value)))
    elif isinstance(value, bool):
        graph.add((subject, pred, Literal(value, datatype=XSD.boolean)))
    elif isinstance(value, (int, float)):
        graph.add((subject, pred, Literal(value)))
    elif hasattr(value, "isoformat") and hasattr(value, "year"): # Check for datetime/date
        graph.add((subject, pred, Literal(value, datatype=XSD.date)))
    elif value is not None:
        graph.add((subject, pred, Literal(str(value))))


def _rdf_binding(ctx: Context | Config) -> tuple[Context, str | None]:
    if isinstance(ctx, Config):
        return ctx.context, ctx.graph.content_predicate
    return ctx, getattr(ctx, "content_predicate", None)


def _normalize_type_list(raw: Any) -> list[Any]:
    if raw is None:
        return []
    if isinstance(raw, list):
        return list(raw)
    return [raw]


def _is_shacl_shape_document(fm_types: list[Any]) -> bool:
    for item in fm_types:
        if not isinstance(item, str):
            continue
        normalized = item.strip()
        if normalized in {"sh:NodeShape", "sh:PropertyShape", "NodeShape", "PropertyShape"}:
            return True
        if ":" in normalized:
            prefix, local = normalized.split(":", 1)
            if prefix == "sh" and local in {"NodeShape", "PropertyShape"}:
                return True
    return False


def _effective_types(data: dict[str, Any], context: Context | Config) -> list[Any]:
    """Merge frontmatter type with graph.implicit_types per implicit_types_policy."""
    fm_types = _normalize_type_list(data.get("@type") or data.get("type"))

    implicit_types: list[str] = []
    policy = "fallback"
    if isinstance(context, Config):
        implicit_types = list(context.graph.implicit_types)
        policy = context.graph.implicit_types_policy

    if not implicit_types:
        return fm_types
    if not fm_types:
        return list(implicit_types)
    if policy == "fallback":
        return fm_types
    if _is_shacl_shape_document(fm_types):
        return fm_types

    rdf_ctx = context if isinstance(context, Context) else context.context
    seen: set[str] = set()
    merged: list[Any] = []
    for item in fm_types + implicit_types:
        resolved = str(resolve_type(item, rdf_ctx))
        if resolved in seen:
            continue
        seen.add(resolved)
        merged.append(item)
    return merged


def frontmatter_to_graph(
    data: dict[str, Any],
    context: Context | Config,
    file_id: str | None = None,
    body: str | None = None,
    include_file_extension: bool = False,
    file_ext: str = ".md",
    content_predicate: str | None = None,
) -> Graph:
    """Convert parsed frontmatter dictionary to an RDF graph."""
    rdf_ctx, default_predicate = _rdf_binding(context)
    if content_predicate is None:
        content_predicate = default_predicate
    graph = Graph()
    rdf_ctx.bind_namespaces(graph)

    effective_types = _effective_types(data, context)
    if not data or not effective_types:
        return graph

    doc_id = data.get("@id") or data.get("id")
    if not doc_id:
        if not file_id:
            return Graph()
        suffix = file_ext if include_file_extension else ""
        doc_id = f"{rdf_ctx.base_iri}{file_id}{suffix}"

    if doc_id and ":" in doc_id:
        prefix, name = doc_id.split(":", 1)
        if prefix in rdf_ctx.namespaces:
            doc_id = str(rdf_ctx.namespaces[prefix][name])

    subject = URIRef(doc_id)

    for t in effective_types:
        graph.add((subject, RDF.type, resolve_type(t, rdf_ctx)))

    skip_keys = {"id", "type", "@type"}
    for key, value in data.items():
        if key.startswith("@") or key in skip_keys:
            continue
        if isinstance(value, list):
            for item in value:
                resolve_object(key, item, graph, subject, rdf_ctx)
        elif value:
            resolve_object(key, value, graph, subject, rdf_ctx)

    if body and content_predicate:
        resolve_object(content_predicate, body, graph, subject, rdf_ctx)

    return graph



class MicrodataParser(Parser):
    """Custom RDFLib parser wrapper enabling native `format='microdata'` support via BeautifulSoup."""
    def parse(self, source: Any, graph: Graph, **kwargs: Any) -> None:
        content = ""
        if isinstance(source, StringInputSource):
            raw = source.getByteStream().read()
            content = raw.decode("utf-8") if isinstance(raw, bytes) else raw
        elif isinstance(source, InputSource):
            stream = source.getByteStream()
            if stream is not None:
                raw = stream.read()
                content = raw.decode("utf-8") if isinstance(raw, bytes) else raw
        elif hasattr(source, "read"):
            raw = source.read()
            content = raw.decode("utf-8") if isinstance(raw, bytes) else raw
        else:
            # Attempt fallback loading
            try:
                content = str(source)
            except Exception:
                return
        
        if isinstance(content, bytes):
            content = content.decode("utf-8", errors="ignore")
            
        try:
            with warnings.catch_warnings():
                warnings.filterwarnings("ignore", category=XMLParsedAsHTMLWarning)
                soup = BeautifulSoup(content, "html.parser")
        except Exception as e:
            logger.warning("Failed to parse HTML: %s", e)
            return

        namespace_map = {prefix: str(namespace) for prefix, namespace in graph.namespaces()}

        def process_scope(elem: Tag, parent_subject: Any = None, incoming_predicate: Any = None) -> None:
            if elem.has_attr("itemid"):
                subject = URIRef(_expand_microdata_identifier(str(elem["itemid"]), namespace_map))
            else:
                subject = BNode()
            
            if elem.has_attr("itemtype"):
                graph.add((subject, RDF.type, URIRef(_expand_microdata_identifier(str(elem["itemtype"]), namespace_map))))
                
            if parent_subject and incoming_predicate:
                graph.add((parent_subject, incoming_predicate, subject))

            def gather_props(node: Any, direct_props: list[Tag]) -> None:
                for child in node.children:
                    if not isinstance(child, Tag):
                        continue
                    if child.has_attr("itemprop"):
                        direct_props.append(child)
                    if not child.has_attr("itemscope"):
                        gather_props(child, direct_props)

            properties: list[Tag] = []
            gather_props(elem, properties)

            for prop_elem in properties:
                prop_names = str(prop_elem.get("itemprop", "")).split()
                preds = []
                for p in prop_names:
                    preds.append(URIRef(_expand_microdata_predicate(p, namespace_map)))
                
                if prop_elem.has_attr("itemscope"):
                    for pred in preds:
                        process_scope(prop_elem, parent_subject=subject, incoming_predicate=pred)
                else:
                    tag_name = prop_elem.name.lower()
                    if tag_name in ("a", "link", "area"):
                        val = prop_elem.get("href", "")
                        expanded = _expand_microdata_identifier(val, namespace_map)
                        obj = URIRef(expanded) if expanded else Literal(val)
                    elif tag_name in ("audio", "embed", "iframe", "img", "source", "track", "video"):
                        val = prop_elem.get("src", "")
                        expanded = _expand_microdata_identifier(val, namespace_map)
                        obj = URIRef(expanded) if expanded else Literal(val)
                    elif tag_name == "meta":
                        obj = Literal(prop_elem.get("content", ""))
                    elif tag_name == "time":
                        obj = Literal(prop_elem.get("datetime") or prop_elem.get_text().strip())
                    else:
                        obj = Literal(prop_elem.get_text().strip())
                    for pred in preds:
                        graph.add((subject, pred, obj))

        all_scopes = soup.find_all(attrs={"itemscope": True})
        for s in all_scopes:
            parent = s.parent
            is_nested = False
            while parent:
                if isinstance(parent, Tag) and parent.has_attr("itemscope"):
                    is_nested = True
                    break
                parent = parent.parent
            if not is_nested:
                process_scope(s)


def _expand_microdata_identifier(value: str, namespace_map: dict[str | None, str]) -> str:
    value = value.strip()
    if not value:
        return value
    if _is_absolute_iri(value):
        return value
    return _expand_bound_curie(value, namespace_map) or value


def _expand_microdata_predicate(value: str, namespace_map: dict[str | None, str]) -> str:
    value = value.strip()
    if not value:
        return value
    if _is_absolute_iri(value):
        return value
    if ":" in value:
        return _expand_bound_curie(value, namespace_map) or value
    return f"{namespace_map.get('schema', DEFAULT_MICRODATA_VOCAB)}{value}"


def _expand_bound_curie(value: str, namespace_map: dict[str | None, str]) -> str | None:
    prefix, local = value.split(":", 1)
    namespace = namespace_map.get(prefix)
    if namespace is None:
        return None
    return f"{namespace}{local}"


def _is_absolute_iri(value: str) -> bool:
    lowered = value.lower()
    return lowered.startswith(("http://", "https://", "urn:"))

# Dynamically register our custom parser to unlock native `format="microdata"` support globally
register("microdata", Parser, "wiki.graph", "MicrodataParser")


def _process_document_file(graph: Graph, file_path: Path, context: Config) -> None:
    """Parse a supported wiki document into the graph."""
    data = document_data_from_path(file_path)
    if data:
        body = None
        if file_path.suffix.lower() == ".md" and context.graph.content_predicate:
            content = file_path.read_text(encoding="utf-8")
            parts = content.split("---", 2)
            if len(parts) > 2:
                body = parts[2].strip()
        file_id = route_for_document_file(context, file_path)
        graph += frontmatter_to_graph(
            data,
            context,
            file_id=file_id,
            body=body,
            include_file_extension=context.graph.include_file_extension,
            file_ext=file_path.suffix.lower(),
        )

    if file_path.suffix.lower() != ".md":
        return

    content = file_path.read_text(encoding="utf-8")

    try:
        graph.parse(data=content, format="microdata")
    except Exception as e:
        logger.warning("Failed to parse microdata in %s: %s", file_path.name, e)

    turtle_blocks = re.findall(r"```turtle\s*([\s\S]*?)```", content)
    for block in turtle_blocks:
        try:
            graph.parse(data=block.strip(), format="turtle")
        except Exception as e:
            logger.warning("Failed to parse turtle block in %s: %s", file_path.name, e)


# Map file extensions to rdflib format names
_EXT_FORMAT_MAP = {
    ".ttl": "turtle",
    ".trig": "trig",
    ".nt": "nt",
    ".nq": "nquads",
    ".rdf": "xml",
    ".xml": "xml",
    ".jsonld": "json-ld",
    ".html": "microdata",
    ".htm": "microdata",
}


def _build_graph_from_wiki(context: Config) -> Graph:
    """Load asserted triples from all wiki sources without OWL-RL inference."""
    graph = Graph()
    context.bind_namespaces(graph)

    document_files = set(iter_document_files(context))

    for input_dir in context.wiki.inputs:
        if not input_dir.exists():
            continue
        for file_path in sorted(input_dir.rglob("*")):
            if not file_path.is_file() or context.is_excluded(file_path):
                continue
            try:
                if file_path in document_files:
                    _process_document_file(graph, file_path, context)
                else:
                    fmt = _EXT_FORMAT_MAP.get(file_path.suffix.lower())
                    if fmt:
                        graph.parse(file_path, format=fmt)
            except Exception as e:
                logger.warning("Failed to process %s: %s", file_path.name, e)

    return graph


def load_graph(
    context: Config,
    infer: bool = True,
    *,
    use_cache: bool = True,
    reload: bool = False,
    disk_cache: bool = False,
) -> Graph:
    """Load wiki sources into a Graph, reusing the in-process cache when possible.

    Multiple calls in the same process (many SPARQL blocks, query + render, SHACL
    checks, serve requests) share one graph build unless ``reload`` is set.
    """
    from .graph_cache import (
        clear_disk_graph,
        clear_process_graph,
        get_disk_graph,
        get_process_graph,
        set_disk_graph,
        set_process_graph,
    )

    if reload:
        clear_process_graph(context, infer)
        if disk_cache:
            clear_disk_graph(context, infer)
    elif use_cache:
        cached = get_process_graph(context, infer)
        if cached is not None:
            return cached
        if disk_cache:
            cached_disk = get_disk_graph(context, infer)
            if cached_disk is not None:
                set_process_graph(context, infer, cached_disk)
                return cached_disk

    graph = _build_graph_from_wiki(context)
    if infer:
        from .infer import apply_inference
        apply_inference(graph, context)

    if use_cache:
        set_process_graph(context, infer, graph)
    if disk_cache:
        set_disk_graph(context, infer, graph)

    return graph


def graph_stats(graph: Graph) -> dict[str, int]:
    """Return basic statistics about the loaded graph."""
    return {
        "triples": len(graph),
        "subjects": len(set(graph.subjects())),
        "predicates": len(set(graph.predicates())),
        "objects": len(set(graph.objects())),
    }
