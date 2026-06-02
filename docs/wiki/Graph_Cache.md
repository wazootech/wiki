---
type: TechArticle
name: Graph cache
description: In-process RDF graph reuse across query and render in one CLI run.
---

# Graph cache

Each `wiki` process builds the vault RDF graph **once** (unless you pass `--reload`) and reuses it for:

- every [Wiki_Subcommand_query](Wiki_Subcommand_query.md) in that process
- every SPARQL block in [Wiki_Subcommand_render](Wiki_Subcommand_render.md)
- `wiki build --render` when rendering before static output

OWL-RL expansion runs when inference is enabled (default for most commands; use `--no-inference` on `query` / `render` when debugging asserted triples only).

## What is not cached

- There is **no on-disk** graph cache. A new shell always loads from vault files.
- `--reload` forces a fresh build in the **same** process after you change sources mid-session.

## Long-lived workflows

`wiki serve --watch` keeps one process alive. On file changes it rebuilds the graph, re-runs SPARQL rendering, and reloads the browser.

## CI tips

```bash
wiki render --check    # fail if any inline block is stale
wiki query "..."       # same graph as a prior render in one script if you chain in one shell
```

## Related

- [Wiki_Subcommand_query](Wiki_Subcommand_query.md)
- [Wiki_Subcommand_render](Wiki_Subcommand_render.md)
