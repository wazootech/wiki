---
id: wiki:wiki-cli
type: SoftwareApplication
name: Wiki CLI
softwareVersion: 0.1.0
description: Command-line interface for querying, validating, and managing the semantic vault
---

# Wiki CLI

The Wiki CLI is the primary companion tool for authoring, validating, and querying this semantic knowledge vault. It parses markdown files, converts YAML/JSON frontmatter into RDF graphs, resolves blank nodes, and performs deductive reasoning under OWL-RL semantics.


## Wiki workflows and authoring guide

This section covers common editing, auditing, and publishing procedures for contributing to the semantic knowledge vault.

### Create a new page
To scaffold a new page, run the `create` subcommand. It automatically converts the title to a clean kebab-case filename and generates a standardized YAML frontmatter block.
```bash
wiki create "My New Article"
```

### Fill in the semantic metadata
Always specify what fields are required for your document type. For example, if your page describes a person:
```yaml
id: wiki:alice-smith
type: schema:Person
name: Alice Smith
givenName: Alice
familyName: Smith
context: Software Engineer working on the Wiki CLI
status: permanent
dateCreated: 2026-05-08
```

### Run the validation suite
Before committing any files, run `wiki check` to verify that all filenames are valid, all internal WikiLinks resolve correctly, and all SHACL constraints are satisfied.
```bash
wiki check -v
```

### Render dynamic tables
If your page contains inline SPARQL query comments (`<!-- sparql:start -->`), run `wiki render` to update the markdown tables automatically:
```bash
wiki render -v
```


## Wiki schema and active types

Active shapes are loaded from the configured `shapes/` directory and executed against all matching pages during `wiki check`.

### Current pages in the vault by type

<!-- sparql:start -->
```sparql
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX schema: <https://schema.org/>

SELECT ?document ?type WHERE {
  ?document rdf:type ?type .
  FILTER(STRSTARTS(STR(?document), "wiki:"))
  FILTER(?type != schema:WebPage)
}
ORDER BY ?type
```

(no results)
<!-- sparql:end -->

### `Person` shape
* **givenName**: Required string (exactly 1)
* **familyName**: Required string (exactly 1)
* **context**: Required string (one-liner describing relationship)
* **status**: Required choice of either `permanent` or `one-off`
* **dateCreated**: Required date in YYYY-MM-DD format



## Design philosophies

The architecture of the Wiki CLI is governed by core Unix system design philosophies to ensure platform portability, scriptability, and robust performance in CI/CD pipelines.

### Silence is golden
By default, action-oriented subcommands (like `render` and `check --fix`) exit silently with code `0` upon success. This adheres strictly to the Unix philosophy, preventing unnecessary output log clutter and ensuring that commands can be seamlessly integrated into automated scripting. Users can opt-in to interactive summaries and details at any time by appending the `-v` or `--verbose` flag.

### Pipes and filters over custom hardware drivers
The CLI avoids platform lock-in and core scope creep by delegating hardware-level operations (like printing or typesetting) entirely to userland. Instead of maintaining complex margin-wrapping, font-measurement, or network spooling libraries, the CLI outputs clean, standard formats (`markdown`, `json`, `csv`, `table`) directly to standard output (`stdout`). This allows users to compose powerful piped chains using standard Unix utilities:
```bash
# Query names, format as a table, and print using system spooler
wiki query "SELECT ?name WHERE { ?s schema:name ?name }" | pr -h "Wiki Names" | lp
```

### Flat and streamlined command surface
The CLI features a flat, intuitive set of top-level commands with zero nested command groups, making the tool extremely easy to learn and script.


## Command reference

### `wiki create`
Instantly scaffolds a new markdown file in the configured `wikiDir`. It automatically standardizes the filename to lowercase kebab-case and pre-populates a valid frontmatter block with schema attributes resolved from the `WikiConfig`.
```bash
wiki create "Gregory Smith"
```

### `wiki check`
Unifies all vault health inspections under a single entry point, executing both strict semantic validations and softer stylistic audits.
```bash
# Run audits and output details/warnings verbosely
wiki check -v

# Run in strict mode (warnings are promoted to errors and fail CI)
wiki check --strict

# Automatically normalize and standardize frontmatter casing inline
wiki check --fix
```

### `wiki query`
Executes raw SPARQL SELECT or CONSTRUCT queries against your vault's unified graph.
```bash
wiki query "SELECT ?name WHERE { ?s schema:name ?name }"
```

### `wiki render`
Finds any dynamic SPARQL query comments (`<!-- sparql:start -->`) inside your markdown files and updates their tables inline.
```bash
# Render all tables silently (silence is golden)
wiki render

# Render with detailed verbose output
wiki render -v
```

### `wiki export`
Compiles all document frontmatter into a canonical JSON-LD array, acting as a clean extension point for bulk semantic integrations.
```bash
wiki export -o exported-wiki.json
```
