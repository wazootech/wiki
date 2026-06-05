---
type: TechArticle
name: wiki query
description: Run SPARQL SELECT or CONSTRUCT against the vault graph.
---

# `wiki query`

Execute **SPARQL** against the loaded vault graph (with OWL-RL inference unless `--no-inference`).

## Usage

```bash
wiki query "SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 10"
cat query.sparql | wiki query -f json
wiki query "SELECT ?name WHERE { ?s schema:name ?name }" --jq 'results.bindings[].name.value'
wiki query "..." --reload -v
wiki query "..." --cache
```

## Options

| Flag              | Description                                                         |
| ----------------- | ------------------------------------------------------------------- |
| `QUERY`           | SPARQL string, or omit to read stdin                                |
| `-f`, `--format`  | `table` (default), `json`, `csv`, `tsv`, `turtle`, `n3`, `markdown` |
| `-o`, `--output`  | Write results to a file                                             |
| `--no-inference`  | Skip OWL-RL                                                         |
| `--reload`        | Rebuild in-memory graph in this process                             |
| `--cache`         | Persist a warm graph under `.wiki/cache/` for reuse across new processes |
| `--jq`            | Filter JSON output (implies `-f json`)                              |
| `-v`, `--verbose` | Print triple/subject counts first                                   |

## Graph reuse

See [Graph_Cache](Graph_Cache.md) — one graph per process unless `--reload`, plus optional cross-process warm-start via `--cache`.

## Related

- [SPARQL](SPARQL.md)
- [Wiki_Subcommand_render](Wiki_Subcommand_render.md)
