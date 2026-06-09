---
type: TechArticle
headline: wiki render
description: Update inline SPARQL result tables in markdown files.
---

# `wiki render`

Find \`

<!-- sparql:start -->` … `<!-- sparql:end -->

`regions in markdown, run the embedded query against the vault graph, and rewrite the table (or`(no results)\`) in place.

Silent on success by default. See [Design_Philosophies](Design_Philosophies.md).

## Usage

```bash
wiki render
wiki render wiki/Report.md
wiki render wiki/people/alpha.md wiki/projects/beta.md
wiki render wiki/people/*.md
wiki render -v
wiki render --check
wiki render --no-inference
wiki render --reload
wiki render --cache
```

## Options

| Flag              | Description                                                                             |
| ----------------- | --------------------------------------------------------------------------------------- |
| `FILE...`         | Optional `.md` paths; otherwise entire vault (shell globs expand to multiple FILE args) |
| `--check`         | Dry-run; exit 1 if any block is stale                                                   |
| `--no-inference`  | Skip OWL-RL                                                                             |
| `--reload`        | Rebuild graph before rendering                                                          |
| `--cache`         | Persist a warm graph under `.wiki/cache/` for reuse across new processes                |
| `-v`, `--verbose` | Print update counts                                                                     |

## Block format

See [Style_Guide](Style_Guide.md) for the `sparql:start` / `sparql:end` wrapper and fenced `sparql` code block.

## Related

- [SPARQL](SPARQL.md)
- [Style_Guide](Style_Guide.md) — `sparql:start` / `sparql:end` block format
- [Graph_Cache](Graph_Cache.md)
- [Wiki_Subcommand_query](Wiki_Subcommand_query.md)
- [Wiki_Subcommand_build](Wiki_Subcommand_build.md) — `wiki build --render`
