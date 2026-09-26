---
type: TechArticle
headline: RDF XML
description: XML-based W3C syntax for RDF input; Wiki output support is deferred.
---

# RDF XML

**RDF/XML** is a W3C-standard XML syntax for representing [RDF](RDF.md). It is designed primarily for **machine-to-machine interchange**, not hand authoring. The underlying data model is still RDF triples; RDF/XML is one concrete syntax for writing them down.

Compared with [Turtle](Turtle.md) or [JSON LD](JSON_LD.md), RDF/XML is usually more verbose and less pleasant for humans to edit directly, but it remains important for compatibility with older semantic-web tools and XML-oriented systems.

## Example

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF
    xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
    xmlns:schema="https://schema.org/">
  <rdf:Description rdf:about="https://example.org/people/alice">
    <schema:givenName>Alice</schema:givenName>
  </rdf:Description>
</rdf:RDF>
```

This expresses the RDF statement:

- subject: `https://example.org/people/alice`
- predicate: `https://schema.org/givenName`
- object: `Alice`

## In Wiki

RDF/XML **input** remains supported: `.rdf` and `.xml` files under `wiki.input` are parsed into the wiki graph. RDF/XML **output** is deferred from the Deno/TypeScript cutover. `wiki export -f xml` returns a clear unsupported-format error, and the SPARQL service returns `406 Not Acceptable` when RDF/XML is requested; neither path substitutes another serialization. A dedicated follow-up can add an RDF/XML writer and test graph equivalence.

Use [Turtle](Turtle.md), N-Triples, N-Quads, N3, TriG, or JSON-LD for output today. See [wiki export](wiki_export.md) and [wiki serve](wiki_serve.md).

## Related

- [RDF](RDF.md)
- [XML](XML.md)
- [Turtle](Turtle.md)
- [JSON LD](JSON_LD.md)
- [wiki export](wiki_export.md)

## References

- [RDF 1.1 XML Syntax](https://www.w3.org/TR/rdf-syntax-grammar/)
