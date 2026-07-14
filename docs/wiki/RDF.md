---
type: TechArticle
headline: RDF
description: Resource Description Framework, a standard for data interchange on the web.
---

# RDF

The **Resource Description Framework (RDF)** is a standard model for data interchange on the Web. It is the foundational data structure of the [Semantic Web](Semantic_Web.md).

RDF facilitates data merging even if the underlying schemas differ, and it specifically supports the evolution of schemas over time without requiring all the data consumers to be changed.

RDF extends the linking structure of the Web to use URIs to name the relationship between things as well as the two ends of the link (this is usually referred to as a "triple": subject-predicate-object).

## Related standards

- [RDF XML](RDF_XML.md): The XML-based W3C serialization for RDF.
- [Turtle](Turtle.md): A compact, human-friendly serialization syntax for RDF.
- [JSON LD](JSON_LD.md): A lightweight Linked Data format that uses JSON.
- [Notation3](Notation3.md): A readable superset of Turtle, with rules and quoted graphs.
- [N Triples](N_Triples.md): A minimal line-oriented serialization with one triple per line.
- [TriG](TriG.md): Turtle syntax extended with named graph blocks.
- [N Quads](N_Quads.md): N-Triples extended with an optional graph term per line.
- [SPARQL](SPARQL.md): The query language for RDF graphs.
- [OWL](OWL.md): Ontology vocabulary and reasoning on top of RDF.
- [SHACL](SHACL.md): A language for validating RDF graphs.

## In this wiki

The [wiki](wiki.md) compiles markdown frontmatter into an RDF graph. Dump serializations with [wiki export](wiki_export.md) or inspect triples per page in the build/serve metadata view ([wiki serve](wiki_serve.md#metadata-view)).

## References

- [RDF 1.1 Primer](https://www.w3.org/TR/rdf11-primer/): A primer on RDF 1.1.
- [RDF 1.1 Concepts and Abstract Data Model](https://www.w3.org/TR/rdf11-concepts/): Concepts and abstract data model for RDF 1.1.
