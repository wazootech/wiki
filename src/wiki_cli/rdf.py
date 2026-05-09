"""RDF Lib graph loading, frontmatter-to-triple conversion, and blank node resolution."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Optional
from rdflib import Graph, Literal, URIRef, RDF, RDFS
from rdflib.namespace import XSD

from .context import Context
from .frontmatter import frontmatter_from_path


def kebab_case(s: str) -> str:
    """Convert a string to kebab-case for URI segments."""
    s = str(s).lower().strip()
    s = re.sub(r"[\s\-]+", "-", s)
    s = re.sub(r"[^a-z0-9\-]", "", s)
    return s


def resolve_predicate(key: str, context: Context) -> URIRef:
    """Map a frontmatter key to an RDF predicate URI using managed namespaces."""
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


def frontmatter_to_graph(data: dict[str, Any], context: Context, file_id: Optional[str] = None, body: Optional[str] = None) -> Graph:
    """Convert parsed frontmatter dictionary to an RDF graph."""
    graph = Graph()
    context.bind_namespaces(graph)

    rdf_type = data.get("@type") or data.get("type")
    if not data or not rdf_type:
        return graph

    doc_id = data.get("@id") or data.get("id")
    if not doc_id:
        if file_id:
            doc_id = f"{context.wiki_base}{file_id}.md"
        else:
            name = data.get("name", data.get("givenName", ""))
            if rdf_type == "Person":
                given = data.get("givenName", "")
                family = data.get("familyName", "")
                if given and family:
                    doc_id = f"{context.wiki_base}{kebab_case(given)}-{kebab_case(family)}.md"
                else:
                    doc_id = f"{context.wiki_base}{kebab_case(name)}.md"
            else:
                doc_id = f"{context.wiki_base}{kebab_case(name)}.md"

    if doc_id and ":" in doc_id:
        prefix, name = doc_id.split(":", 1)
        if prefix in context.namespaces:
            doc_id = str(context.namespaces[prefix][name])

    subject = URIRef(doc_id)

    if isinstance(rdf_type, list):
        for t in rdf_type:
            graph.add((subject, RDF.type, resolve_type(t, context)))
    elif rdf_type:
        graph.add((subject, RDF.type, resolve_type(rdf_type, context)))

    for key, value in data.items():
        if key.startswith("@") or key in ("id", "type"):
            continue
        if isinstance(value, list):
            for item in value:
                resolve_object(key, item, graph, subject, context)
        elif value:
            resolve_object(key, value, graph, subject, context)

    if body and hasattr(context, "content_predicate") and context.content_predicate:
        resolve_object(context.content_predicate, body, graph, subject, context)

    return graph


def build_name_to_id_map(wiki_dir: Path, context: Context) -> dict[str, str]:
    """Build a mapping from person names to their wiki @id URIs."""
    name_map: dict[str, str] = {}

    for md_file in wiki_dir.glob("*.md"):
        try:
            data = frontmatter_from_path(md_file)
            if not data or data.get("@type") != "Person":
                continue

            doc_id = data.get("@id", "")
            if not doc_id:
                name = data.get("name", data.get("givenName", ""))
                if data.get("givenName") and data.get("familyName"):
                    doc_id = f"{context.wiki_base}{kebab_case(data['givenName'])}-{kebab_case(data['familyName'])}.md"
                else:
                    doc_id = f"{context.wiki_base}{kebab_case(name)}.md"

            name = data.get("name", "")
            if name:
                name_map[name.lower()] = doc_id

            given = data.get("givenName", "")
            family = data.get("familyName", "")
            if given and family:
                full_name = f"{given} {family}"
                name_map[full_name.lower()] = doc_id
                name_map[given.lower()] = doc_id
        except Exception:
            continue

    return name_map


def resolve_blank_nodes(graph: Graph, wiki_dir: Path, context: Context) -> Graph:
    """Resolve blank nodes to @id references where possible."""
    name_map = build_name_to_id_map(wiki_dir, context)

    blank_nodes = [s for s in graph.subjects() if str(s).startswith("_:")]

    for blank in blank_nodes:
        name = graph.value(blank, context.namespaces["schema"].name)
        if not name or str(name).lower() not in name_map:
            continue

        target_id = name_map[str(name).lower()]

        for pred, obj in list(graph.predicate_objects(blank)):
            graph.remove((blank, pred, obj))
            graph.add((URIRef(target_id), pred, obj))

        for subj, pred in list(graph.subject_predicates(blank)):
            graph.remove((subj, pred, blank))
            graph.add((subj, pred, URIRef(target_id)))

    return graph


def load_graph(context: Context, infer: bool = True) -> Graph:
    """Load all markdown files into a unified Graph, resolving blank nodes."""
    graph = Graph()
    context.bind_namespaces(graph)

    # Load primary wiki documents
    if context.wiki_dir.exists():
        for md_file in context.wiki_dir.glob("*.md"):
            try:
                content = md_file.read_text(encoding="utf-8")
                
                # 1. Extract frontmatter data
                data = frontmatter_from_path(md_file)
                body = None
                if data:
                    if hasattr(context, "content_predicate") and context.content_predicate:
                        parts = content.split("---", 2)
                        if len(parts) > 2:
                            body = parts[2].strip()
                    graph += frontmatter_to_graph(data, context, file_id=md_file.stem, body=body)

                # 2. Extract and parse any ```turtle blocks natively into the graph
                turtle_blocks = re.findall(r"```turtle\s*([\s\S]*?)```", content)
                for block in turtle_blocks:
                    try:
                        graph.parse(data=block.strip(), format="turtle")
                    except Exception:
                        pass # Ignore parsing errors in individual code blocks
            except Exception:
                pass

    # Load raw documents if configured and present
    if context.raw_dir.exists():
        for md_file in context.raw_dir.glob("*.md"):
            try:
                content = md_file.read_text(encoding="utf-8")
                
                data = frontmatter_from_path(md_file)
                body = None
                if data:
                    if hasattr(context, "content_predicate") and context.content_predicate:
                        parts = content.split("---", 2)
                        if len(parts) > 2:
                            body = parts[2].strip()
                    graph += frontmatter_to_graph(data, context, file_id=md_file.stem, body=body)

                turtle_blocks = re.findall(r"```turtle\s*([\s\S]*?)```", content)
                for block in turtle_blocks:
                    try:
                        graph.parse(data=block.strip(), format="turtle")
                    except Exception:
                        pass
            except Exception:
                pass

    # Load static RDF imports from consolidated directories
    for import_dir in getattr(context, "import_dirs", []):
        if import_dir.exists():
            for ttl_file in sorted(import_dir.glob("*.ttl")):
                try:
                    graph.parse(ttl_file, format="turtle")
                except Exception:
                    pass

    resolve_blank_nodes(graph, context.wiki_dir, context)

    if infer:
        from .reasoning import apply_inference
        apply_inference(graph, context)

    return graph


def graph_stats(graph: Graph) -> dict[str, int]:
    """Return basic statistics about the loaded graph."""
    return {
        "triples": len(graph),
        "subjects": len(set(graph.subjects())),
        "predicates": len(set(graph.predicates())),
        "objects": len(set(graph.objects())),
    }
