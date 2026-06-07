---
type: TechArticle
headline: Personal Knowledge
description: Individual strategy and collection of knowledge.
---

# Personal Knowledge

**Personal Knowledge** refers to the individual methods, systems, and digital gardens humans use to store, organize, and build upon their memories and information streams.

Modern efforts utilize digital systems like [Obsidian](Obsidian.md) or semantic architectures to form a [Second Brain](Second_Brain.md).

## Why semantics elevate your 2nd brain

### Typed links over simple backlinks

Instead of a simple un-typed link from Gregory's page to Bella's page, semantic PKM defines the exact nature of the relationship:

```yaml
# Inside Gregory.md
owns: Bella
```

This is parsed as a typed graph triple (`wiki:gregory wiki:owns wiki:bella`), allowing the graph to mathematically reason about family, colleague, or friend connections.

### Built-in structural correctness (SHACL shapes)

Traditional notes suffer from "schema drift" where you forget to add fields like dates or tags. The [Wiki CLI](Wiki_CLI.md) uses **SHACL shapes** to audit your notes automatically. This ensures your [second brain](Second_Brain.md) remains consistently structured and complete.

### Infinite dynamic synthesis (SPARQL)

Instead of manually maintaining index lists or tag pages, you write a simple SPARQL query. When you run `wiki render`, the CLI automatically updates your indexes, dashboards, and maps dynamically!

### Declarative vs. [procedural knowledge](Procedural_Knowledge.md) representation

A modern [second brain](Second_Brain.md) must distinguish between **[declarative knowledge](Declarative_Knowledge.md)** ("knowing what") and **[procedural knowledge](Procedural_Knowledge.md)** ("knowing how"):

- **[Declarative Knowledge](Declarative_Knowledge.md)**: Represented statically as semantic facts, class hierarchies, and properties within your markdown frontmatter. These are parsed into the permanent RDF graph.
- **[Procedural Knowledge](Procedural_Knowledge.md)**: Represented dynamically as executable actions, workflows, query parameters, and validation rules (e.g., active SHACL shape rules and custom SPARQL blocks). The CLI automates this procedural layer through commands like `wiki check` and `wiki render`, transforming static notes into an active, self-correcting system.
