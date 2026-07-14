---
type: TechArticle
headline: wiki graph
description: List read-only RDF named graphs for root and installed source provenance.
---

# `wiki graph`

Inspect read-only RDF named graph boundaries for a composed Wiki.

## Usage

```bash
wiki graph list
```

`wiki graph list` prints the root graph plus one graph for each installed source available from `wiki.lock` and the local `.wiki/sources/` cache.

| Column        | Meaning                                       |
| ------------- | --------------------------------------------- |
| `name`        | `root` or the source name                     |
| `kind`        | `root` or `source`                            |
| `uri`         | Named graph URI for SPARQL `GRAPH` clauses    |
| `commit`      | Short resolved commit for installed sources   |
| `required_by` | Source dependency owners, or `root` if direct |

## Query a source graph

Use the listed URI with native SPARQL:

```sparql
SELECT ?s ?name WHERE {
  GRAPH <https://example.org/wiki/graphs/source/company-brain> {
    ?s schema:name ?name .
  }
}
```

Use `GRAPH ?g` to include provenance in results:

```sparql
SELECT ?g ?s WHERE {
  GRAPH ?g {
    ?s a schema:Thing .
  }
}
```

## Read-only boundary

`wiki graph list` is discovery only. It does not install, update, remove, edit, or write back to source repositories. Writable source workflows and SPARQL Update are intentionally deferred.

## Related

- [wiki query](wiki_query.md)
- [Wiki Configuration](Wiki_Configuration.md#external-data-sources-sources)
- [Recursive Semantic Datasets](Recursive_Semantic_Datasets.md)
