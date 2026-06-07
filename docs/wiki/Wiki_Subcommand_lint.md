---
type: TechArticle
name: wiki lint
description: Convention audits for filename patterns and heading style.
---

# `wiki lint`

Run **convention** audits on the vault: filename pattern and heading style.

Exits **0 silently** on success unless `-v` is set. See [Design_Philosophies](Design_Philosophies.md).

## Usage

```bash
wiki lint
wiki lint wiki/Some_Page.md
wiki lint -v
wiki lint --strict
```

## Options

| Flag              | Description                                      |
| ----------------- | ------------------------------------------------ |
| `FILE`            | Optional single markdown document                |
| `-v`, `--verbose` | Print warnings                                   |
| `--strict`        | Treat warnings as errors (exit 1)                |

## What is linted

### Configurable (`lint.*` in `wiki.yaml`)

| Rule key           | What it audits                                                                |
| ------------------ | ----------------------------------------------------------------------------- |
| `filename_pattern` | Full filename vs top-level `filename_pattern` regex (`.md` files only)        |
| `headings`         | Sentence-case headings, numbered headings, thematic `---` in body             |

Each rule is `error`, `warning`, or `off`. Defaults: `filename_pattern` is `warning`; `headings` is `off`.

Route safety errors (spaces, unsafe URL characters) abort lint with errors before convention rules run.

### Single-file mode

`wiki lint path/to/Page.md` runs filename and heading audits for that route only.

## Related CI commands

| Command               | Purpose                           |
| --------------------- | --------------------------------- |
| `wiki check --strict` | SHACL, route safety, broken links |
| `wiki fmt --check`    | mdformat consistency              |
| `wiki render --check` | Stale inline SPARQL result blocks |

`wiki build` runs both `wiki check` and `wiki lint` before writing output unless `--no-check`.

## Related

- [Wiki_Configuration](Wiki_Configuration.md) — `lint.*` severities and config semantics
- [Wiki_Subcommand_check](Wiki_Subcommand_check.md) — integrity lane
- [Style_Guide](Style_Guide.md)
