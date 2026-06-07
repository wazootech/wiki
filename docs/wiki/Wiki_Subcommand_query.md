---
type: TechArticle
label: wiki query
comment: Run SPARQL SELECT or CONSTRUCT against the vault graph.
---

# `wiki query`

Execute **SPARQL** against the loaded vault graph (with OWL-RL inference unless `--no-inference`).

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

| Flag              | Description                                                              |
| ----------------- | ------------------------------------------------------------------------ |
| `QUERY`           | SPARQL string, or omit to read stdin                                     |
| `-f`, `--format`  | `table` (default), `json`, `csv`, `tsv`, `turtle`, `n3`, `markdown`      |
| `-o`, `--output`  | Write results to a file                                                  |
| `--pretty`        | Rich table for SELECT results (stdout only; requires `-f table`)         |
| `--no-inference`  | Skip OWL-RL                                                              |
| `--reload`        | Rebuild in-memory graph in this process                                  |
| `--cache`         | Persist a warm graph under `.wiki/cache/` for reuse across new processes |
| `--jq`            | Filter JSON output (implies `-f json`)                                   |
| `-v`, `--verbose` | Print triple/subject counts first                                        |

## Inspect one document

Use `--pretty` with a subject-focused SELECT to peek at frontmatter triples in the terminal. Markdown body and typed infobox layout are not reproduced — use [Wiki_Subcommand_serve](Wiki_Subcommand_serve.md) for full page preview.

```bash
wiki query --pretty "SELECT ?property ?value WHERE {
  wiki:Gregory_Davidson ?property ?value .
}"
```

## Graph reuse

See [Graph_Cache](Graph_Cache.md) — one graph per process unless `--reload`, plus optional cross-process warm-start via `--cache`.

## Related

- [SPARQL](SPARQL.md)
- [Wiki_Subcommand_render](Wiki_Subcommand_render.md)
