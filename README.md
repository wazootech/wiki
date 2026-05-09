# Wiki CLI

An elegant, pure, and idiomatic Python command-line interface for managing a semantic knowledge base of markdown documents with SHACL validation and SPARQL reasoning.

## Key features
- **Modern Packaging**: Configured cleanly with standard `pyproject.toml` optimized for `uv` or `pip`.
- **Pure Python CLI**: Subcommands mapped elegantly (`validate`, `query`, `render`, `frontmatter`).
- **Flexible Frontmatter Parsing**: Supports YAML and JSON frontmatter blocks with standard triple-dash `---` boundaries.
- **RDF Context Support** Supports JSON-LD `@context` style namespace, prefix mappings, and settings.
- **Deductive Reasoning**: Full OWL-RL deductive reasoning expansion powered by `owlrl`.
- **SHACL Validation**: Rich conformance testing of markdown files against loaded shapes powered by `pyshacl` with JSON and text reporting.
- **Dynamic SPARQL Rendering**: Scan and execute embedded SPARQL query blocks in markdown files, injecting updated results back into the documents inline.

## Installation

Install the package and its dependencies using `uv` (recommended) or `pip`:

```bash
# Using uv (fastest)
uv pip install -e .

# Using standard pip
pip install -e .
```

## Subcommand guide

### `create`
Scaffold a new markdown **Document** in your wiki directory. It automatically normalizes the input into a lowercase kebab-case filename and inserts a pre-populated valid **Frontmatter** template containing standard schema mappings.

```bash
# Scaffold a new document
wiki create "My New Page"

# Scaffold a new document with verbose output
wiki create "My New Page" -v
```

### `check`
Perform unified validations of your wiki, including strict SHACL schema validations and soft style/hygiene audits (kebab-case filenames, broken internal wikilinks). Under the "silence is golden" philosophy, `check` exits silently with code 0 on success.

```bash
# Run unified checks on the entire wiki silently (default)
wiki check

# Check a single file specifically
wiki check wiki/gregory.md

# Run checks and automatically normalize/standardize frontmatter block casing and formatting
wiki check --fix

# Run with verbose output to show style/guideline warnings
wiki check -v

# Run in strict mode (warnings become errors and fail with non-zero exit code)
wiki check --strict
```

### `query`
Execute any SPARQL SELECT or CONSTRUCT query against the loaded and reasoning-expanded RDF graph.

```bash
# Execute direct query string and output as ASCII table
wiki query "SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 10"

# Query and output as Turtle (for CONSTRUCT queries)
wiki query "CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }" -f turtle

# Run query from stdin and write results to a file
cat my_query.sparql | wiki query -f markdown -o results.md
```

### `render`
Identify all embedded SPARQL blocks in your markdown files, run their queries against the reasoning-expanded RDF graph, and replace the outputs inline. Under the "silence is golden" Unix philosophy, this command exits silently with code 0 upon success.

```bash
# Render silently (default)
wiki render

# Render with verbose summary output
wiki render -v
```

An embedded SPARQL block is defined in your markdown files like this:
````html
<!-- sparql:start -->
```sparql
SELECT ?name ?email WHERE {
  ?person a schema:Person ;
          schema:name ?name ;
          schema:email ?email .
}
```

| Name | Email |
| --- | --- |
| Gregory | gregory@example.com |
<!-- sparql:end -->
````

### `export`
Compile and export parsed **Frontmatter** blocks of documents into a single canonical JSON-LD representation.

```bash
# Export parsed frontmatter of the entire wiki as JSON-LD
wiki export

# Export parsed frontmatter of a single document
wiki export wiki/gregory.md

# Write exported JSON-LD to a file
wiki export -o wiki.jsonld
```


### Printing and piping
Following the Unix philosophy of pipes and filters, `wiki` works seamlessly with native system utilities. Outputs from query execution or document inspection can be easily formatted and spooled directly to your printer.

#### Unix/macOS
* **Format and Print a Document:**
  Use `pr` to add headers, margins, and page numbers before sending to `lp`:
  ```bash
  cat wiki/gregory.md | pr -h "Gregory Document" | lp
  ```
* **Format and Print Query Results:**
  Run a query and print its tabular results:
  ```bash
  wiki query "SELECT ?s ?p WHERE { ?s ?p ?o }" | pr -h "SPARQL Graph Query" | lp
  ```

#### Windows
* **Print a Document:**
  ```powershell
  Get-Content wiki/gregory.md | Out-Printer
  ```
* **Print Query Results:**
  ```powershell
  wiki query "SELECT ?s ?p WHERE { ?s ?p ?o }" | Out-Printer
  ```

### Obsidian integration

While the Wiki CLI operates as a standalone tool, it pairs naturally with Obsidian. You can seamlessly trigger operations directly from within your vault using the **Shell Commands** community plugin.

Recommended workflows:
* **Check on save**: Bind `wiki check` to execute whenever a file is modified to receive instant feedback on SHACL validations and formatting.
* **Trigger re-rendering**: Map a hotkey or command palette item to `wiki render` to automatically update all dynamic SPARQL blocks in the vault.
* **Create new documents**: Map a hotkey or command palette item to `wiki create` to automatically generate a new markdown file with pre-populated frontmatter.

### Declarative modeling & full-text SPARQL

The Wiki CLI natively turns your folder of Markdown files into an active logical ontology and validation graph.

#### 1. Defining OWL Classes and SHACL Shapes recursively in Frontmatter
Because our frontmatter parser natively supports nested dictionary conversion to RDF blank nodes, you can define complete validation shapes and ontological classes inside any document's frontmatter:

```yaml
# wiki/dog-shape.md
---
id: wiki:DogShape
type: sh:NodeShape
sh:targetClass: wiki:Dog
sh:property:
  sh:path: schema:name
  sh:datatype: xsd:string
  sh:minCount: 1
---

# Dog Shape
Requires that all `wiki:Dog` documents must declare a name.
```

#### 2. Opt-in full-text SPARQL over Markdown Content
By enabling `contentPredicate` in your `wiki.yaml`, the unstructured markdown body (everything after the frontmatter) is automatically loaded as a literal under your configured predicate (e.g. `schema:text`). This allows you to perform hybrid logical and full-text searches inside a single SPARQL query:

```sparql
PREFIX schema: <https://schema.org/>

SELECT ?doc ?content WHERE {
  ?doc a wiki:Dog ;
       schema:text ?content .
  FILTER(CONTAINS(LCASE(?content), "swimming"))
}
```

## Workspace configuration (`WikiConfig`)

The CLI automatically detects and loads configurations from `wiki.yaml`, `wiki.yml`, or `wiki.json` in your current working directory. The configuration file holds CLI parameters and custom checking severities, with an embedded `@context` or `context` block defining prefix mappings:

```yaml
# wiki.yaml
wikiDir: wiki
shapesDir: shapes
contentPredicate: schema:text # Opt-in full-text markdown body auto-injection

check:
  filenameStyle: warning     # "error" | "warning" | "off"
  internalLinks: warning     # "error" | "warning" | "off"

context:
  schema: https://schema.org/
  wiki: https://book.etok.me/wiki/
  foaf: http://xmlns.com/foaf/0.1/
```

## Glossary and decisions
To understand the domain terminology (such as **Wiki**, **Document**, **Context**, **Validation**, and **Shape**), please refer to:
*   [CONTEXT.md](CONTEXT.md) — Glossary and Domain Model mapping.
*   [0001-context-centric-configuration.md](docs/adr/0001-context-centric-configuration.md) — Architectural Decision Record (ADR) on context naming.
*   [0002-userland-printing.md](docs/adr/0002-userland-printing.md) — Architectural Decision Record (ADR) on adopting userland printing filters.
*   [0003-silence-is-golden.md](docs/adr/0003-silence-is-golden.md) — Architectural Decision Record (ADR) on silent default behaviors.
*   [0004-unified-check-and-wikiconfig.md](docs/adr/0004-unified-check-and-wikiconfig.md) — Architectural Decision Record (ADR) on unified check command and WikiConfig.
*   [0005-streamlined-cli-architecture.md](docs/adr/0005-streamlined-cli-architecture.md) — Architectural Decision Record (ADR) on streamlined CLI architecture.


