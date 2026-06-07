---
type: TechArticle
headline: RDF XML
description: XML-based W3C serialization for RDF graphs.
---

# RDF XML

**RDF/XML** is a W3C-standard XML serialization of [RDF](RDF.md). It is designed primarily for **machine-to-machine interchange**, not for hand authoring. The underlying data model is still RDF triples; RDF/XML is just one concrete syntax for writing them down.

Compared with [Turtle](Turtle.md) or [JSON_LD](JSON_LD.md), RDF/XML is usually more verbose and less pleasant for humans to edit directly, but it remains important for compatibility with older semantic-web tools and XML-oriented systems.

## Hello world

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

## In [[Wiki_CLI|Wiki CLI]]

Use `wiki export -f xml` when you want RDF serialized in RDF/XML form.

## Related

- [RDF](RDF.md)
- [XML](XML.md)
- [Turtle](Turtle.md)
- [JSON_LD](JSON_LD.md)
- [Wiki_Subcommand_export](Wiki_Subcommand_export.md)

## References

- [RDF 1.1 XML Syntax](https://www.w3.org/TR/rdf-syntax-grammar/)
