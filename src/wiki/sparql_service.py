"""SPARQL 1.1 Service Description (https://www.w3.org/TR/sparql11-service-description/)."""

from __future__ import annotations

from rdflib import Graph, Literal, Namespace, URIRef
from rdflib.namespace import RDF, XSD

SD = Namespace("http://www.w3.org/ns/sparql-service-description#")
FMT = Namespace("http://www.w3.org/ns/formats/")
ENT = Namespace("http://www.w3.org/ns/entailment/")
PROF = Namespace("http://www.w3.org/ns/owl-profile/")
VOID = Namespace("http://rdfs.org/ns/void#")

SERVICE_DESCRIPTION_MEDIA = [
    "text/turtle",
    "application/rdf+xml",
    "application/n-triples",
]

_RESULT_FORMATS = (
    FMT.SPARQL_Results_JSON,
    FMT.SPARQL_Results_CSV,
    FMT["SPARQL_Results_TSV"],
    FMT.Turtle,
    FMT["N-Triples"],
    FMT["N3"],
)


def build_service_description_graph(endpoint: str, *, default_triple_count: int | None = None) -> Graph:
    """Build an sd:Service description graph for the given endpoint URL."""
    graph = Graph()
    graph.bind("sd", SD)
    graph.bind("ent", ENT)
    graph.bind("prof", PROF)
    graph.bind("void", VOID)

    endpoint_uri = URIRef(endpoint)
    service = URIRef(f"{endpoint}#service")
    dataset = URIRef(f"{endpoint}#dataset")
    default_graph = URIRef(f"{endpoint}#defaultGraph")

    graph.add((service, RDF.type, SD.Service))
    graph.add((service, SD.endpoint, endpoint_uri))
    graph.add((service, SD.supportedLanguage, SD.SPARQL11Query))
    graph.add((service, SD.defaultEntailmentRegime, ENT["OWL-RDF-Based"]))
    graph.add((service, SD.defaultSupportedEntailmentProfile, PROF.RL))

    for result_format in _RESULT_FORMATS:
        graph.add((service, SD.resultFormat, result_format))

    graph.add((service, SD.defaultDataset, dataset))
    graph.add((dataset, RDF.type, SD.Dataset))
    graph.add((dataset, SD.defaultGraph, default_graph))
    graph.add((default_graph, RDF.type, SD.Graph))
    if default_triple_count is not None:
        graph.add((default_graph, VOID.triples, Literal(default_triple_count, datatype=XSD.integer)))

    return graph


def serialize_service_description(graph: Graph, accept_header: str) -> tuple[bytes, str]:
    """Serialize a service description graph using HTTP Accept content negotiation."""
    media = _best_accept_media(accept_header, SERVICE_DESCRIPTION_MEDIA)
    if media is None:
        raise ValueError(f"Unsupported Accept header: {accept_header}")

    if media == "application/rdf+xml":
        body = graph.serialize(format="xml")
        return body.encode("utf-8"), "application/rdf+xml; charset=utf-8"
    if media == "application/n-triples":
        body = graph.serialize(format="nt")
        return body.encode("utf-8"), "application/n-triples; charset=utf-8"
    body = graph.serialize(format="turtle")
    return body.encode("utf-8"), "text/turtle; charset=utf-8"


def _best_accept_media(accept_header: str, supported: list[str]) -> str | None:
    if not accept_header.strip():
        return supported[0]
    entries: list[tuple[float, str]] = []
    for part in accept_header.split(","):
        item = part.strip()
        if not item:
            continue
        media = item
        q = 1.0
        if ";" in item:
            media, *params = [p.strip() for p in item.split(";")]
            for param in params:
                if param.startswith("q="):
                    try:
                        q = float(param[2:])
                    except ValueError:
                        q = 0.0
        entries.append((q, media.lower()))
    entries.sort(key=lambda item: item[0], reverse=True)
    supported_lower = {media.lower(): media for media in supported}
    for _, media in entries:
        if media in supported_lower:
            return supported_lower[media]
        if media == "*/*":
            return supported[0]
    return None
