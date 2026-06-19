---
type: TechArticle
headline: Design Philosophies
description: Unix-style CLI design for the Wiki CLI tool.
---

# Design Philosophies

## Silence is golden

[Wiki Subcommand check](Wiki_Subcommand_check.md), [Wiki Subcommand lint](Wiki_Subcommand_lint.md), [Wiki Subcommand render](Wiki_Subcommand_render.md), and similar commands exit **0 with no output** on success. Use `-v` / `--verbose` when you want summaries. In CI, combine `check --strict -v` and `lint --strict -v` so warnings fail loudly.

## Check, lint, fmt, and link

Four audit/format lanes (aligned with common CLI tooling):

| Lane         | Command      | Config / tool                                                                                                                                                                |
| ------------ | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Integrity    | `wiki check` | Always-on SHACL, JSON Schema frontmatter, routes, collisions, layout frontmatter (`check.*`) — **report only**                                                               |
| Convention   | `wiki lint`  | `lint.broken_links`, `lint.filename_pattern`, `lint.headings`, `lint.heading_levels`, `lint.duplicate_headings`, `lint.thematic_breaks`, `lint.link_style` — **report only** |
| Formatting   | `wiki fmt`   | mdformat                                                                                                                                                                     |
| Link hygiene | `wiki link`  | Optional `link.renames`; `--apply` and `--fix-broken` require explicit flags                                                                                                 |

`wiki check` answers whether the wiki satisfies its **integrity contracts** (graph shapes and build/presentation invariants) — it never mutates prose. `wiki lint` answers whether content follows **wiki policy** (resolvable references and authoring conventions). `wiki link` answers whether plain text **should be a wikilink** (`--apply`) or whether a broken target reported by `lint` can be **repaired safely** (`--fix-broken`). Heuristic link enrichment is not a style convention, so it does not live under `wiki lint`.

`wiki build` runs convention then integrity preflight (`lint` then `check`) unless `--no-check`. `wiki link` is never part of that preflight.

## Pipes and filters

The CLI does not print to paper or own format-specific drivers. Instead, it writes raw formats (**table**, **json**, **csv**, **turtle**, etc.) to standard output, making it highly composable with standard system tools.

### Unix/macOS (using `pr` and `lp`/`lpr`)

To format page margins and headers before sending directly to a connected printer:

```bash
# Print a document
cat wiki/Getting_Started.md | pr -h "Getting Started" | lp

# Print SPARQL query results ([Wiki Subcommand query](Wiki_Subcommand_query.md), [SPARQL](SPARQL.md))
wiki query "SELECT ?given ?family WHERE { ?s schema:givenName ?given ; schema:familyName ?family }" | pr -h "Wiki People" | lp
```

### Windows (using PowerShell `Out-Printer`)

To stream content directly to your default Windows printer:

```powershell
# Print a document
Get-Content wiki/Getting_Started.md | Out-Printer

# Print SPARQL query results ([Wiki Subcommand query](Wiki_Subcommand_query.md), [SPARQL](SPARQL.md))
wiki query "SELECT ?given ?family WHERE { ?s schema:givenName ?given ; schema:familyName ?family }" | Out-Printer
```

## Flat command surface

Subcommands are top-level (`wiki check`, not `wiki wiki check`). Global options [Wiki CLI](Wiki_CLI.md#global-options) apply everywhere.

## Userland over platform lock-in

Printing, PDF, and heavy formatting stay in your shell (`pr`, `lp`, Pandoc, etc.). Daily notes, note templates, vault search, task/tag dashboards, plugin reloads, DevTools, screenshots, DOM/CSS inspection, and sync belong to Obsidian CLI or Obsidian plugins. History and collaboration belong to Git. The wiki tool focuses on graph construction, validation, and site generation. [Wiki CLI templates](Wiki_CLI.md#ecosystem-templates) and editor integrations stay at the edges; core scope is the semantic layer — see [Wiki CLI](Wiki_CLI.md#toolchain-vs-authoring-surface).

## Related

- [Wiki CLI](Wiki_CLI.md)
