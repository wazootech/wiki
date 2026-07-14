---
type: TechArticle
headline: TriG
description: Turtle syntax extended with named graph blocks.
---

# TriG

**TriG** (TriG RDF Graph Syntax) is a W3C serialization of [RDF](RDF.md) that extends [Turtle](Turtle.md) with **named graph** blocks. Triples in the default graph use ordinary Turtle syntax; triples belonging to a named graph appear inside a `GRAPH` block.

TriG is useful when you need to bundle multiple RDF graphs in one document—for example, separating asserted facts from inferred triples, or attaching provenance metadata to a specific graph.

## Hello world

```
@prefix schema: <https://schema.org/> .

<https://example.org/people/alice> schema:givenName "Alice" .

GRAPH <https://example.org/graphs/provenance> {
  <https://example.org/people/alice> schema:givenName "Alice" .
}
```

The first triple lives in the default graph; the second appears in the named graph `https://example.org/graphs/provenance`.

## In [wiki](wiki.md)

Use `wiki export -f trig` when you want RDF serialized as TriG. Built pages also expose this view in the Metadata panel under the **TriG** chip.

## Related

- [RDF](RDF.md)
- [Turtle](Turtle.md)
- [N Triples](N_Triples.md)
- [N Quads](N_Quads.md)
- [Notation3](Notation3.md)
- [wiki export](wiki_export.md)

## References

- [RDF 1.1 TriG](https://www.w3.org/TR/trig/)
