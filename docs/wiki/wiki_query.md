---
type: TechArticle
headline: wiki query
description: Run SPARQL SELECT or CONSTRUCT against the wiki graph.
---

# `wiki query`

Execute **SPARQL** against the loaded wiki graph (with OWL-RL inference unless `--no-inference`). Unscoped queries read the union of root content and installed sources. Use native SPARQL `GRAPH` clauses when you need source boundaries.

## Usage

```bash
wiki query "SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 10"
wiki query --pretty "SELECT ?given ?family WHERE { ?s schema:givenName ?given ; schema:familyName ?family }"
cat query.sparql | wiki query -f json
wiki query "SELECT ?given WHERE { ?s schema:givenName ?given }" --jq 'results.bindings[].given.value'
wiki query "..." --reload -v
wiki query "..." --cache
```

## Options

| Flag              | Description                                                                    |
| ----------------- | ------------------------------------------------------------------------------ |
| `QUERY`           | SPARQL string, or omit to read stdin                                           |
| `-f`, `--format`  | `table` (default), `json`, `csv`, `tsv`, `turtle`, `n3`, `markdown`            |
| `-o`, `--output`  | Write results to a file                                                        |
| `--pretty`        | Rich table for SELECT results (stdout only; incompatible with `-o` and `--jq`) |
| `--no-inference`  | Skip OWL-RL                                                                    |
| `--reload`        | Rebuild in-memory graph in this process                                        |
| `--cache`         | Persist a warm graph under `.wiki/cache/` for reuse across new processes       |
| `--jq`            | Filter JSON output (implies `-f json`)                                         |
| `-v`, `--verbose` | Print triple/subject counts first                                              |

## Inspect one document

Use `--pretty` with a subject-focused SELECT to peek at frontmatter triples in the terminal. Markdown body and typed infobox layout are not reproduced — use [wiki serve](wiki_serve.md) for full page preview.

```bash
wiki query --pretty "SELECT ?property ?value WHERE {
  wiki:Gregory_Davidson ?property ?value .
}"
```

## Graph reuse

See [Graph Cache](Graph_Cache.md) — one graph per process unless `--reload`, plus optional cross-process warm-start via `--cache`.

## Source provenance

Installed sources are exposed as read-only RDF named graphs. Discover graph URIs with [wiki graph](wiki_graph.md):

```bash
wiki graph list
```

Then scope a query with native SPARQL:

```sparql
SELECT ?name WHERE {
  GRAPH <https://example.org/wiki/graphs/source/company-brain> {
    ?s schema:name ?name .
  }
}
```

Or ask which graph supplied each binding:

```sparql
SELECT ?g ?s WHERE {
  GRAPH ?g {
    ?s a schema:Thing .
  }
}
```

This is read-only provenance. It does not mutate installed sources or implement SPARQL Update.

## HTTP endpoint

The same query engine backs an optional read-only SPARQL HTTP route when `sparql_service.enabled` is on in `wiki.yaml`. Configure keys and path collision rules in [Wiki Configuration](Wiki_Configuration.md#serve-api); request forms and `Accept` negotiation in [wiki serve](wiki_serve.md#sparql-endpoint).

## Related

- [SPARQL](SPARQL.md)
- [wiki graph](wiki_graph.md)
- [wiki render](wiki_render.md)
- [wiki serve](wiki_serve.md#sparql-endpoint)
