---
type: schema:SoftwareApplication
name: Wiki CLI
softwareVersion: 0.1.13
description: Command-line interface for querying, validating, and publishing semantic markdown wikis.
---

# Wiki CLI

This page is the **documentation home** for **Wiki CLI** (`wiki` on PyPI as [**`wazootech-wiki`**](https://pypi.org/project/wazootech-wiki/)): the semantic knowledge **toolchain** for Markdown vaults — validate with [SHACL](SHACL.md), infer and query with [SPARQL](SPARQL.md), and publish static HTML. It compiles vaults into RDF and sits **beneath** note apps and LLM-assisted workflows — progressive enhancement, not a migration.

```bash
pip install wazootech-wiki
wiki --help
```

## Quickstart

```bash
pip install wazootech-wiki
mkdir my-wiki && cd my-wiki
wiki init
wiki check
wiki lint
wiki serve
```

See [Getting_Started](Getting_Started.md) for a full walkthrough.

## What wiki is

- The **compiler / validator / query engine** for Markdown knowledge bases with semantic frontmatter
- An **OOTB wiki builder** — links, navigation, SHACL checks, SPARQL, and static HTML from a folder of `.md` files
- A **sidecar memory layer** — ingest or watch an existing vault without owning the editor
- **Interop-first** — works alongside [Obsidian](Obsidian_Integration.md), [LLM Wiki](LLM_Wiki.md) setups, and any Markdown editor

Adoption path: `wiki init` → `wiki check` → `wiki serve`, then add `lint`, `query`, `render`, and `build` as the vault matures.

## What wiki is not

- The **primary editor** or daily note-taking surface
- A **replacement** for Obsidian, Logseq, or another vault UI
- A **note app clone**, CMS, or authenticated multi-user web product
- An **auth layer** — local-first CLI and static publish; see deferred scope in [ecosystem templates](#ecosystem-templates) below

Humans and agents keep writing where they already write. `wiki` makes that content **trustworthy** (SHACL + conventions), **searchable** (SPARQL + OWL-RL), and **publishable** (static HTML, JSON-LD, Turtle, optional read-only SPARQL over `wiki serve`).

## Toolchain vs authoring surface

| Layer                   | Role                                                                    | Examples                                                    |
| ----------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------- |
| Authoring surface       | Create and edit Markdown                                                | Obsidian, agent-driven LLM wiki, VS Code, any editor        |
| Wiki CLI semantic layer | Compile vault → RDF graph; check, lint, fmt; query; render; build/serve | `wiki check`, `wiki query`, `wiki build`                    |
| Outputs                 | Deployable artifacts                                                    | GitHub Pages HTML, export files, `/api/sparql` when enabled |

This separation is intentional: the strongest differentiator is the **machine layer** (SHACL, OWL-RL, SPARQL, typed HTML) that most note apps do not provide. Wiki CLI avoids competing with editor-centric tools while making incremental adoption obvious.

## Interop-first workflows

### Obsidian

Run `wiki` against the folder that contains `wiki.yaml`. Use Shell Commands for on-save `wiki check`, hotkey `wiki render`, or `wiki serve --watch` for preview. Details: [Obsidian integration](Obsidian_Integration.md).

### LLM wikis

Treat the vault as a compounding codebase agents maintain over time. Structured frontmatter and link conventions make SPARQL and SHACL meaningful on agent output. Pattern overview: [LLM Wiki](LLM_Wiki.md).

### Plain Markdown

No Obsidian or agent stack required. `wiki init` scaffolds a vault; conventions are documented in [Style_Guide](Style_Guide.md).

## Three beats of the CLI

| Beat         | Commands                    | Value                                            |
| ------------ | --------------------------- | ------------------------------------------------ |
| Trust        | `check`, `lint`, `fmt`      | Integrity contracts and authoring conventions    |
| Intelligence | `query`, `render`, `export` | SPARQL, inline result blocks, RDF serializations |
| Publish      | `build`, `serve`, `link`    | Static site, local preview, wikilink hygiene     |

Design rationale for silence, pipes, and flat subcommands: [Design philosophies](Design_Philosophies.md).

## Ecosystem templates

| Template                                                                                                                                                                                                      | Purpose                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| [wiki-example](https://github.com/wazootech/wiki-example)                                                                                                                                                     | Starter vault                                                                    |
| [wiki-sparql-sandbox](https://github.com/wazootech/wiki-sparql-sandbox)                                                                                                                                       | YASGUI + sample vault or live endpoint — see [SPARQL Sandbox](SPARQL_Sandbox.md) |
| [#15](https://github.com/wazootech/wiki/issues/15) Next.js viewer, [#16](https://github.com/wazootech/wiki/issues/16) Obsidian + Quartz, [#31](https://github.com/wazootech/wiki/issues/31) Mintlify/Holocron | Planned — separate template initiatives, not core CLI scope                      |

## Features

- **Check** — SHACL integrity, route safety, layout frontmatter ([Wiki_Subcommand_check](Wiki_Subcommand_check.md))
- **Lint** — broken links, filename pattern, and heading conventions ([Wiki_Subcommand_lint](Wiki_Subcommand_lint.md))
- **Link** — suggest missing wikilinks and repair broken internal links ([Wiki_Subcommand_link](Wiki_Subcommand_link.md))
- **Fmt** — mdformat for markdown ([Wiki_Subcommand_fmt](Wiki_Subcommand_fmt.md))
- **Query** — SPARQL with OWL-RL and optional `--pretty` Rich tables ([Wiki_Subcommand_query](Wiki_Subcommand_query.md), [Graph_Cache](Graph_Cache.md))
- **Render** — live tables from inline SPARQL ([Wiki_Subcommand_render](Wiki_Subcommand_render.md))
- **Build / serve** — static site, local preview, and optional read-only SPARQL endpoint ([Wiki_Subcommand_build](Wiki_Subcommand_build.md), [Wiki_Subcommand_serve](Wiki_Subcommand_serve.md#sparql-endpoint))
- **Export** — JSON-LD and RDF serializations ([Wiki_Subcommand_export](Wiki_Subcommand_export.md))
- **Init** — scaffold `wiki.yaml` ([Wiki_Subcommand_init](Wiki_Subcommand_init.md))
- **Upgrade** — PyPI updates ([Wiki_Subcommand_upgrade](Wiki_Subcommand_upgrade.md))

## Agent skills

Procedural knowledge for coding agents: [Wiki_Skills](Wiki_Skills.md) (`skills/wiki-install`, `skills/wiki-create`, `skills/wiki-best-practices` in the repository).

## Start here

- [Getting_Started](Getting_Started.md) — install, `wiki init`, first `check` and `serve`
- [Wiki_Configuration](Wiki_Configuration.md) — `wiki.yaml` options
- [Style_Guide](Style_Guide.md) — frontmatter, shapes, internal links, SPARQL blocks
- [Graph_Cache](Graph_Cache.md) — in-process RDF graph reuse
- [Design_Philosophies](Design_Philosophies.md) — silence is golden, pipes, flat commands

## Global Options

These options apply to config-loading subcommands (`check`, `lint`, `link`, `query`, `render`, `build`, `export`, `serve`, `fmt`). `init` and `upgrade` do not load `wiki.yaml`.

### `-c, --config PATH`

Path to `wiki.yaml`, `wiki.yml`, `wiki.json`, or a directory containing one of those files. Defaults to the current directory (`.`).

Example:

```bash
wiki -c docs/wiki.yaml check
```

### `--vault-inputs PATH` (repeatable)

Override or extend `vault.inputs` from config for a single invocation. Relative paths resolve against the config file directory. Useful for one-off queries against a subdirectory.

Example:

```bash
wiki --vault-inputs ./wiki --vault-inputs ./imported query "SELECT * WHERE { ?s ?p ?o } LIMIT 5"
```

## Command reference

Each subcommand has a dedicated page:

<!-- sparql:start -->

```sparql
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX schema: <https://schema.org/>

SELECT ?command ?description WHERE {
  ?command rdf:type schema:TechArticle .
  FILTER(STRSTARTS(STR(?command), "https://wazootech.github.io/wiki/Wiki_Subcommand_"))
  OPTIONAL { ?command schema:description ?description }
}
ORDER BY ?command
```

| Command                                               | Description                                                                                    |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [Wiki_Subcommand_build](Wiki_Subcommand_build.md)     | Generate a static HTML site from the vault.                                                    |
| [Wiki_Subcommand_check](Wiki_Subcommand_check.md)     | Integrity checks — SHACL validation, route safety, and layout frontmatter.                     |
| [Wiki_Subcommand_export](Wiki_Subcommand_export.md)   | Export document frontmatter as RDF or JSON-LD.                                                 |
| [Wiki_Subcommand_fmt](Wiki_Subcommand_fmt.md)         | Format markdown vault pages using mdformat with wikilink preservation.                         |
| [Wiki_Subcommand_link](Wiki_Subcommand_link.md)       | Suggest missing wikilinks and repair unambiguous broken internal links.                        |
| [Wiki_Subcommand_lint](Wiki_Subcommand_lint.md)       | Convention audits for broken links, filename patterns, heading style, and internal link style. |
| [Wiki_Subcommand_query](Wiki_Subcommand_query.md)     | Run SPARQL SELECT or CONSTRUCT against the vault graph.                                        |
| [Wiki_Subcommand_render](Wiki_Subcommand_render.md)   | Update inline SPARQL result tables in markdown files.                                          |
| [Wiki_Subcommand_serve](Wiki_Subcommand_serve.md)     | Local HTTP server for live HTML preview and optional read-only SPARQL endpoint.                |
| [Wiki_Subcommand_upgrade](Wiki_Subcommand_upgrade.md) | Check PyPI for updates and upgrade wazootech-wiki.                                             |

<!-- sparql:end -->

Global flags: `-c`, `--vault-inputs`.

## Publishing

- [Deploying_to_GitHub_Pages](Deploying_to_GitHub_Pages.md) — CI workflow for this site
- [Obsidian_Integration](Obsidian_Integration.md) — Shell Commands plugin workflows

## Design

The CLI follows a flat, scriptable surface and [Design_Philosophies](Design_Philosophies.md) (silent success, composable stdout).

## Pattern context

This repository implements the [LLM_Wiki](LLM_Wiki.md) pattern for [Personal_Knowledge](Personal_Knowledge.md) vaults. Examples in the wild include [Farzapedia](Farzapedia.md) and coverage from Andrej Karpathy.

Similar **agent memory filesystem** approaches include [Supermemory_SMFS](Supermemory_SMFS.md), [Letta_MemFS](Letta_MemFS.md), and [Agent_Memory_Filesystems](Agent_Memory_Filesystems.md).

## Repository

- Source and issues: [github.com/wazootech/wiki](https://github.com/wazootech/wiki)
- Starter template: [github.com/wazootech/wiki-example](https://github.com/wazootech/wiki-example)

## Background

- [Semantic_Web](Semantic_Web.md) — RDF, Turtle, OWL, and related formats
- [Software_Application_Shape](Software_Application_Shape.md) — SHACL shape for `SoftwareApplication` pages (including this page)
