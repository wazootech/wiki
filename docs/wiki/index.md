---
id: wiki:index
type: schema:CreativeWork
name: LLM Wiki CLI documentation
description: Command-line reference and guides for the wazootech-wiki package.
---

# LLM Wiki CLI documentation

The **LLM Wiki CLI** (`wiki` on PyPI as `wazootech-wiki`) validates, queries, renders, and publishes semantic markdown wikis. Vault files use YAML or JSON frontmatter that compiles to RDF; [[SHACL]] shapes enforce structure; embedded [[SPARQL]] blocks stay fresh via `wiki render`.

Install from PyPI:

```bash
pip install wazootech-wiki
wiki --help
```

## Start here

- [[Getting_Started]] — install, `wiki init`, first `check` and `serve`
- [[Wiki_Configuration]] — `wiki.yaml` / `wiki.json` options
- [[Authoring_Guide]] — frontmatter, shapes, wikilinks, SPARQL blocks
- [[Graph_Cache]] — in-process RDF graph reuse
- [[Design_Philosophies]] — silence is golden, pipes, flat commands

## Command reference

| Command | Summary |
| --- | --- |
| [[CLI_check\|check]] | SHACL validation and hygiene audits |
| [[CLI_query\|query]] | SPARQL SELECT / CONSTRUCT |
| [[CLI_render\|render]] | Refresh inline SPARQL tables |
| [[CLI_build\|build]] | Static HTML site |
| [[CLI_serve\|serve]] | Local preview server |
| [[CLI_view\|view]] | Terminal infobox for one page |
| [[CLI_export\|export]] | RDF / JSON-LD export |
| [[CLI_init\|init]] | Scaffold `wiki.yaml` and starter vault |
| [[CLI_upgrade\|upgrade]] | PyPI version check and upgrade |

Global flags: [[Global_Options]] (`-c`, `--input-dir`).

## Publishing

- [[Deploying_to_GitHub_Pages]] — CI workflow for this site
- [[Obsidian_Integration]] — Shell Commands plugin workflows

## Background

- [[LLM_Wiki_CLI]] — product overview and feature list
- [[Semantic_Web]] — RDF, Turtle, OWL, and related formats
- [[LLM_Wiki]] — LLM Wiki design pattern
- [[Software_Shape]] — shape for `SoftwareApplication` docs (this tool’s metadata)

## Documentation pages in this vault

<!-- sparql:start -->
```sparql
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX schema: <https://schema.org/>

SELECT ?document ?type ?name WHERE {
  ?document rdf:type ?type .
  FILTER(STRSTARTS(STR(?document), "wiki:"))
  OPTIONAL { ?document schema:name ?name }
}
ORDER BY ?type ?name
```

(no results)
<!-- sparql:end -->
