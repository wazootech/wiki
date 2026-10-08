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

| Lane         | Command      | Config / tool                                                                                                                                                                                                            |
| ------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Integrity    | `wiki check` | Always-on SHACL, JSON Schema frontmatter, routes, collisions, layout frontmatter (`check.*`) — **report only**                                                                                                           |
| Convention   | `wiki lint`  | `lint.heading_levels` + `lint.duplicate_headings` via the embedded ESLint engine; `lint.broken_links`, `lint.filename_pattern`, `lint.headings`, `lint.thematic_breaks`, `lint.link_style` Wiki-native — **report only** |
| Formatting   | `wiki fmt`   | Deno Markdown formatter (`@dprint/markdown`)                                                                                                                                                                             |
| Link hygiene | `wiki link`  | Optional `link.renames`; `--apply` and `--fix-broken` require explicit flags                                                                                                                                             |

`wiki check` answers whether the wiki satisfies its **integrity contracts** (graph shapes and build/presentation invariants) — it never mutates prose. `wiki lint` answers whether content follows **wiki policy** (resolvable references and authoring conventions). `wiki link` answers whether plain text **should be a wikilink** (`--apply`) or whether a broken target reported by `lint` can be **repaired safely** (`--fix-broken`). Heuristic link enrichment is not a style convention, so it does not live under `wiki lint`.

`wiki build` runs convention then integrity preflight (`lint` then `check`) unless `--no-check`. `wiki link` is never part of that preflight.

### Mechanical rules come from ESLint; graph rules stay ours

`wiki lint` splits by whether a rule is mechanical or semantic.

**Mechanical** — heading depth increments and duplicate headings are evaluated by the **embedded ESLint engine**. Wiki constructs an in-process `ESLint` instance over `@eslint/markdown`'s `markdown/heading-increment` and `markdown/no-duplicate-headings` rules, then maps the diagnostics into Wiki's existing issue codes and severity report. There is no external ESLint config, no `.eslintrc`, and no subprocess: a rule that only needs the Markdown AST should not require the user to adopt ESLint's configuration model.

**Semantic** — broken links, `wiki:` CURIE resolution, filename patterns, editorial heading style, Setext-aware thematic breaks, and link style remain hand-written in Wiki. The dividing line is not how mechanical a rule feels but **what input it needs**: an ESLint rule receives one file's text and a rule context, whereas these read the resolved `Config` and the route table. `lint_broken_links` resolves `wiki:` CURIEs, routes, and `link.renames` to decide whether a target exists — state no amount of Markdown AST provides.

**Why not a Wiki ESLint plugin.** A plugin does not change that boundary. Its rules still receive `(node, context)` per file, so the route graph would have to be threaded through ESLint's context on every file: the same logic as `lint_broken_links`, behind a worse interface, plus a second dispatch layer to maintain. The embedded engine is kept because it earns its place on rules whose only input is text; the graph rules stay where their input lives.

Of the graph-adjacent rules, `thematic_breaks` is the one genuinely mechanical case with no graph dependency — it stays hand-written only because `@eslint/markdown` 8.0.3 ships no rule for it (verified: its 21 rules cover headings, links, fences, and definitions, none for thematic breaks).

Wiki keeps its own bookkeeping on top of the ESLint lane: the duplicate rule's H2+ scope and heading normalization, and the exact message wording the Python oracle emitted. See [wiki lint](wiki_lint.md) for the per-key detail.

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
