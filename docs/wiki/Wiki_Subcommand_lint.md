---
type: TechArticle
headline: wiki lint
description: Convention audits for filename patterns, heading style, and internal link style.
---

# `wiki lint`

Run **convention** audits on the vault: filename pattern, heading style, and internal link style.

Exits **0 silently** on success unless `-v` is set. See [Design_Philosophies](Design_Philosophies.md).

## Usage

```bash
wiki lint
wiki lint wiki/Some_Page.md
wiki lint -v
wiki lint --strict
```

## Options

| Flag              | Description                       |
| ----------------- | --------------------------------- |
| `FILE`            | Optional single markdown document |
| `-v`, `--verbose` | Print warnings                    |
| `--strict`        | Treat warnings as errors (exit 1) |

## What is linted

### Configurable (`lint.*` in `wiki.yaml`)

| Rule key           | What it audits                                                                                       |
| ------------------ | ---------------------------------------------------------------------------------------------------- |
| `filename_pattern` | Full filename vs top-level `filename_pattern` regex (`.md` files only)                               |
| `headings`         | ATX `#` headings only (no Setext), sentence-case H2+ (H1 title case conventional), numbered headings |
| `thematic_breaks`  | Horizontal rules (`---`, `***`, `___`) in body prose                                                 |
| `link_style`       | Wikilinks in body prose when top-level `link_style` is `markdown`                                    |

Each rule is `error`, `warning`, or `off`. Defaults: `filename_pattern` and `link_style` are `warning`; `headings` and `thematic_breaks` are `off`.

Route safety errors (spaces, unsafe URL characters) abort lint with errors before convention rules run.

### Single-file mode

`wiki lint path/to/Page.md` runs filename, heading, and link-style audits for that route only.

## Related CI commands

| Command               | Purpose                                 |
| --------------------- | --------------------------------------- |
| `wiki fmt --check`    | mdformat consistency (`.mdformat.toml`) |
| `wiki lint --strict`  | Editorial conventions (`lint:` in yaml) |
| `wiki check --strict` | SHACL, route safety, broken links       |
| `wiki render --check` | Stale inline SPARQL result blocks       |

Run in that order in CI so mechanical fixes land before editorial and integrity checks.

`wiki build` runs both `wiki check` and `wiki lint` before writing output unless `--no-check`.

## Related

- [Wiki_Configuration](Wiki_Configuration.md) — `lint.*` severities and config semantics
- [Wiki_Subcommand_check](Wiki_Subcommand_check.md) — integrity lane
- [Style_Guide](Style_Guide.md)
