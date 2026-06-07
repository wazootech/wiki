---
type: TechArticle
headline: N-Triples
description: Line-oriented RDF serialization with one triple per line.
---

# N-Triples

**N-Triples** is the most minimal line-oriented serialization of [RDF](RDF.md). Each line expresses exactly one triple as three terms separated by whitespace, terminated by a period.

N-Triples is not designed for human authoring. It is a canonical, machine-friendly format used for streaming, diffing, and interchange. [Turtle](Turtle.md) adds prefixes, abbreviations, and collection syntax on top of the same underlying triple model.

## Hello world

```
<https://example.org/people/alice> <https://schema.org/givenName> "Alice" .
```

This expresses the RDF statement:

- subject: `https://example.org/people/alice`
- predicate: `https://schema.org/givenName`
- object: `Alice`

## In [Wiki CLI](Wiki_CLI.md)

Use `wiki export -f nt` when you want RDF serialized as N-Triples. Built pages also expose this view in the Metadata panel under the **NT** chip.

## Related

- [RDF](RDF.md)
- [Turtle](Turtle.md)
- [TriG](TriG.md)
- [N_Quads](N_Quads.md)
- [JSON_LD](JSON_LD.md)
- [Wiki_Subcommand_export](Wiki_Subcommand_export.md)

## References

- [RDF 1.1 N-Triples](https://www.w3.org/TR/n-triples/)
