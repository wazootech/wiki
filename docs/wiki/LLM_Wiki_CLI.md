---
id: wiki:llm-wiki-cli
type: schema:SoftwareApplication
name: LLM Wiki CLI
softwareVersion: 0.1.5
description: Command-line interface for querying, validating, and publishing semantic markdown wikis.
---

# LLM Wiki CLI

Python package **`wazootech-wiki`** on PyPI; command name **`wiki`**. It turns a folder of markdown files with semantic frontmatter into an RDF graph you can validate with [[SHACL]], query with [[SPARQL]], and publish as static HTML.

Full documentation for this tool lives in this vault. Start at the [[index|documentation home]].

## Features

- **Check** — PySHACL plus hygiene audits ([[CLI_check]])
- **Query** — SPARQL with OWL-RL ([[CLI_query]], [[Graph_Cache]])
- **Render** — live tables from inline SPARQL ([[CLI_render]])
- **Build / serve** — static site and local preview ([[CLI_build]], [[CLI_serve]])
- **Export** — JSON-LD and RDF serializations ([[CLI_export]])
- **Init** — scaffold `wiki.yaml` ([[CLI_init]])
- **View** — terminal infobox for one page ([[CLI_view]])
- **Upgrade** — PyPI updates ([[CLI_upgrade]])

## Quickstart

```bash
pip install wazootech-wiki
mkdir my-wiki && cd my-wiki
wiki init
wiki check
wiki serve
```

See [[Getting_Started]] for details.

## Design

The CLI follows a flat, scriptable surface and [[Design_Philosophies|Unix-style defaults]] (silent success, composable stdout).

## Pattern context

The tool implements the [[LLM_Wiki]] pattern for [[Personal_Knowledge]] vaults. Examples in the wild include [[Farzapedia]] and coverage from [[Karpathy]].

## Repository

Source and issue tracker: [github.com/wazootech/wiki](https://github.com/wazootech/wiki). Starter template: [github.com/wazootech/wiki-example](https://github.com/wazootech/wiki-example).
