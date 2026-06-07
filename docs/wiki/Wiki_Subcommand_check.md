---
type: TechArticle
name: wiki check
description: Integrity checks — SHACL validation, route safety, and broken links.
---

# `wiki check`

Run **integrity** checks on the vault: strict **SHACL** validation, route safety, output collisions, and broken links.

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

| Rule key       | What it audits                                                                |
| -------------- | ----------------------------------------------------------------------------- |
| `broken_links` | Wikilinks, internal markdown links, heading fragments, assets, `wiki:` CURIEs |

Default: `broken_links` is `warning`.

`wiki check` reports broken links only — it does not repair them. Use [Wiki_Subcommand_link](Wiki_Subcommand_link.md) `--fix-broken` for unambiguous repairs (rename map, unique fuzzy slug, or heading match).

Filename pattern and heading style are **not** part of `wiki check` — use [Wiki_Subcommand_lint](Wiki_Subcommand_lint.md).

### Single-file mode

`wiki check path/to/Page.md` runs per-file SHACL plus broken-link audits for that route. Cross-document SHACL interactions may only appear in a full-vault check.

### Related CI commands

| Command               | Purpose                                  |
| --------------------- | ---------------------------------------- |
| `wiki lint --strict`  | Filename pattern and headings            |
| `wiki fmt --check`    | mdformat consistency                     |
| `wiki render --check` | Stale inline SPARQL result blocks        |
| `wiki link --check`   | Remaining missing-wikilink opportunities |

`wiki build` runs `wiki check` and `wiki lint` before writing output unless `--no-check`.

## Related

- [Wiki_Configuration](Wiki_Configuration.md) — `check.*` severities
- [Wiki_Subcommand_lint](Wiki_Subcommand_lint.md) — convention lane
- [Style_Guide](Style_Guide.md)
