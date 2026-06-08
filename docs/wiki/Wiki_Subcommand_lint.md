---
type: TechArticle
headline: wiki lint
description: Convention audits for broken links, filename patterns, heading style, and internal link style.
---

# `wiki lint`

Run **convention** audits on the vault: broken links, filename pattern, heading style, and internal link style.

Exits **0 silently** on success unless `-v` is set. See [Design_Philosophies](Design_Philosophies.md).

## Usage

```bash
wiki lint
wiki lint wiki/Some_Page.md
wiki lint wiki/A.md wiki/B.md
wiki lint -v
wiki lint --strict
```

## Options

| Flag              | Description                                     |
| ----------------- | ----------------------------------------------- |
| `FILE...`         | Optional markdown paths; otherwise entire vault |
| `-v`, `--verbose` | Print warnings                                  |
| `--strict`        | Treat warnings as errors (exit 1)               |

## What is linted

### Configurable (`lint.*` in `wiki.yaml`)

| Rule key             | What it audits                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| `broken_links`       | Wikilinks, internal markdown links, heading fragments, assets, `wiki:` CURIEs                    |
| `filename_pattern`   | Full filename vs top-level `filename_pattern` regex (`.md` files only)                           |
| `headings`           | Sentence-case H2+ (H1 title case conventional), numbered headings (ATX syntax is **`wiki fmt`**) |
| `heading_levels`     | Heading depth must increase by one level at a time (MD001-inspired)                              |
| `duplicate_headings` | Duplicate H2+ heading text in the same document (MD024-inspired)                                 |
| `thematic_breaks`    | Horizontal rules (`---`, `***`, `___`) in body prose                                             |
| `link_style`         | Wikilinks in body prose when top-level `link_style` is `markdown`                                |

Each rule is `error`, `warning`, or `off`. Defaults: `broken_links`, `filename_pattern`, and `link_style` are `warning`; `headings`, `heading_levels`, `duplicate_headings`, and `thematic_breaks` are `off`.

`wiki lint` reports broken links only — it does not repair them. Use [Wiki_Subcommand_link](Wiki_Subcommand_link.md) `--fix-broken` for unambiguous repairs (rename map, unique fuzzy slug, or heading match).

Route safety errors (spaces, unsafe URL characters) abort lint with errors before convention rules run.

### Single-file mode

`wiki lint path/to/Page.md` runs broken-link, filename, heading, and link-style audits for that route only.

## Related CI commands

| Command               | Purpose                                                       |
| --------------------- | ------------------------------------------------------------- |
| `wiki fmt --check`    | mdformat consistency (`fmt:` in wiki config or fallback TOML) |
| `wiki lint --strict`  | Conventions (`lint:` in yaml)                                 |
| `wiki check --strict` | SHACL, route safety, layout frontmatter                       |
| `wiki render --check` | Stale inline SPARQL result blocks                             |

Run in that order in CI: `fmt`, then `lint`, then `check` — so mechanical fixes land before conventions and integrity checks.

`wiki build` runs `wiki lint` then `wiki check` before writing output unless `--no-check`.

## Related

- [Wiki_Configuration](Wiki_Configuration.md) — `lint.*` severities and config semantics
- [Wiki_Subcommand_check](Wiki_Subcommand_check.md) — integrity lane
- [Style_Guide](Style_Guide.md)
