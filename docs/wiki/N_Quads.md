---
type: TechArticle
headline: N-Quads
description: Line-oriented RDF serialization with an optional graph term per line.
---

# N-Quads

**N-Quads** extends [N_Triples](N_Triples.md) with an optional fourth term naming the graph that contains each triple. Each line expresses one RDF quad: subject, predicate, object, and optionally graph.

N-Quads is the line-oriented counterpart to [TriG](TriG.md). Where TriG groups triples into `GRAPH` blocks, N-Quads repeats the graph name on every line—making it easy to stream, append, and diff multi-graph datasets.

## Hello world

```
<https://example.org/people/alice> <https://schema.org/givenName> "Alice" .
<https://example.org/people/alice> <https://schema.org/givenName> "Alice" <https://example.org/graphs/provenance> .
```

The first line is a triple in the default graph (no graph term). The second assigns the same triple to the named graph `https://example.org/graphs/provenance`.

## In [Wiki CLI](Wiki_CLI.md)

Use `wiki export -f nquads` when you want RDF serialized as N-Quads. Built pages also expose this view in the Metadata panel under the **NQ** chip.

## Related

- [RDF](RDF.md)
- [N_Triples](N_Triples.md)
- [TriG](TriG.md)
- [Turtle](Turtle.md)
- [JSON_LD](JSON_LD.md)
- [Wiki_Subcommand_export](Wiki_Subcommand_export.md)

## References

- [RDF 1.1 N-Quads](https://www.w3.org/TR/n-quads/)
