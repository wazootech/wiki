---
id: wiki:personal-knowledge
type: TechArticle
name: Personal Knowledge
description: Individual strategy and collection of knowledge.
---

# Personal Knowledge

**Personal Knowledge** refers to the individual methods, systems, and digital gardens humans use to store, organize, and build upon their memories and information streams.

Modern efforts utilize digital systems like obsidian or semantic architectures to form a Second Brain.

## Why semantics elevate your 2nd brain

### Typed links over simple backlinks
Instead of a simple un-typed link from Gregory's page to Bella's page, semantic PKM defines the exact nature of the relationship:
```yaml
# Inside gregory.md
spouse:
  name: Bella
```
This is parsed as a typed graph triple (`wiki:gregory schema:spouse wiki:bella`), allowing the graph to mathematically reason about family, colleague, or friend connections.

### Built-in structural correctness (SHACL shapes)
Traditional notes suffer from "schema drift" where you forget to add fields like dates or tags. The LLM Wiki CLI uses **SHACL shapes** to audit your notes automatically. This ensures your second brain remains consistently structured and complete.

### Infinite dynamic synthesis (SPARQL)
Instead of manually maintaining index lists or tag pages, you write a simple SPARQL query. When you run `wiki render`, the CLI automatically updates your indexes, dashboards, and maps dynamically!

### Declarative vs. procedural knowledge representation
A modern second brain must distinguish between **declarative knowledge** ("knowing what") and **procedural knowledge** ("knowing how"):
* **Declarative Knowledge**: Represented statically as semantic facts, class hierarchies, and properties within your markdown frontmatter. These are parsed into the permanent RDF graph.
* **Procedural Knowledge**: Represented dynamically as executable actions, workflows, query parameters, and validation rules (e.g., active SHACL shape rules and custom SPARQL blocks). The CLI automates this procedural layer through commands like `wiki check` and `wiki render`, transforming static notes into an active, self-correcting system.


## Active PKM topics in this vault

The table below automatically queries the graph for all technical articles in the vault:

<!-- sparql:start -->
```sparql
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX schema: <https://schema.org/>

SELECT ?topic ?name WHERE {
  ?topic rdf:type schema:TechArticle .
  ?topic schema:name ?name .
}
ORDER BY ?name
```

| Topic | Name |
| --- | --- |
| https://wazootech.github.io/wiki/wiki/AuthoringGuide | Authoring guide |
| https://wazootech.github.io/wiki/wiki/css | CSS |
| https://wazootech.github.io/wiki/wiki/csv | CSV |
| https://wazootech.github.io/wiki/wiki/negotiation | Content negotiation |
| https://wazootech.github.io/wiki/wiki/DeployingToGitHubPages | Deploying to GitHub Pages |
| https://wazootech.github.io/wiki/wiki/DesignPhilosophies | Design philosophies |
| https://wazootech.github.io/wiki/wiki/farzapedia | Farzapedia and personal AI wikis |
| https://wazootech.github.io/wiki/wiki/GettingStarted | Getting started |
| https://wazootech.github.io/wiki/wiki/GlobalOptions | Global options |
| https://wazootech.github.io/wiki/wiki/GraphCache | Graph cache |
| https://wazootech.github.io/wiki/wiki/html | HTML |
| https://wazootech.github.io/wiki/wiki/hello-world | Hello World |
| https://wazootech.github.io/wiki/wiki/json | JSON |
| https://wazootech.github.io/wiki/wiki/json-ld | JSON-LD |
| https://wazootech.github.io/wiki/wiki/javascript | JavaScript |
| https://wazootech.github.io/wiki/wiki/llm-wiki | LLM Wiki |
| https://wazootech.github.io/wiki/wiki/microdata | Microdata |
| https://wazootech.github.io/wiki/wiki/microdata-example | Microdata in LLM Wiki |
| https://wazootech.github.io/wiki/wiki/notation3 | Notation3 |
| https://wazootech.github.io/wiki/wiki/owl | OWL |
| https://wazootech.github.io/wiki/wiki/ObsidianIntegration | Obsidian integration |
| https://schema.org/PersonShapeDefinition | Person Shape |
| https://wazootech.github.io/wiki/wiki/personal-knowledge | Personal Knowledge |
| https://wazootech.github.io/wiki/wiki/ontology | Project Ontology |
| https://wazootech.github.io/wiki/wiki/rdf | RDF |
| https://wazootech.github.io/wiki/wiki/shacl | SHACL |
| https://wazootech.github.io/wiki/wiki/sparql | SPARQL |
| https://wazootech.github.io/wiki/wiki/semantic-web | Semantic Web |
| https://wazootech.github.io/wiki/wiki/turtle | Turtle |
| https://wazootech.github.io/wiki/wiki/typescript | TypeScript |
| https://wazootech.github.io/wiki/wiki/WikiConfiguration | Wiki configuration |
| [[CLI_build]] | wiki build |
| [[CLI_check]] | wiki check |
| [[CLI_export]] | wiki export |
| [[CLI_init]] | wiki init |
| [[CLI_query]] | wiki query |
| [[CLI_render]] | wiki render |
| [[CLI_serve]] | wiki serve |
| [[CLI_upgrade]] | wiki upgrade |
| [[CLI_view]] | wiki view |
<!-- sparql:end -->

