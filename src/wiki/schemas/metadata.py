"""Metadata RDF view descriptors for serve UI."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class MetadataView(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: str
    format: str
    mode: str
    label: str
    lexer: str


METADATA_VIEWS: list[MetadataView] = [
    MetadataView(id="json-ld-compacted", format="json-ld", mode="compacted", label="JSON-LD", lexer="json"),
    MetadataView(id="turtle", format="turtle", mode="expanded", label="Turtle", lexer="turtle"),
    MetadataView(id="n3", format="n3", mode="expanded", label="N3", lexer="n3"),
    MetadataView(id="xml", format="xml", mode="expanded", label="RDF/XML", lexer="xml"),
    MetadataView(id="nt", format="nt", mode="expanded", label="NT", lexer="nt"),
    MetadataView(id="trig", format="trig", mode="expanded", label="TriG", lexer="trig"),
    MetadataView(id="nquads", format="nquads", mode="expanded", label="NQ", lexer="nt"),
]
