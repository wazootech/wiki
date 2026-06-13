---
type: schema:SoftwareApplication
name: Wiki CLI
softwareVersion: 0.1.13
description: Command-line interface for querying, validating, and publishing semantic markdown wikis.
---

# Wiki CLI

This page is the **documentation home** for **Wiki CLI** (`wiki` on PyPI as [**`wazootech-wiki`**](https://pypi.org/project/wazootech-wiki/)): the semantic knowledge **toolchain** for Markdown wikis — validate with [SHACL](SHACL.md), infer and query with [SPARQL](SPARQL.md), and publish static HTML. It compiles wikis into RDF and sits **beneath** note apps and LLM-assisted workflows — progressive enhancement, not a migration.

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

See [Getting Started](Getting_Started.md) for a full walkthrough.

## What wiki is

- The **compiler / validator / query engine** for Markdown knowledge bases with semantic frontmatter
- An **OOTB wiki builder** — links, navigation, SHACL checks, SPARQL, and static HTML from a folder of `.md` files
- A **memory layer** — ingest or watch an existing wiki without owning the editor
- **Interop-first** — works alongside [Obsidian](Obsidian_Integration.md), [LLM Wiki](LLM_Wiki.md) setups, and any Markdown editor

Adoption path: `wiki init` → `wiki check` → `wiki serve`, then add `lint`, `query`, `render`, and `build` as the wiki matures.

## What wiki is not

- The **primary editor** or daily note-taking surface
- A **replacement** for Obsidian, Logseq, or another wiki UI
- A **note app clone**, CMS, or authenticated multi-user web product
- An **auth layer** — local-first CLI and static publish; see deferred scope in [ecosystem templates](#ecosystem-templates) below

Humans and agents keep writing where they already write. `wiki` makes that content **trustworthy** (SHACL + conventions), **searchable** (SPARQL + OWL-RL), and **publishable** (static HTML, JSON-LD, Turtle, optional read-only SPARQL over `wiki serve`).

## Memory layer and ingestion

Rather than owning your editor or data store, the Wiki CLI functions as a **read-only memory layer** over your wiki. It parses, indexes, and queries the Markdown documents on your filesystem without mutating them or locking you into a proprietary format.

- **Ingestion:** The CLI reads YAML/JSON frontmatter and HTML microdata from your files, compiling them into an in-memory RDF graph that can be queried with SPARQL or verified against SHACL shapes.
- **Watching:** Running `wiki serve --watch` instructs the CLI to watch the wiki directory. Any edits you make in your preferred editor are immediately processed, updating the graph in the background and keeping your preview server synchronized.

## Toolchain vs authoring surface

| Layer                   | Role                                                                   | Examples                                                    |
| ----------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------- |
| Authoring surface       | Create and edit Markdown                                               | Obsidian, agent-driven LLM wiki, VS Code, any editor        |
| Wiki CLI semantic layer | Compile wiki → RDF graph; check, lint, fmt; query; render; build/serve | `wiki check`, `wiki query`, `wiki build`                    |
| Outputs                 | Deployable artifacts                                                   | GitHub Pages HTML, export files, `/api/sparql` when enabled |

This separation is intentional: the strongest differentiator is the **machine layer** (SHACL, OWL-RL, SPARQL, typed HTML) that most note apps do not provide. Wiki CLI avoids competing with editor-centric tools while making incremental adoption obvious.

## Interop-first workflows

### Obsidian

Run `wiki` against the folder that contains `wiki.yaml`. Use Shell Commands for on-save `wiki check`, hotkey `wiki render`, or `wiki serve --watch` for preview. Details: [Obsidian integration](Obsidian_Integration.md) and [Dataview integration](Dataview_Integration.md).

### LLM wikis

Treat the wiki as a compounding codebase agents maintain over time. Structured frontmatter and link conventions make SPARQL and SHACL meaningful on agent output. Pattern overview: [LLM Wiki](LLM_Wiki.md).

### Plain Markdown

No Obsidian or agent stack required. `wiki init` scaffolds a wiki; conventions are documented in [Style Guide](Style_Guide.md).

## Three beats of the CLI

| Beat         | Commands                    | Value                                            |
| ------------ | --------------------------- | ------------------------------------------------ |
| Trust        | `check`, `lint`, `fmt`      | Integrity contracts and authoring conventions    |
| Intelligence | `query`, `render`, `export` | SPARQL, inline result blocks, RDF serializations |
| Publish      | `build`, `serve`, `link`    | Static site, local preview, wikilink hygiene     |

Design rationale for silence, pipes, and flat subcommands: [Design philosophies](Design_Philosophies.md).

## Ecosystem templates

| Template                                                                          | Purpose                                                                                       |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| [wiki-template](https://github.com/wazootech/wiki-template)                       | Starter wiki                                                                                  |
| [sparql-service-template](https://github.com/wazootech/sparql-service-template)   | YASGUI + sample wiki or live endpoint for exploring wiki RDF                                  |
| [nextjs-template](https://github.com/wazootech/nextjs-template)                   | OAuth 2.0-protected, Next.js wiki viewer ([#15](https://github.com/wazootech/wiki/issues/15)) |
| [obsidian-quartz-template](https://github.com/wazootech/obsidian-quartz-template) | Obsidian PKM viewer ([#16](https://github.com/wazootech/wiki/issues/16))                      |
| [wiki-mintlify-template](https://github.com/wazootech/wiki-mintlify-template)     | Mintlify/Holocron viewer ([#31](https://github.com/wazootech/wiki/issues/31))                 |

## Features

- **Check** — SHACL integrity, route safety, layout frontmatter ([Wiki Subcommand check](Wiki_Subcommand_check.md))
- **Lint** — broken links, filename pattern, and heading conventions ([Wiki Subcommand lint](Wiki_Subcommand_lint.md))
- **Link** — suggest missing wikilinks and repair broken internal links ([Wiki Subcommand link](Wiki_Subcommand_link.md))
- **Fmt** — mdformat for markdown ([Wiki Subcommand fmt](Wiki_Subcommand_fmt.md))
- **Query** — SPARQL with OWL-RL and optional `--pretty` Rich tables ([Wiki Subcommand query](Wiki_Subcommand_query.md), [Graph Cache](Graph_Cache.md))
- **Render** — live tables from inline SPARQL ([Wiki Subcommand render](Wiki_Subcommand_render.md))
- **Build / serve** — static site, local preview, and optional read-only SPARQL endpoint ([Wiki Subcommand build](Wiki_Subcommand_build.md), [Wiki Subcommand serve](Wiki_Subcommand_serve.md#sparql-endpoint))
- **Export** — JSON-LD and RDF serializations ([Wiki Subcommand export](Wiki_Subcommand_export.md))
- **Init** — scaffold `wiki.yaml` ([Wiki Subcommand init](Wiki_Subcommand_init.md))
- **Upgrade** — PyPI updates ([Wiki Subcommand upgrade](Wiki_Subcommand_upgrade.md))

## Agent skills

Procedural knowledge for coding agents: [Wiki Skills](Wiki_Skills.md) (`skills/wiki-install`, `skills/wiki-create`, `skills/wiki-improve`, `skills/wiki-deploy` in the repository).

## Start here

- [Getting Started](Getting_Started.md) — install, `wiki init`, first `check` and `serve`
- [Wiki Configuration](Wiki_Configuration.md) — `wiki.yaml` options
- [Style Guide](Style_Guide.md) — frontmatter, shapes, internal links, SPARQL blocks
- [Graph Cache](Graph_Cache.md) — in-process RDF graph reuse
- [Design Philosophies](Design_Philosophies.md) — silence is golden, pipes, flat commands

## Global Options

These options apply to config-loading subcommands (`check`, `lint`, `link`, `query`, `render`, `build`, `export`, `serve`, `fmt`). `init` and `upgrade` do not load `wiki.yaml`.

### `-c, --config PATH`

Path to `wiki.yaml`, `wiki.yml`, `wiki.json`, or a directory containing one of those files. Defaults to the current directory (`.`).

Example:

```bash
wiki -c docs/wiki.yaml check
```

### `--wiki-inputs PATH` (repeatable)

Override or extend `wiki.inputs` from config for a single invocation. Relative paths resolve against the config file directory. Useful for one-off queries against a subdirectory.

Example:

```bash
wiki --wiki-inputs ./wiki --wiki-inputs ./imported query "SELECT * WHERE { ?s ?p ?o } LIMIT 5"
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

| command | description |
| --- | --- |
| [Wiki_Subcommand_build](Wiki_Subcommand_build.md) | Generate a static HTML site from the wiki. |
| [Wiki_Subcommand_check](Wiki_Subcommand_check.md) | Integrity checks — SHACL validation, route safety, and layout frontmatter. |
| [Wiki_Subcommand_export](Wiki_Subcommand_export.md) | Export document frontmatter as RDF or JSON-LD. |
| [Wiki_Subcommand_fmt](Wiki_Subcommand_fmt.md) | Format markdown wiki pages using mdformat with wikilink preservation. |
| [Wiki_Subcommand_init](Wiki_Subcommand_init.md) | Scaffold wiki.yaml and starter wiki pages interactively. |
| [Wiki_Subcommand_link](Wiki_Subcommand_link.md) | Suggest missing wikilinks and repair unambiguous broken internal links. |
| [Wiki_Subcommand_lint](Wiki_Subcommand_lint.md) | Convention audits for broken links, filename patterns, heading style, and internal link style. |
| [Wiki_Subcommand_query](Wiki_Subcommand_query.md) | Run SPARQL SELECT or CONSTRUCT against the wiki graph. |
| [Wiki_Subcommand_render](Wiki_Subcommand_render.md) | Update inline SPARQL result tables in markdown files. |
| [Wiki_Subcommand_serve](Wiki_Subcommand_serve.md) | Local HTTP server for live HTML preview and optional read-only SPARQL endpoint. |
| [Wiki_Subcommand_upgrade](Wiki_Subcommand_upgrade.md) | Check PyPI for updates and upgrade wazootech-wiki. |

<!-- sparql:end -->

Global flags: `-c`, `--wiki-inputs`.

## Publishing

- [Deploying to GitHub Pages](Deploying_to_GitHub_Pages.md) — CI workflow for this site
- [Obsidian Integration](Obsidian_Integration.md) — Shell Commands plugin workflows

## Managing drift and schema evolution

A common challenge in text-based memory bases is metadata drift—especially when files are updated programmatically by external LLM agents. The Wiki CLI provides two strategies to keep a compounding codebase clean over long periods:

### Automated cleaning harness

To prevent drift mechanically, you can wire a local Git hook or CI workflow that executes the following checks in order:

1. **[Wiki Subcommand fmt](Wiki_Subcommand_fmt.md)**: Auto-formats Markdown structures and standardizes YAML frontmatter layout.
1. **[Wiki Subcommand lint](Wiki_Subcommand_lint.md) `--strict`**: Flags broken links, non-conforming filename patterns, and heading casing warnings as hard errors.
1. **[Wiki Subcommand check](Wiki_Subcommand_check.md) `--strict`**: Ensures frontmatter properties strictly conform to defined [SHACL](SHACL.md) shapes.

### Resilient schema evolution

Enforcing schemas on text databases can become problematic as structures evolve. The Wiki CLI avoids schema rigidity using semantic web principles:

- **Additive RDF properties**: Since frontmatter is compiled into a graph, new or unconstrained keys do not cause parsing failures. They are ingested as open-world triples that can be queried or ignored.
- **Decoupled validation**: SHACL validation is a diagnostic step, not an execution blocker. Files with invalid schemas can still be compiled, parsed, and queried.
- **Class-scoped shapes**: Shapes target specific classes (e.g., `sh:targetClass schema:TechArticle`). Introducing a new document type only requires writing a new shape constraint, leaving legacy documents untouched.
- **Namespace contexts**: Properties map to URIs via `graph.context` in [Wiki Configuration](Wiki_Configuration.md). You can rename or alias fields at the config layer without physically editing every source document.

## Design

The CLI follows a flat, scriptable surface and [Design Philosophies](Design_Philosophies.md) (silent success, composable stdout).

## Pattern context

This repository implements the [LLM Wiki](LLM_Wiki.md) pattern for [Personal Knowledge](Personal_Knowledge.md) wikis. Examples in the wild include [Farzapedia](Farzapedia.md) and coverage from Andrej Karpathy.

Similar **agent memory filesystem** approaches include [Supermemory SMFS](Supermemory_SMFS.md), [Letta MemFS](Letta_MemFS.md), and [Agent Memory Filesystems](Agent_Memory_Filesystems.md).

## Repository

- Source and issues: [github.com/wazootech/wiki](https://github.com/wazootech/wiki)
- Starter template: [github.com/wazootech/wiki-template](https://github.com/wazootech/wiki-template)

## Background

- [Semantic Web](Semantic_Web.md) — RDF, Turtle, OWL, and related formats
- [Software Application Shape](Software_Application_Shape.md) — SHACL shape for `SoftwareApplication` pages (including this page)
