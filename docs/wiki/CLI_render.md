---
id: wiki:CLI_render
type: TechArticle
name: wiki render
description: Update inline SPARQL result tables in markdown files.
---

# `wiki render`

Find `<!-- sparql:start -->` … `<!-- sparql:end -->` regions in markdown, run the embedded query against the vault graph, and rewrite the table (or `(no results)`) in place.

Silent on success by default. See [[Design_Philosophies]].

## Usage

```bash
wiki render
wiki render wiki/Report.md
wiki render --glob "wiki/people/*.md"
wiki render -v
wiki render --check
wiki render --no-inference
wiki render --reload
```

## Options

| Flag | Description |
| --- | --- |
| `FILE` | Single `.md` file only |
| `--glob` | Repeatable; limit to matching paths |
| `--check` | Dry-run; exit 1 if any block is stale |
| `--no-inference` | Skip OWL-RL |
| `--reload` | Rebuild graph before rendering |
| `-v`, `--verbose` | Print update counts |

## Block format

See [[Authoring_Guide]] for the `sparql:start` / `sparql:end` wrapper and fenced `sparql` code block.

## Related

- [[Graph_Cache]]
- [[CLI_query]]
