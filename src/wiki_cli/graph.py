"""RDF Lib graph loading, frontmatter-to-triple conversion, and blank node resolution."""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Any, Optional
from bs4 import BeautifulSoup, Tag
from rdflib import Graph, Literal, URIRef, RDF, BNode
from rdflib.namespace import XSD
from rdflib.parser import InputSource, Parser, StringInputSource
from rdflib.plugin import register

from .config import Context, WikiConfig
from .parser import frontmatter_from_path

logger = logging.getLogger(__name__)


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


def frontmatter_to_graph(data: dict[str, Any], context: Context, file_id: Optional[str] = None, body: Optional[str] = None, uri_ext: bool = False) -> Graph:
    """Convert parsed frontmatter dictionary to an RDF graph."""
    graph = Graph()
    context.bind_namespaces(graph)

    rdf_type = data.get("@type") or data.get("type")
    if not data or not rdf_type:
        return graph

    doc_id = data.get("@id") or data.get("id")
    if not doc_id:
        if not file_id:
            return Graph()
        suffix = ".md" if uri_ext else ""
        doc_id = f"{context.wiki_base}{file_id}{suffix}"

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

    if body and getattr(context, "content_predicate", None):
        resolve_object(context.content_predicate, body, graph, subject, context)

    return graph


def build_person_name_map(input_dirs: list[Path], context: Context, uri_ext: bool = False) -> dict[str, str]:
    """Build a mapping from person names to their wiki @id URIs."""
    name_map: dict[str, str] = {}

    for input_dir in input_dirs:
        if not input_dir.exists():
            continue
        for md_file in input_dir.glob("*.md"):
            try:
                data = frontmatter_from_path(md_file)
                if not data or data.get("@type") != "Person":
                    continue

                doc_id = data.get("@id", "")
                if not doc_id:
                    suffix = ".md" if uri_ext else ""
                    doc_id = f"{context.wiki_base}{md_file.stem}{suffix}"

                name = data.get("name", "")
                if name:
                    name_map[name.lower()] = doc_id

                given = data.get("givenName", "")
                family = data.get("familyName", "")
                if given and family:
                    full_name = f"{given} {family}"
                    name_map[full_name.lower()] = doc_id
                    name_map[given.lower()] = doc_id
            except Exception as e:
                logger.warning("Failed to build name map for %s: %s", md_file.name, e)
                continue

    return name_map


def resolve_blank_nodes(graph: Graph, input_dirs: list[Path], context: Context, uri_ext: bool = False) -> Graph:
    """Resolve blank nodes to @id references where possible."""
    name_map = build_person_name_map(input_dirs, context, uri_ext=uri_ext)

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
            soup = BeautifulSoup(content, "html.parser")
        except Exception as e:
            logger.warning("Failed to parse HTML: %s", e)
            return

        def process_scope(elem: Tag, parent_subject: Any = None, incoming_predicate: Any = None) -> None:
            if elem.has_attr("itemid"):
                subject = URIRef(elem["itemid"])
            else:
                subject = BNode()
            
            if elem.has_attr("itemtype"):
                graph.add((subject, RDF.type, URIRef(elem["itemtype"])))
                
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
                    preds.append(URIRef(p) if ":" in p else URIRef(f"https://schema.org/{p}"))
                
                if prop_elem.has_attr("itemscope"):
                    for pred in preds:
                        process_scope(prop_elem, parent_subject=subject, incoming_predicate=pred)
                else:
                    tag_name = prop_elem.name.lower()
                    if tag_name in ("a", "link", "area"):
                        val = prop_elem.get("href", "")
                        obj = URIRef(val) if (isinstance(val, str) and (val.startswith("http") or ":" in val)) else Literal(val)
                    elif tag_name in ("audio", "embed", "iframe", "img", "source", "track", "video"):
                        val = prop_elem.get("src", "")
                        obj = URIRef(val) if (isinstance(val, str) and (val.startswith("http") or ":" in val)) else Literal(val)
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

# Dynamically register our custom parser to unlock native `format="microdata"` support globally
register("microdata", Parser, "wiki_cli.graph", "MicrodataParser")


def _process_md_file(graph: Graph, md_file: Path, context: WikiConfig) -> None:
    """Parse a single markdown file into the graph: frontmatter, microdata, and turtle blocks."""
    content = md_file.read_text(encoding="utf-8")

    data = frontmatter_from_path(md_file)
    if data:
        body = None
        if context.content_predicate:
            parts = content.split("---", 2)
            if len(parts) > 2:
                body = parts[2].strip()
        graph += frontmatter_to_graph(data, context, file_id=md_file.stem, body=body, uri_ext=context.uri_ext)

    try:
        graph.parse(data=content, format="microdata")
    except Exception as e:
        logger.warning("Failed to parse microdata in %s: %s", md_file.name, e)

    turtle_blocks = re.findall(r"```turtle\s*([\s\S]*?)```", content)
    for block in turtle_blocks:
        try:
            graph.parse(data=block.strip(), format="turtle")
        except Exception as e:
            logger.warning("Failed to parse turtle block in %s: %s", md_file.name, e)


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


def load_graph(context: WikiConfig, infer: bool = True) -> Graph:
    """Load all markdown, RDF, and data files into a unified Graph, resolving blank nodes."""
    graph = Graph()
    context.bind_namespaces(graph)

    for input_dir in context.input_dirs:
        if not input_dir.exists():
            continue
        for file_path in sorted(input_dir.iterdir()):
            if not file_path.is_file():
                continue
            try:
                if file_path.suffix == ".md":
                    _process_md_file(graph, file_path, context)
                else:
                    fmt = _EXT_FORMAT_MAP.get(file_path.suffix)
                    if fmt:
                        graph.parse(file_path, format=fmt)
            except Exception as e:
                logger.warning("Failed to process %s: %s", file_path.name, e)

    resolve_blank_nodes(graph, context.input_dirs, context, uri_ext=context.uri_ext)

    if infer:
        from .infer import apply_inference
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
