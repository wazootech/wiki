---
type: TechArticle
headline: Graph Cache
description: In-process RDF graph reuse plus optional on-disk warm-start across repeated CLI runs.
---

# Graph Cache

Each `wiki` process builds the wiki RDF graph **once** (unless you pass `--reload`) and reuses it for:

- every [wiki query](wiki_query.md) in that process
- every SPARQL block in [wiki render](wiki_render.md)
- `wiki build --render` when rendering before static output

OWL-RL expansion runs when inference is enabled (default for most commands; use `--no-inference` on `query` / `render` when debugging asserted triples only).

## Cross-process reuse

- By default, a new shell still starts cold.
- Pass `--cache` on [wiki query](wiki_query.md), [wiki render](wiki_render.md), or `wiki build --render` to persist a warm graph under `.wiki/cache/`.
- The persisted graph is reused only when the wiki fingerprint still matches.
- `--reload` forces a fresh build and refreshes the current cache entry.

Queries that use SPARQL `GRAPH` clauses build a named-graph dataset instead of the compatibility union graph. Those dataset cache entries are stored separately as N-Quads so source graph boundaries are preserved.

## Long-lived workflows

[wiki serve](wiki_serve.md) with `--watch` keeps one process alive. On file changes it rebuilds the graph, re-runs SPARQL rendering, and reloads the browser.

## Tradeoffs

- In-process reuse is still the default and simplest model.
- `--cache` helps repeated one-shot commands across fresh shells.
- The disk cache is invalidated automatically on wiki or config changes.
- `.wiki/cache/` is excluded from wiki fingerprinting so cache artifacts do not invalidate themselves.

## CI tips

```bash
wiki render --check            # fail if any inline block is stale
wiki render --cache            # repeated one-shot render loop across shells
wiki build --render --cache    # repeated one-shot render + build loop across shells
wiki query "..."              # same graph as a prior render in one script if you chain in one shell
```

## Related

- [wiki query](wiki_query.md)
- [wiki render](wiki_render.md)
- [wiki serve](wiki_serve.md) — long-lived preview and optional [SPARQL endpoint](wiki_serve.md#sparql-endpoint)
