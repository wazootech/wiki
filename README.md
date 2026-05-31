# LLM Wiki (`wazootech-wiki`)

[![PyPI version](https://badge.fury.io/py/wazootech-wiki.svg)](https://pypi.org/project/wazootech-wiki/)
[![CI Status](https://github.com/wazootech/wiki/actions/workflows/ci.yml/badge.svg)](https://github.com/wazootech/wiki/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

An elegant, pure, and idiomatic Python command-line interface for managing a semantic knowledge base of markdown documents with SHACL validation and SPARQL reasoning.

Repository: [github.com/wazootech/wiki](https://github.com/wazootech/wiki). PyPI package: `wazootech-wiki`. CLI command: `wiki`.

Starter template repo: [github.com/wazootech/wiki-example](https://github.com/wazootech/wiki-example) (use GitHub’s “Use this template” button).

## Key features
- **Modern Packaging**: Configured cleanly with standard `pyproject.toml` optimized for `uv` or `pip`.
- **Pure Python CLI**: Comprehensive command suite — `check`, `query`, `render`, `build`, `serve`, `export`.
- **Flexible Frontmatter Parsing**: Supports YAML and JSON frontmatter blocks with standard triple-dash `---` boundaries.
- **RDF Context Support**: Supports JSON-LD `@context` style namespace, prefix mappings, and settings.
- **Deductive Reasoning**: Full OWL-RL deductive reasoning expansion powered by `owlrl`.
- **SHACL Validation**: Rich conformance testing of markdown files against loaded shapes powered by `pyshacl` with JSON and text reporting.
- **Dynamic SPARQL Rendering**: Scan and execute embedded SPARQL query blocks in markdown files, injecting updated results back into the documents inline.

## Installation

### From PyPI

```bash
pip install wazootech-wiki
```

Then verify the CLI is installed:

```bash
wiki --help
```

### From within this repo (editable)

```bash
# Using uv (fastest)
uv pip install -e .

# Using standard pip
pip install -e .
```

### Global install (use from any directory)

```bash
# From the repo root
uv pip install -e /path/to/wiki
```

Once installed globally, the `wiki` command is available in any directory that has a `wiki.yaml` configuration file. You can also point to a config explicitly with `-c <path>`.

## Quickstart

```bash
mkdir my-wiki
cd my-wiki

# Interactive scaffold: creates wiki.yaml and wiki/ starter files
wiki init

# Run unified checks (silent on success)
wiki check

# Start a local server (default: http://127.0.0.1:8080/wiki/)
wiki serve
```

## Subcommand guide


### `check`
Perform unified validations of your wiki, including strict SHACL schema validations and soft style/hygiene audits (configured filename style, broken internal wikilinks). Under the "silence is golden" philosophy, `check` exits silently with code 0 on success.

```bash
# Run unified checks on the entire wiki silently (default)
wiki check

# Check a single file specifically
wiki check wiki/gregory.md

# Autofix hygiene issues (rename non-kebab-case files + update wikilinks)
wiki check --fix

# Run with verbose output to show style/guideline warnings
wiki check -v

# Run in strict mode (warnings become errors and fail with non-zero exit code)
wiki check --strict
```

The top-level `filenameStyle` setting controls the naming convention, while `check.filenameStyle` controls whether violations are warnings, errors, or off:

```yaml
filenameStyle: kebab
check:
  filenameStyle: warning
```

Supported filename styles:

- `kebab` (default): `ethan-davidson.md`
- `wikipedia`: `Ethan_Davidson.md`

`wiki check --fix` renames files only in `kebab` mode. In `wikipedia` mode it reports violations without renaming files.

### `query`
Execute any SPARQL SELECT or CONSTRUCT query against the loaded and reasoning-expanded RDF graph.

```bash
# Execute direct query string and output as ASCII table
wiki query "SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 10"

# Query and output as Turtle (for CONSTRUCT queries)
wiki query "CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }" -f turtle

# Run query from stdin and write results to a file
cat my_query.sparql | wiki query -f markdown -o results.md

# Extract specific fields from JSON output (automatically selects -f json)
wiki query "SELECT ?name WHERE { ?s schema:name ?name }" --jq 'results.bindings[].name.value'
```

### `render`
Identify all embedded SPARQL blocks in your markdown files, run their queries against the reasoning-expanded RDF graph, and replace the outputs inline. Under the "silence is golden" Unix philosophy, this command exits silently with code 0 upon success.

```bash
# Render silently (default)
wiki render

# Render with verbose summary output
wiki render -v

# Check if any files are stale without modifying them (non-zero exit on stale)
wiki render --check
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

### `build`
Generate a static HTML site from your wiki markdown files for deployment to GitHub Pages or any static host.

```bash
# Build site (default: <slug>.html style)
wiki build

# Build with pretty directory URLs (<slug>/index.html)
wiki build --url-style dir

# Build to a custom directory with verbose output
wiki build --output-dir docs -v

# Build for a project site under /my-wiki/
wiki build --base-url /my-wiki --output-dir _site

# Build with pages at root level (no prefix)
wiki build --base-url '' --output-dir docs

# Automatically update all dynamic SPARQL blocks in source files before building
wiki build --render
```

The `--url-style` flag controls how pages are written to disk and linked:

- `file` (default): `_site/wiki/alice.html` on disk, `.html` in generated links
- `dir`: `_site/wiki/alice/index.html` on disk, clean `/wiki/alice` in links

The `--base-url` flag controls the URL prefix for wiki pages. Default is `/wiki`, so pages are accessible at `/wiki/{slug}`. Set it to an empty string for root-level URLs.

Output structure (default `--base-url /wiki` + `--url-style file`):
```
_site/
└── wiki/
    ├── index.html                  # Wiki index at /wiki/
    ├── alice.html                  # Page at /wiki/alice.html
    ├── bob.html
    └── bob/
        └── early-life.html         # H2 section at /wiki/bob/early-life.html
```

With `--url-style dir`:
```
_site/
└── wiki/
    ├── index.html                  # Wiki index at /wiki/
    ├── alice/
    │   └── index.html              # Page at /wiki/alice
    ├── bob/
    │   └── index.html
    └── bob/
        └── early-life/
            └── index.html          # H2 section at /wiki/bob/early-life
```

With `--base-url /my-wiki` + `--url-style dir`:
```
_site/
└── my-wiki/
    ├── index.html                  # Wiki index at /my-wiki/
    ├── alice/
    │   └── index.html              # Page at /my-wiki/alice
    └── ...
```

#### GitHub Pages deployment

Create `.github/workflows/deploy-pages.yml` in your wiki repository:

```yaml
name: Deploy Wiki to Pages

on:
  push:
    branches: ["main"]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4
      
      - name: Set up Python 3.12
        uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      
      - name: Set up uv
        uses: astral-sh/setup-uv@v5
        with:
          enable-cache: true
      
      - name: Install Dependencies
        run: uv sync
      
      - name: Run Docs Wiki Style and SHACL Audits
        run: uv run wiki -c docs/wiki.json check --strict -v

      - name: Build Static Site
        run: uv run wiki -c docs/wiki.json build --output-dir _site --base-url /wiki

      - name: Upload Pages Artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: "_site/wiki"

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

Then enable **GitHub Pages > Source: GitHub Actions** in your repo settings.

### `serve`
Start a local development HTTP server that renders wiki markdown files as HTML (wikilinks, backlinks, ToC included). Uses the same rendering engine as `build` but serves pages on-the-fly without writing files to disk.

```bash
# Default: http://127.0.0.1:8080
wiki serve

# Custom host and port
wiki serve --host 0.0.0.0 --port 3000

# Watch wiki files and auto-reload the browser on rebuild
wiki serve --watch
```

### `init`
Interactively scaffold a new wiki workspace (`wiki.yaml` + starter `wiki/` content) in the current directory.

```bash
wiki init
```

### `export`
Compile and export parsed **Frontmatter** blocks of documents in a supported RDF format.

When run without a file argument, exports all documents in the wiki directory.

**Note:** When using the default `dict` format or `json-ld`, each file's output is wrapped in a JSON object with `name` (the filename) and `rdf` (the content). For raw RDF formats (`turtle`, `xml`, `n3`, `nt`, `trig`, `nquads`), single-file export outputs raw serialized RDF directly (no JSON wrapper). Multi-file bulk export with raw formats still uses the JSON wrapper for structure.

```bash
# Export parsed frontmatter of the entire wiki as dict (default)
wiki export

# Export a single file
wiki export wiki/gregory.md

# Export as expanded JSON-LD
wiki export wiki/rdf.md -f json-ld

# Export in other RDF formats (turtle, xml, n3, nt, trig, nquads)
wiki export wiki/rdf.md -f turtle

# Write to a file
wiki export -f json-ld -o wiki-export.json
```


### Global options

These flags can be used on any subcommand:

| Option | Description |
|---|---|
| `-c, --config <path>` | Path to `wiki.yaml` config file or directory containing one (default: `.`) |
| `--input-dir <path>` | Directory containing wiki markdown files or RDF data files (can be repeated) |

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

While the LLM Wiki CLI operates as a standalone tool, it pairs naturally with Obsidian. You can seamlessly trigger operations directly from within your vault using the **Shell Commands** community plugin.

Recommended workflows:
* **Check on save**: Bind `wiki check` to execute whenever a file is modified to receive instant feedback on SHACL validations and formatting.
* **Trigger re-rendering**: Map a hotkey or command palette item to `wiki render` to automatically update all dynamic SPARQL blocks in the vault.

### Declarative modeling & full-text SPARQL

The LLM Wiki CLI natively turns your folder of Markdown files into an active logical ontology and validation graph.

#### Defining OWL classes and SHACL shapes recursively in frontmatter
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

#### Native microdata via HTML attributes
You are not limited to YAML headers! For rich semantic embedding directly inside your content flow, you can simply use standard **HTML5 Microdata** (`itemscope`, `itemtype`, `itemprop`) anywhere in your markdown body. The CLI parses the DOM tree via `BeautifulSoup` and injects assertions natively into the graph pool.

````markdown
# Product X Overview
Product X is state-of-the-art.

<div itemscope itemtype="https://schema.org/Product">
  Our latest model is the <span itemprop="name">Quantum Processor X</span>.
  
  <div itemprop="offers" itemscope itemtype="https://schema.org/Offer">
    Price: <span itemprop="price">999.99</span> 
    Currency: <meta itemprop="priceCurrency" content="USD" />
  </div>
</div>
````

#### Decentralized OWL inference
Because the tool integrates a full `owlrl` engine over the entire wiki graph, you can scatter ontological rules across disparate markdown pages and the CLI will automatically compute the logical closure. 

Define a class hierarchy inside a shape file:
```yaml
# wiki/engineer-definition.md
---
id: wiki:Engineer
type: owl:Class
rdfs:subClassOf: schema:Person
---
# Engineer
An Engineer is a specialized subset of Person.
```

Declare an instance somewhere else:
```yaml
# wiki/gregory.md
---
id: wiki:gregory
type: wiki:Engineer
name: Gregory
---
```

When you run queries, the reasoner **automatically infers** the implicit connection:
```sparql
# This returns Gregory, even though his type is "Engineer", NOT "Person"!
SELECT ?name WHERE {
  ?entity a schema:Person ;
          schema:name ?name .
}
```

#### Opt-in full-text SPARQL over markdown content
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
inputDirs:
  - wiki
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
*   [CONTEXT.md](https://github.com/wazootech/wiki/blob/main/CONTEXT.md) — Glossary and Domain Model mapping.
*   [0001-context-centric-configuration.md](https://github.com/wazootech/wiki/blob/main/docs/adr/0001-context-centric-configuration.md) — Architectural Decision Record (ADR) on context naming.
*   [0002-userland-printing.md](https://github.com/wazootech/wiki/blob/main/docs/adr/0002-userland-printing.md) — Architectural Decision Record (ADR) on adopting userland printing filters.
*   [0003-silence-is-golden.md](https://github.com/wazootech/wiki/blob/main/docs/adr/0003-silence-is-golden.md) — Architectural Decision Record (ADR) on silent default behaviors.
*   [0004-unified-check-and-wikiconfig.md](https://github.com/wazootech/wiki/blob/main/docs/adr/0004-unified-check-and-wikiconfig.md) — Architectural Decision Record (ADR) on unified check command and WikiConfig.
*   [0005-streamlined-cli-architecture.md](https://github.com/wazootech/wiki/blob/main/docs/adr/0005-streamlined-cli-architecture.md) — Architectural Decision Record (ADR) on streamlined CLI architecture.


