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
Traditional notes suffer from "schema drift" where you forget to add fields like dates or tags. The Wiki CLI uses **SHACL shapes** to audit your notes automatically. This ensures your second brain remains consistently structured and complete.

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
| [[css]] | CSS |
| [[csv]] | CSV |
| [[negotiation]] | Content negotiation |
| [[farzapedia]] | Farzapedia and personal AI wikis |
| [[html]] | HTML |
| [[json]] | JSON |
| [[json-ld]] | JSON-LD |
| [[javascript]] | JavaScript |
| [[llm-wiki]] | LLM Wiki |
| [[microdata]] | Microdata |
| wiki:microdata-example | Microdata in LLM Wiki |
| [[notation3]] | Notation3 |
| [[owl]] | OWL |
| https://schema.org/PersonShapeDefinition | Person Shape |
| [[personal-knowledge]] | Personal Knowledge |
| [[ontology]] | Project Ontology |
| [[rdf]] | RDF |
| [[shacl]] | SHACL |
| [[sparql]] | SPARQL |
| [[semantic-web]] | Semantic Web |
| [[turtle]] | Turtle |
| [[typescript]] | TypeScript |
<!-- sparql:end -->

