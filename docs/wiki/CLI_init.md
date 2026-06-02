---
id: wiki:CLI_init
type: TechArticle
name: wiki init
description: Scaffold wiki.yaml and starter wiki pages interactively.
---

# `wiki init`

Create a new workspace in the **current directory**: `wiki.yaml` plus starter files under `wiki/`.

Does not use loaded WikiConfig; safe to run before a config exists.

## Usage

```bash
wiki init
wiki init --force
```

## Options

| Flag | Description |
| --- | --- |
| `--force` | Overwrite existing `wiki.yaml` or non-empty `wiki/` |

## Prompts

1. **Custom base URI prefix** (default `https://wiki.example.org/`) → `wikiBase` and `wiki:` in `context`
2. **Include foaf prefix?** (default yes)
3. **Include dc/dcterms prefixes?** (default yes)

Always includes `schema` and `wiki` prefixes.

## Generated config

- `inputDirs: [wiki]`
- `markdownFlavor: obsidian`
- `baseUrl: /wiki`, `urlStyle: dir`
- `check` rules at `warning` for filename, links, and flavor

## Generated pages

- `wiki/index.md` — vault home (`wiki:index`)
- `wiki/Person_Shape.md` — starter `sh:NodeShape` for `schema:Person` with optional `wiki:template`

## Related

- [[Getting_Started]]
- [[Wiki_Configuration]]
