---
type: TechArticle
headline: Design Philosophies
description: Unix-style CLI design for the Wiki CLI tool.
---

# Design Philosophies

## Silence is golden

[wiki check](wiki_check.md), [wiki lint](wiki_lint.md), [wiki render](wiki_render.md), and similar commands exit **0 with no output** on success. Use `-v` / `--verbose` when you want summaries. In CI, combine `check --strict -v` and `lint --strict -v` so warnings fail loudly.

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

# Print SPARQL query results ([wiki query](wiki_query.md), [SPARQL](SPARQL.md))
wiki query "SELECT ?given ?family WHERE { ?s schema:givenName ?given ; schema:familyName ?family }" | pr -h "Wiki People" | lp
```

### Windows (using PowerShell `Out-Printer`)

To stream content directly to your default Windows printer:

```powershell
# Print a document
Get-Content wiki/Getting_Started.md | Out-Printer

# Print SPARQL query results ([wiki query](wiki_query.md), [SPARQL](SPARQL.md))
wiki query "SELECT ?given ?family WHERE { ?s schema:givenName ?given ; schema:familyName ?family }" | Out-Printer
```

## Flat command surface

Subcommands are top-level (`wiki check`, not `wiki wiki check`). Global options [wiki](wiki.md#global-options) apply everywhere.

## Userland over platform lock-in

Printing, PDF, and heavy formatting stay in your shell (`pr`, `lp`, Pandoc, etc.). Daily notes, note templates, vault search, task/tag dashboards, plugin reloads, DevTools, screenshots, DOM/CSS inspection, and sync belong to Obsidian CLI or Obsidian plugins. History and collaboration belong to Git. The wiki tool focuses on graph construction, validation, and site generation. [Wiki CLI templates](wiki.md#ecosystem-templates) and editor integrations stay at the edges; core scope is the semantic layer — see [wiki](wiki.md#toolchain-vs-authoring-surface).

## Why RDF and SPARQL

While Labeled Property Graphs (LPGs) and query languages like Cypher are popular for structured databases, the semantic stack (RDF, SPARQL, and SHACL) is uniquely suited as the abstraction layer for personal knowledge and agentic memory:

- **Open-world flexibility**: RDF operates on the Open-World Assumption (OWA). Agents can dynamically define new relationships (predicates) and classes on the fly without needing to alter database schemas or validate against rigid table columns.
- **Global namespace and seamless merging**: Because entities and predicates are identified by global URIs, graphs compiled from separate directories, vaults, or distinct agents can be merged mathematically into a single model with zero identity conflicts or custom mapping logic.
- **Edge-native execution**: The RDF ecosystem provides highly optimized, standard query engines (like Comunica) that execute queries directly in client-side runtimes (browsers, local shells, edge functions) over embedded formats. Translating property graph queries (like Cypher) locally requires heavy external database engines, defeating the lightweight, offline-first design of the toolchain.

## Related

- [wiki](wiki.md)
- [RDF](RDF.md)
- [SPARQL](SPARQL.md)
- [LLM Wiki](LLM_Wiki.md)
