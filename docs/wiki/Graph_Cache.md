---
type: TechArticle
headline: Graph cache
description: In-process RDF graph reuse plus optional on-disk warm-start across repeated CLI runs.
---

# Graph cache

Each `wiki` process builds the vault RDF graph **once** (unless you pass `--reload`) and reuses it for:

- every [Wiki_Subcommand_query](Wiki_Subcommand_query.md) in that process
- every SPARQL block in [Wiki_Subcommand_render](Wiki_Subcommand_render.md)
- `wiki build --render` when rendering before static output

OWL-RL expansion runs when inference is enabled (default for most commands; use `--no-inference` on `query` / `render` when debugging asserted triples only).

## Cross-process reuse

- By default, a new shell still starts cold.
- Pass `--cache` on [Wiki_Subcommand_query](Wiki_Subcommand_query.md), [Wiki_Subcommand_render](Wiki_Subcommand_render.md), or `wiki build --render` to persist a warm graph under `.wiki/cache/`.
- The persisted graph is reused only when the vault fingerprint still matches.
- `--reload` forces a fresh build and refreshes the current cache entry.

## Long-lived workflows

`wiki serve --watch` keeps one process alive. On file changes it rebuilds the graph, re-runs SPARQL rendering, and reloads the browser.

## Tradeoffs

- In-process reuse is still the default and simplest model.
- `--cache` helps repeated one-shot commands across fresh shells.
- The disk cache is invalidated automatically on vault or config changes.
- `.wiki/cache/` is excluded from vault fingerprinting so cache artifacts do not invalidate themselves.

## CI tips

```bash
wiki render --check            # fail if any inline block is stale
wiki render --cache            # repeated one-shot render loop across shells
wiki build --render --cache    # repeated one-shot render + build loop across shells
wiki query "..."              # same graph as a prior render in one script if you chain in one shell
```

## Related

- [Wiki_Subcommand_query](Wiki_Subcommand_query.md)
- [Wiki_Subcommand_render](Wiki_Subcommand_render.md)
