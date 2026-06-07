---
type: TechArticle
name: Personal Knowledge
description: Individual strategy and collection of knowledge.
---

# Personal Knowledge

**Personal Knowledge** refers to the individual methods, systems, and digital gardens humans use to store, organize, and build upon their memories and information streams.

Modern efforts utilize digital systems like [[Obsidian|obsidian]] or semantic architectures to form a [[Second_Brain|Second Brain]].

## Why semantics elevate your 2nd brain

### Typed links over simple backlinks

Instead of a simple un-typed link from Gregory's page to Bella's page, semantic PKM defines the exact nature of the relationship:

```yaml
# Inside Gregory.md
owns: Bella
```

This is parsed as a typed graph triple (`wiki:gregory wiki:owns wiki:bella`), allowing the graph to mathematically reason about family, colleague, or friend connections.

### Built-in structural correctness (SHACL shapes)

Traditional notes suffer from "schema drift" where you forget to add fields like dates or tags. The [[Wiki_CLI|Wiki CLI]] uses **SHACL shapes** to audit your notes automatically. This ensures your [[Second_Brain|second brain]] remains consistently structured and complete.

### Infinite dynamic synthesis (SPARQL)

Instead of manually maintaining index lists or tag pages, you write a simple SPARQL query. When you run `wiki render`, the CLI automatically updates your indexes, dashboards, and maps dynamically!

### Declarative vs. [[Procedural_Knowledge|procedural knowledge]] representation

A modern [[Second_Brain|second brain]] must distinguish between **[[Declarative_Knowledge|declarative knowledge]]** ("knowing what") and **[[Procedural_Knowledge|procedural knowledge]]** ("knowing how"):

- **[[Declarative_Knowledge|Declarative Knowledge]]**: Represented statically as semantic facts, class hierarchies, and properties within your markdown frontmatter. These are parsed into the permanent RDF graph.
- **[[Procedural_Knowledge|Procedural Knowledge]]**: Represented dynamically as executable actions, workflows, query parameters, and validation rules (e.g., active SHACL shape rules and custom SPARQL blocks). The CLI automates this procedural layer through commands like `wiki check` and `wiki render`, transforming static notes into an active, self-correcting system.
