"""JSON-LD prefix and namespace bindings for RDF graph loading."""

from __future__ import annotations

from typing import Any

from rdflib import OWL, RDF, RDFS, Namespace
from rdflib.namespace import XSD

SCHEMA = Namespace("https://schema.org/")
WIKI = Namespace("https://wiki.example.org/")
FOAF = Namespace("http://xmlns.com/foaf/0.1/")
DC = Namespace("http://purl.org/dc/elements/1.1/")
DCTERMS = Namespace("http://purl.org/dc/terms/")
SH = Namespace("http://www.w3.org/ns/shacl#")
WAZOO = Namespace("https://wazootech.github.io/wiki-cli/vocab/")

DEFAULT_NAMESPACES = {
    "schema": SCHEMA,
    "wiki": WIKI,
    "foaf": FOAF,
    "rdf": RDF,
    "rdfs": RDFS,
    "xsd": XSD,
    "owl": OWL,
    "dc": DC,
    "dcterms": DCTERMS,
    "sh": SH,
    "wazoo": WAZOO,
}


class Context:
    """Manages JSON-LD prefix and namespace bindings."""

    def __init__(
        self,
        namespaces: dict[str, Any] | None = None,
        base_iri: str = "https://wiki.example.org/",
    ) -> None:
        self.namespaces = DEFAULT_NAMESPACES.copy()
        self.base_iri = base_iri
        if namespaces is None:
            self.vocab: str | None = "https://schema.org/"
        else:
            self.vocab = None
            namespaces_copy = namespaces.copy()
            if "@vocab" in namespaces_copy:
                val = namespaces_copy["@vocab"]
                self.vocab = str(val) if val else None
                del namespaces_copy["@vocab"]
            for prefix, uri in namespaces_copy.items():
                if uri is None:
                    if prefix in self.namespaces:
                        del self.namespaces[prefix]
                elif isinstance(uri, str):
                    self.namespaces[prefix] = Namespace(uri)
                else:
                    self.namespaces[prefix] = uri

    def bind_namespaces(self, graph: Any) -> None:
        """Bind all managed namespaces to an RDFLib Graph instance."""
        for prefix, namespace in self.namespaces.items():
            graph.bind(prefix, namespace)
