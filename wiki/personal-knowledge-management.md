---
id: wiki:personal-knowledge-management
type: TechArticle
name: Personal knowledge management and semantic 2nd brains
about: wiki:wiki-cli
---

# Personal knowledge management and semantic 2nd brains

Personal Knowledge Management (PKM) is the discipline of capturing, organizing, and synthesizing ideas to build a "second brain". Traditional PKM tools organize files with folders, tags, or un-typed markdown links. 

By utilizing the [[wiki-cli]], this vault upgrades traditional un-structured note-taking into a **semantic knowledge graph**, directly embracing the modern LLM Wiki pattern popularized by [[karpathy-llm-wiki]].

---

## Why semantics elevate your 2nd brain

### 1. Typed links over simple backlinks
Instead of a simple un-typed link from Gregory's page to Bella's page, semantic PKM defines the exact nature of the relationship:
```yaml
# Inside gregory.md
spouse:
  name: Bella
```
This is parsed as a typed graph triple (`wiki:gregory schema:spouse wiki:bella`), allowing the graph to mathematically reason about family, colleague, or friend connections.

### 2. Built-in structural correctness (SHACL shapes)
Traditional notes suffer from "schema drift" where you forget to add fields like dates or tags. The Wiki CLI uses **SHACL shapes** to audit your notes automatically during [[wiki-workflows]]. This ensures your second brain remains consistently structured and complete.

### 3. Infinite dynamic synthesis (SPARQL)
Instead of manually maintaining index lists or tag pages, you write a simple SPARQL query. When you run `wiki render`, the CLI automatically updates your indexes, dashboards, and maps dynamically!

### 4. Declarative vs. procedural knowledge representation
A modern second brain must distinguish between **declarative knowledge** ("knowing what") and **procedural knowledge** ("knowing how"):
* **Declarative Knowledge**: Represented statically as semantic facts, class hierarchies, and properties within your markdown frontmatter. These are parsed into the permanent RDF graph.
* **Procedural Knowledge**: Represented dynamically as executable actions, workflows, query parameters, and validation rules (e.g., active SHACL shape rules and custom SPARQL blocks). The CLI automates this procedural layer through commands like `wiki check` and `wiki render`, transforming static notes into an active, self-correcting system.

---

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
| wiki:karpathy-llm-wiki | Andrej Karpathy's LLM Wiki and Farzapedia |
| wiki:custom-schemas-and-shapes | Defining custom schemas, shapes, and axioms |
| wiki:farzapedia | Farzapedia and personal AI wikis |
| wiki:personal-knowledge-management | Personal knowledge management and semantic 2nd brains |
| wiki:sparql-guide | SPARQL query guide |
| wiki:wiki-schema | Wiki schema and active types |
| wiki:wiki-workflows | Wiki workflows and authoring guide |
<!-- sparql:end -->
