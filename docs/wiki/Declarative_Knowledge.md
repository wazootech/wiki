---
type: TechArticle
headline: Declarative knowledge
description: Knowing what — facts, types, and relationships expressed as structured data.
---

# Declarative knowledge

**Declarative knowledge** is "knowing what": facts, definitions, taxonomies, and explicit relationships. In this vault it is represented primarily as YAML frontmatter on markdown pages, compiled into an [RDF](RDF.md) graph via the [Wiki CLI](Wiki_CLI.md).

Examples include `schema:Person` fields on biography pages, `schema:TechArticle` metadata on guides, and typed links between entities. [SHACL](SHACL.md) validates that declarative statements stay complete and consistent.

Pair declarative pages with [Procedural_Knowledge](Procedural_Knowledge.md)—workflows and commands that keep the graph correct and surfaces like indexes up to date.
