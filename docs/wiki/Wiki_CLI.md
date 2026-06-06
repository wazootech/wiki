---
type: schema:SoftwareApplication
name: Wiki CLI
softwareVersion: 0.1.8
description: Command-line interface for querying, validating, and publishing semantic markdown wikis.
---

# Wiki CLI

This page is the **documentation home** for **Wiki CLI** (`wiki` on PyPI as **`wazootech-wiki`**), the command-line tool for the [LLM Wiki](LLM_Wiki.md) pattern. It turns a folder of markdown files with semantic frontmatter into an RDF graph you can validate with [SHACL](SHACL.md), query with [SPARQL](SPARQL.md), and publish as static HTML.

```bash
pip install wazootech-wiki
wiki --help
```

## Features

- **Check** — PySHACL plus hygiene audits ([Wiki_Subcommand_check](Wiki_Subcommand_check.md))
- **Query** — SPARQL with OWL-RL ([Wiki_Subcommand_query](Wiki_Subcommand_query.md), [Graph_Cache](Graph_Cache.md))
- **Render** — live tables from inline SPARQL ([Wiki_Subcommand_render](Wiki_Subcommand_render.md))
- **Build / serve** — static site and local preview ([Wiki_Subcommand_build](Wiki_Subcommand_build.md), [Wiki_Subcommand_serve](Wiki_Subcommand_serve.md))
- **Export** — JSON-LD and RDF serializations ([Wiki_Subcommand_export](Wiki_Subcommand_export.md))
- **Init** — scaffold `wiki.yaml` ([Wiki_Subcommand_init](Wiki_Subcommand_init.md))
- **View** — terminal infobox for one page ([Wiki_Subcommand_view](Wiki_Subcommand_view.md))
- **Upgrade** — PyPI updates ([Wiki_Subcommand_upgrade](Wiki_Subcommand_upgrade.md))

## Quickstart

```bash
pip install wazootech-wiki
mkdir my-wiki && cd my-wiki
wiki init
wiki check
wiki serve
```

See [Getting_Started](Getting_Started.md) for a full walkthrough.

## Start here

- [Getting_Started](Getting_Started.md) — install, `wiki init`, first `check` and `serve`
- [Wiki_Configuration](Wiki_Configuration.md) — `wiki.yaml` options
- [Style_Guide](Style_Guide.md) — frontmatter, shapes, internal links, SPARQL blocks
- [Graph_Cache](Graph_Cache.md) — in-process RDF graph reuse
- [Design_Philosophies](Design_Philosophies.md) — silence is golden, pipes, flat commands

## Global Options

These options apply to all subcommands on the root `wiki` group:

### `-c, --config PATH`

Path to `wiki.yaml`, `wiki.yml`, `wiki.json`, or a directory containing one of those files. Defaults to the current directory (`.`).

Example:

```bash
wiki -c docs/wiki.yaml check
```

### `--input-dir PATH` (repeatable)

Override or extend `input_dirs` from config for a single invocation. Useful for one-off queries against a subdirectory.

Example:

```bash
wiki --input-dir ./wiki --input-dir ./imported query "SELECT * WHERE { ?s ?p ?o } LIMIT 5"
```

## Command reference

Each subcommand has a dedicated page:

<!-- sparql:start -->

```sparql
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX schema: <https://schema.org/>

SELECT ?command ?description WHERE {
  ?command rdf:type schema:TechArticle .
  FILTER(STRSTARTS(STR(?command), "https://wazootech.github.io/wiki/wiki/Wiki_Subcommand_"))
  OPTIONAL { ?command schema:description ?description }
}
ORDER BY ?command
```

| Command                                               | Description                                                            |
| ----------------------------------------------------- | ---------------------------------------------------------------------- |
| [Wiki_Subcommand_build](Wiki_Subcommand_build.md)     | Generate a static HTML site from the vault.                            |
| [Wiki_Subcommand_check](Wiki_Subcommand_check.md)     | Unified SHACL validation and vault hygiene audits.                     |
| [Wiki_Subcommand_export](Wiki_Subcommand_export.md)   | Export document frontmatter as RDF or JSON-LD.                         |
| [Wiki_Subcommand_fmt](Wiki_Subcommand_fmt.md)         | Format markdown vault pages using mdformat with wikilink preservation. |
| [Wiki_Subcommand_init](Wiki_Subcommand_init.md)       | Scaffold wiki.yaml and starter wiki pages interactively.               |
| [Wiki_Subcommand_query](Wiki_Subcommand_query.md)     | Run SPARQL SELECT or CONSTRUCT against the vault graph.                |
| [Wiki_Subcommand_render](Wiki_Subcommand_render.md)   | Update inline SPARQL result tables in markdown files.                  |
| [Wiki_Subcommand_serve](Wiki_Subcommand_serve.md)     | Local HTTP server for live HTML preview.                               |
| [Wiki_Subcommand_upgrade](Wiki_Subcommand_upgrade.md) | Check PyPI for updates and upgrade wazootech-wiki.                     |
| [Wiki_Subcommand_view](Wiki_Subcommand_view.md)       | Terminal infobox view for a single wiki document.                      |

<!-- sparql:end -->

Global flags: `-c`, `--input-dir`.

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
- [Software_Shape](Software_Shape.md) — SHACL shape for `SoftwareApplication` pages (including this one)
