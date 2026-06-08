---
type: TechArticle
headline: wiki check
description: Integrity checks — SHACL validation, route safety, and layout frontmatter.
---

# `wiki check`

Run **integrity** checks on the vault: strict **SHACL** validation, route safety, output collisions, and layout frontmatter contracts.

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

### Full vault (default)

`wiki check` with no `FILE` argument runs every check below.

### Always errors (not configurable)

- **SHACL** — shapes from vault frontmatter (`sh:NodeShape`, etc.) on the full RDF graph
- **Route safety** — unsafe path segments (spaces, reserved characters, and similar)
- **Output collisions** — two vault sources mapping to the same built URL (against default `_site` layout)

### Configurable (`check.*` in `wiki.yaml`)

| Rule key                | What it audits                                                               |
| ----------------------- | ---------------------------------------------------------------------------- |
| `forbidden_layout_keys` | Legacy `template` / `wiki:template` frontmatter (use `wazoo:layout` instead) |
| `missing_layout_file`   | `wazoo:layout` paths that do not resolve to a readable `.html` file          |

Defaults: both layout rules are `error`.

Broken links, filename pattern, and heading style are **not** part of `wiki check` — use [Wiki_Subcommand_lint](Wiki_Subcommand_lint.md).

### Single-file mode

`wiki check path/to/Page.md` runs **SHACL only** for that route. Route safety, output collisions, and layout frontmatter rules are **full-vault only**. Cross-document SHACL interactions may only appear in a full-vault check. Broken links on that page require `wiki lint path/to/Page.md`.

`--strict` applies only when warnings exist; single-file mode does not emit warnings today.

### Related CI commands

| Command               | Purpose                                              |
| --------------------- | ---------------------------------------------------- |
| `wiki lint --strict`  | Broken links, filename pattern, headings, link style |
| `wiki fmt --check`    | mdformat consistency                                 |
| `wiki render --check` | Stale inline SPARQL result blocks                    |
| `wiki link --check`   | Remaining missing-wikilink opportunities             |

`wiki build` runs `wiki lint` then `wiki check` before writing output unless `--no-check`.

## Related

- [Wiki_Configuration](Wiki_Configuration.md) — `check.*` severities
- [Wiki_Subcommand_lint](Wiki_Subcommand_lint.md) — convention lane
- [Style_Guide](Style_Guide.md)
