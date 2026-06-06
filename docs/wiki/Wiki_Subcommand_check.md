---
type: TechArticle
name: wiki check
description: Unified SHACL validation and vault hygiene audits.
---

# `wiki check`

Run strict **SHACL** validation plus configurable hygiene audits on the vault.

Exits **0 silently** on success unless `-v` is set. See [Design_Philosophies](Design_Philosophies.md).

## Usage

```bash
wiki check
wiki check wiki/Some_Page.md
wiki check -v
wiki check --strict
```

## Options

| Flag              | Description                                      |
| ----------------- | ------------------------------------------------ |
| `FILE`            | Optional single document; otherwise entire vault |
| `-v`, `--verbose` | Print warnings                                   |
| `--strict`        | Treat warnings as errors (exit 1)                |

## What is checked

### Always errors (not configurable)

- **SHACL** — shapes from vault frontmatter (`sh:NodeShape`, etc.) on the full RDF graph
- **Route safety** — unsafe path segments (spaces, reserved characters, and similar)
- **Output collisions** — two vault sources mapping to the same built URL

### Configurable (`check.*` in `wiki.yaml`)

| Rule key           | What it audits                                                                |
| ------------------ | ----------------------------------------------------------------------------- |
| `filename_pattern` | Filename stem vs top-level `filename_pattern` regex                           |
| `broken_links`     | Wikilinks, internal markdown links, heading fragments, assets, `wiki:` CURIEs |
| `headings`         | Sentence-case headings, numbered headings, thematic `---` in body             |

Each rule is `error`, `warning`, or `off`. Defaults: `filename_pattern` and `broken_links` are `warning`; `headings` is `off`.

### Single-file mode

`wiki check path/to/Page.md` runs per-file SHACL plus filtered hygiene audits for that route. Cross-document SHACL interactions may only appear in a full-vault check.

### Related CI commands

| Command               | Purpose                           |
| --------------------- | --------------------------------- |
| `wiki fmt --check`    | mdformat consistency              |
| `wiki render --check` | Stale inline SPARQL result blocks |

`wiki build` runs `wiki check` before writing output unless `--no-check`.

## Related

- [Wiki_Configuration](Wiki_Configuration.md) — `check.*` severities
- [Style_Guide](Style_Guide.md)
