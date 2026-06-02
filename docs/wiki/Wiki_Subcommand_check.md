---
type: TechArticle
name: wiki check
description: Unified SHACL validation and vault hygiene audits.
---

# `wiki check`

Run strict **SHACL** validation plus configurable hygiene audits (filenames, internal links, markdown flavor).

Exits **0 silently** on success unless `-v` is set. See [Design_Philosophies](Design_Philosophies.md).

## Usage

```bash
wiki check
wiki check wiki/Some_Page.md
wiki check -v
wiki check --strict
wiki check --fix
```

## Options

| Flag              | Description                                      |
| ----------------- | ------------------------------------------------ |
| `FILE`            | Optional single document; otherwise entire vault |
| `--fix`           | Rename files to safe slugs and rewrite wikilinks |
| `-v`, `--verbose` | Print warnings                                   |
| `--strict`        | Treat warnings as errors (exit 1)                |

## What is checked

- **SHACL** — shapes from vault frontmatter (`sh:NodeShape`, etc.)
- **Filenames** — `filenamePattern` (Wikipedia-style by default in examples) and always-on route safety
- **Links** — Obsidian-style wikilinks and internal markdown links
- **Flavor** — wikilinks in `gfm` mode

`wiki build` runs the same checks before writing output unless `--no-check`.

## Related

- [Wiki_Configuration](Wiki_Configuration.md) — `check.*` severities
- [Style_Guide](Style_Guide.md)
