---
type: TechArticle
name: Design philosophies
description: Unix-style CLI design for the Wiki CLI tool.
---

# Design philosophies

## Silence is golden

[Wiki_Subcommand_check](Wiki_Subcommand_check.md), [Wiki_Subcommand_lint](Wiki_Subcommand_lint.md), [Wiki_Subcommand_render](Wiki_Subcommand_render.md), and similar commands exit **0 with no output** on success. Use `-v` / `--verbose` when you want summaries. In CI, combine `check --strict -v` and `lint --strict -v` so warnings fail loudly.

## Check, lint, fmt, and link

Four audit/format lanes (aligned with common CLI tooling):

| Lane          | Command      | Config / tool        |
| ------------- | ------------ | -------------------- |
| Integrity     | `wiki check` | `check.broken_links` (+ always-on SHACL, routes, collisions) — **report only** |
| Convention    | `wiki lint`  | `lint.filename_pattern`, `lint.headings` |
| Formatting    | `wiki fmt`   | mdformat             |
| Link hygiene  | `wiki link`  | Optional `link_renames`; `--apply` and `--fix-broken` require explicit flags |

`wiki check` answers whether the vault is **valid** — it never mutates prose. `wiki link` answers whether plain text **should be a wikilink** (`--apply`) or whether a broken target reported by `check` can be **repaired safely** (`--fix-broken`). Heuristic link enrichment is not a style convention, so it does not live under `wiki lint`.

`wiki build` runs integrity and convention preflight (`check` then `lint`) unless `--no-check`. `wiki link` is never part of that preflight.

## Pipes and filters

The CLI does not print to paper or own format-specific drivers. Instead, it writes raw formats (**table**, **json**, **csv**, **turtle**, etc.) to standard output, making it highly composable with standard system tools.

### Unix/macOS (using `pr` and `lp`/`lpr`)

To format page margins and headers before sending directly to a connected printer:

```bash
# Print a document
cat wiki/Getting_Started.md | pr -h "Getting Started" | lp

# Print SPARQL query results
wiki query "SELECT ?name WHERE { ?s schema:name ?name }" | pr -h "Wiki Names" | lp
```

### Windows (using PowerShell `Out-Printer`)

To stream content directly to your default Windows printer:

```powershell
# Print a document
Get-Content wiki/Getting_Started.md | Out-Printer

# Print SPARQL query results
wiki query "SELECT ?name WHERE { ?s schema:name ?name }" | Out-Printer
```

## Flat command surface

Subcommands are top-level (`wiki check`, not `wiki vault check`). Global options [Wiki_CLI](Wiki_CLI.md#global-options) apply everywhere.

## Userland over platform lock-in

Printing, PDF, and heavy formatting stay in your shell (`pr`, `lp`, Pandoc, etc.). The wiki tool focuses on graph construction, validation, and site generation.
