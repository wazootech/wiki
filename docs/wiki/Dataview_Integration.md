---
type: TechArticle
headline: Dataview Integration
description: Query and visualize your semantic markdown files in Obsidian using Dataview DQL and DataviewJS.
---

# Dataview Integration

The [wiki](wiki.md) and Obsidian's community **Dataview** plugin can be used together on the same Markdown wiki. Because both tools operate on plain text Markdown files and standard YAML/JSON frontmatter, they interoperate naturally without needing any data migration or conversion.

## How they complement each other

While both tools allow you to query your wiki metadata, they optimize for different workflows:

- **Dataview** is designed for **interactive, in-editor presentation** inside the Obsidian GUI. It is perfect for dynamic dashboards, daily note tracking, and local navigation.
- **Wiki CLI** is a **verifiable semantic compiler and toolchain** designed to run anywhere (local terminal, CI/CD pipelines, or static web servers). It enforces data structures via [SHACL](SHACL.md) and JSON Schema, executes query-based rendering via [SPARQL](SPARQL.md), and builds standalone static HTML sites.

### Comparison

| Feature               | Obsidian Dataview                        | Wiki CLI                                        |
| --------------------- | ---------------------------------------- | ----------------------------------------------- |
| **Execution Context** | Inside the Obsidian application (GUI)    | Terminal, scripts, and CI/CD pipelines          |
| **Query Language**    | DQL (custom SQL-like) or JavaScript      | SPARQL (W3C standard)                           |
| **Validation**        | Presentation only (no constraints check) | `wiki check` (SHACL and JSON Schema validation) |
| **Logical Inference** | None (direct field matching)             | OWL-RL reasoning (implicit class hierarchies)   |
| **Output Formats**    | Dynamic markdown views in Obsidian       | Static HTML, Turtle, JSON-LD, RDF/XML           |

## Query examples

Because the Wiki CLI parses standard YAML frontmatter, any properties you declare for semantic queries in the CLI are also accessible to Dataview.

### Basic DQL vs SPARQL

To list all software applications in the wiki:

#### Dataview (DQL)

````markdown
```dataview
TABLE description, softwareVersion as Version
WHERE type = "schema:SoftwareApplication" OR type = "SoftwareApplication"
SORT file.name ASC
````

````

#### Wiki CLI (SPARQL)
```sparql
PREFIX schema: <https://schema.org/>

SELECT ?name ?description ?version WHERE {
  ?s a schema:SoftwareApplication ;
     schema:name ?name ;
     schema:description ?description ;
     schema:softwareVersion ?version .
}
ORDER BY ?name
````

______________________________________________________________________

### Advanced Querying with DataviewJS

If you need programmatic control or custom rendering inside Obsidian, you can use DataviewJS to filter and present your semantic properties:

````javascript
```dataviewjs
// Query and filter pages with a specific type
const apps = dv.pages()
  .filter(p => p.type === "schema:SoftwareApplication" || p.type === "SoftwareApplication");

// Render as a table inside your note
dv.table(
  ["App", "Description", "Version"],
  apps.map(p => [
    p.file.link, 
    p.description || "No description", 
    p.softwareVersion || "N/A"
  ])
);
````

```

## Related

- [Obsidian Integration](Obsidian_Integration.md) — executing CLI commands from Obsidian
- [wiki](wiki.md) — command reference home
- [SPARQL](SPARQL.md) — semantic web query background
```
