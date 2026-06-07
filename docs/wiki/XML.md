---
type: TechArticle
headline: XML
description: Extensible Markup Language, a structured text format for machine-readable documents.
---

# XML

**XML** (Extensible Markup Language) is a W3C standard for representing structured data as nested tagged text. It is widely used for **machine-to-machine communication**, configuration, document exchange, and data interchange between systems that need a strict tree-shaped format.

XML itself is only a syntax. Specific vocabularies such as [RDF_XML](RDF_XML.md), RSS, SVG, or custom application schemas define what the tags actually mean.

## Hello world

```xml
<?xml version="1.0" encoding="UTF-8"?>
<greeting>
  <message>Hello, world!</message>
</greeting>
```

This is a tiny XML document with one root element (`greeting`) and one child element (`message`).

## Why it matters here

In the semantic-web context, XML is relevant because some W3C standards use it as their serialization surface. [RDF_XML](RDF_XML.md) is one example: RDF data encoded using XML syntax.

## Related

- [RDF_XML](RDF_XML.md)
- [RDF](RDF.md)
- [Semantic_Web](Semantic_Web.md)

## References

- [Extensible Markup Language (XML) 1.0](https://www.w3.org/TR/xml/)
- [XML — MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/XML)
