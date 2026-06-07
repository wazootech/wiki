# Wiki CLI (`wazootech-wiki`)

[![PyPI version](https://badge.fury.io/py/wazootech-wiki.svg)](https://pypi.org/project/wazootech-wiki/)
[![CI Status](https://github.com/wazootech/wiki/actions/workflows/ci.yml/badge.svg)](https://github.com/wazootech/wiki/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

An elegant, pure, and idiomatic Python command-line interface for managing a semantic knowledge base of markdown documents with SHACL validation and SPARQL reasoning.

Repository: [github.com/wazootech/wiki](https://github.com/wazootech/wiki). PyPI package: `wazootech-wiki`. CLI command: `wiki`.

Starter template repo: [github.com/wazootech/wiki-example](https://github.com/wazootech/wiki-example) (use GitHub’s “Use this template” button).

## Key features
- **Modern Packaging**: Configured cleanly with standard `pyproject.toml` optimized for `uv` or `pip`.
- **Pure Python CLI**: Comprehensive command suite — `check`, `lint`, `link`, `fmt`, `query`, `render`, `build`, `serve`, `view`, `export`, `init`.
- **Terminal Document View**: Render a single wiki document as a readable terminal infobox with `wiki view`.
- **Flexible Frontmatter Parsing**: Supports YAML and JSON frontmatter blocks with standard triple-dash `---` boundaries.
- **RDF Context Support**: Supports JSON-LD `@context` style namespace, prefix mappings, and settings.
- **Deductive Reasoning**: Full OWL-RL deductive reasoning expansion powered by `owlrl`.
- **SHACL Validation**: Rich conformance testing of markdown files against loaded shapes powered by `pyshacl` with JSON and text reporting.
- **Dynamic SPARQL Rendering**: Scan and execute embedded SPARQL query blocks in markdown files, injecting updated results back into the documents inline.
- **Typed HTML Rendering**: Build typed pages with template selection via `template` or `wiki:template`, sidebar infoboxes with clickable wiki and external links, and a no-JavaScript metadata pane (JSON-LD, Turtle, N3, RDF/XML, N-Triples, TriG, N-Quads).

## Installation

### From PyPI

```bash
pip install wazootech-wiki
```

Then verify the CLI is installed:

```bash
wiki --help
```

On Windows, if `wiki --help` is missing newer subcommands that do work with `python -m wiki`, check which launcher PATH is using:

```powershell
Get-Command wiki
where.exe wiki
python -m wiki --help
```

Multiple `wiki.exe` shims can coexist across Python installs. If PATH is preferring a stale launcher, run `python -m wiki upgrade -y` with the intended Python environment and remove or refresh the older `wiki.exe`.

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

## Local development

Use this repo's docs wiki as the main contributor sandbox.

```bash
# Install the project in editable mode
uv pip install -e .

# Run the docs wiki integrity checks from the repo root
wiki -c docs/wiki.yaml check
wiki -c docs/wiki.yaml lint

# Start the docs wiki local preview with auto-reload
python -m wiki -c docs/wiki.yaml serve --watch
```

`serve --watch` rebuilds when files under `input_dirs` and `asset_dirs` change. It does **not** hot-reload Python changes in `src/wiki/` — restart the server after editing CLI code (even when using `python -m wiki`).

Suggested contributor loop:

- Edit files under `docs/wiki/`.
- Use `python -m wiki -c docs/wiki.yaml serve --watch` for the main live-preview workflow (restart after CLI changes).
- Run `wiki -c docs/wiki.yaml check --strict -v` and `wiki -c docs/wiki.yaml lint --strict -v` before landing documentation changes.
- Use `wiki render --cache` or `wiki build --render --cache` when you want faster repeated one-shot SPARQL runs across fresh shells.

## Quickstart

```bash
mkdir my-wiki
cd my-wiki

# Interactive scaffold: creates wiki.yaml and wiki/ starter files
wiki init

# Also initialize a Git repository explicitly
wiki init --git

# Run integrity checks (silent on success)
wiki check

# Run convention audits (silent on success)
wiki lint

# Start a local server (default: http://127.0.0.1:8080/wiki/)
wiki serve
```

## Subcommand guide


### `check`
Run **integrity** validations: strict SHACL schema validation, route safety, output collisions, and configurable broken-link audits. Under the "silence is golden" philosophy, `check` exits silently with code 0 on success.

```bash
wiki check
wiki check wiki/Gregory_Davidson.md
wiki check -v
wiki check --strict
```

Default configurable rule: `check.broken_links` (`warning`). Filename pattern and heading style moved to `wiki lint`.

### `lint`
Run **convention** audits: filename pattern and heading style.

```bash
wiki lint
wiki lint wiki/Gregory_Davidson.md
wiki lint -v
wiki lint --strict
```

Use top-level `filename_pattern` for the regex (matched against the **full** `.md` filename). Set severity under `lint:`:

```yaml
filename_pattern: "[A-Za-z0-9_()-]+\\.md"
check:
  broken_links: warning
lint:
  filename_pattern: warning
  headings: off
```

**Wikipedia-style** names (for example `Gregory_Davidson.md`, `Wiki_CLI.md`) are the recommended default. Lowercase kebab-case is optional — only use it if you configure a matching pattern (for example `[a-z0-9-]+\\.md`). Build-safety rules, such as rejecting spaces and unsafe URL characters in page paths, are always enforced separately in `wiki check`.

### `link`
Suggest missing wikilinks for plain-text page mentions, or repair unambiguous broken internal links. Report-only by default.

```bash
wiki link
wiki link wiki/Some_Page.md
wiki link -v
wiki link --check
wiki link --dry-run --apply
wiki link --apply
wiki link --fix-broken
```

`wiki check` reports broken links (`check.broken_links`). `wiki link` enriches prose with new wikilinks (`--apply`) or fixes typos and renames when the target is unique (`--fix-broken`). Optional `link_renames` in `wiki.yaml` maps old slugs to new routes for renames.

### `query`
Execute any SPARQL SELECT or CONSTRUCT query against the loaded and reasoning-expanded RDF graph. The graph is built once per process and reused across queries in the same run (see **Graph cache** under `render`). Use `--cache` to persist a warm graph under `.wiki/cache/` for reuse across new CLI processes.

```bash
# Execute direct query string and output as ASCII table
wiki query "SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 10"

# Query and output as Turtle (for CONSTRUCT queries)
wiki query "CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }" -f turtle

# Run query from stdin and write results to a file
cat my_query.sparql | wiki query -f markdown -o results.md

# Extract specific fields from JSON output (automatically selects -f json)
wiki query "SELECT ?name WHERE { ?s schema:name ?name }" --jq 'results.bindings[].name.value'

# Rebuild the in-memory graph before querying (same process only)
wiki query "SELECT ?name WHERE { ?s schema:name ?name }" --reload

# Persist a warm graph for reuse across new CLI processes
wiki query --cache "SELECT ?name WHERE { ?s schema:name ?name }"
```

### `render`
Identify embedded SPARQL blocks in your markdown files, run their queries against the reasoning-expanded RDF graph, and replace the outputs inline. Under the "silence is golden" Unix philosophy, this command exits silently with code 0 upon success.

Each `wiki render` run builds the RDF graph once, then evaluates every SPARQL block in scope against that same graph (all markdown files with blocks, or a single file / glob when scoped).

```bash
# Render all SPARQL blocks in the vault
wiki render

# Rebuild the in-memory graph before rendering (same process only)
wiki render --reload

# Render with verbose summary output
wiki render -v

# Persist a warm graph for reuse across repeated one-shot renders
wiki render --cache

# Check if any stale blocks need updating (non-zero exit on stale)
wiki render --check

# Render a single file during an edit loop
wiki render wiki/people/Gregory_Davidson.md

# Render only matching markdown files
wiki render --glob "wiki/people/*.md"

# Skip OWL-RL during editing when queries use asserted triples only
wiki render --no-inference
```

**Graph cache:** By default, the vault graph (including OWL-RL when inference is on) is built once per process and reused for every SPARQL query and `render` pass in that run, so you do not reload the graph for each block or subcommand. A new shell still starts cold unless you opt into `--cache`, which persists the current graph under `.wiki/cache/` and reuses it across one-shot `query`, `render`, and `build --render` invocations when the vault fingerprint still matches. Use `wiki serve --watch` for a long-lived process that rebuilds the graph and SPARQL output when files under `input_dirs` or `asset_dirs` change (not when CLI source code changes).

Disk-cache tradeoffs: `--cache` speeds up repeated one-shot commands on unchanged vaults, but it adds `.wiki/cache/` artifacts and still invalidates on vault or config changes. `--reload` rebuilds from source and refreshes the current cache entry.

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
# Build site (default: clean directory URLs)
wiki build

# Build with explicit .html URLs instead
wiki build --url-style file

# Build to a custom directory with verbose output
wiki build --output-dir docs -v

# Build for a project site under /my-wiki/
wiki build --base-url /my-wiki --output-dir _site

# Build with pages at root level (no prefix)
wiki build --base-url '' --output-dir docs

# Automatically update all dynamic SPARQL blocks in source files before building
wiki build --render

# Rebuild the in-memory graph before rendering SPARQL blocks (same process only)
wiki build --render --reload

# Persist a warm graph for reuse across repeated build --render runs
wiki build --render --cache

# Skip pre-build integrity and lint checks
wiki build --no-check
```

The `--url-style` flag controls how pages are written to disk and linked:

- `dir` (default): `_site/wiki/alice/index.html` on disk, clean `/wiki/alice/` in links
- `file`: `_site/wiki/alice.html` on disk, `.html` in generated links

The `--base-url` flag controls the URL prefix for wiki pages. Default is `/wiki`, so pages are accessible at `/wiki/{PageStem}/`. Set it to an empty string for root-level URLs. GitHub Pages paths are case-sensitive.

Output structure (default `--base-url /wiki` + `--url-style dir`):
```
_site/
└── wiki/
    ├── index.html                  # Wiki index at /wiki/
    ├── Alice/
    │   └── index.html              # Page at /wiki/Alice/
    └── Pokemon_Diamond_(copy_1)/
        └── index.html              # Page at /wiki/Pokemon_Diamond_(copy_1)/
```

With `--url-style file`:
```
_site/
└── wiki/
    ├── index.html                  # Wiki index at /wiki/
    ├── Alice.html                  # Page at /wiki/Alice.html
    └── Pokemon_Diamond_(copy_1).html
```

With `--base-url /my-wiki` + `--url-style dir`:
```
_site/
└── my-wiki/
    ├── index.html                  # Wiki index at /my-wiki/
    ├── alice/
    │   └── index.html              # Page at /my-wiki/alice/
    └── ...
```

Page URLs are derived from the source path under `input_dirs`, minus `.md`, with case preserved. Folders are preserved. `index.md` maps to its containing folder route, so `wiki/index.md` owns `/wiki/` and `wiki/games/index.md` owns `/wiki/games/`. For ordinary pages, the default examples use Wikipedia-style filenames such as `Gregory_Davidson.md` and `Pokemon_Diamond.md`. Headings do not create separate pages; they receive GitHub-compatible fragment IDs such as `#release-history`.

`wiki build` runs `wiki check` and `wiki lint` before cleaning output unless `--no-check` is passed. If checks fail, the previous output is left untouched. Once checks pass, the owned output path is treated as disposable build output and rebuilt.

Static assets can be published from configured asset directories:

```yaml
asset_dirs:
  - assets
exclude:
  - assets/private/**
```

Asset directories are relative to the config file and copied under the base URL preserving their configured path, e.g. `assets/items/photo.jpg` becomes `/wiki/assets/items/photo.jpg`.

#### Page templates and infoboxes

The HTML builder supports lightweight typed page templates. Template selection order is:

1. `wiki:template` frontmatter property
2. `template` frontmatter property
3. among `type` / `@type` values, the first whose stem is `person`, `thing`, or `pet` (built-in layout names)
4. otherwise the first `type` / `@type` value
5. `default` when no type is set

Any article with displayable frontmatter gets a sidebar infobox (not only `person` / `thing` / `pet` pages). Structural keys such as `@context`, `@id`, `id`, `@type`, `type`, `template`, and `wiki:template` are hidden from the infobox. Infobox values become links automatically when they reference another wiki page or an external URL.

```yaml
id: wiki:Gregory_Davidson
type: schema:Person
wiki:template: person
knows: wiki:Bella_Davidson
url: https://example.com/gregory
```

In the built site:

- `wiki:Bella_Davidson` links to the `Bella_Davidson` page when that page exists
- `https://example.com/gregory` renders as an external link
- `wiki:template` controls the page layout class and is hidden from the infobox itself

Use SHACL to constrain template usage when needed, for example requiring at most one `wiki:template` value:

```yaml
id: wiki:PersonShape
type: sh:NodeShape
sh:targetClass: schema:Person
sh:property:
  - sh:path: schema:name
    sh:datatype: xsd:string
    sh:minCount: 1
  - sh:path: wiki:template
    sh:datatype: xsd:string
    sh:maxCount: 1
```

#### Metadata pane (RDF views)

Built and served HTML pages include a **Metadata** tab with a no-JavaScript format picker (CSS radio buttons). The pane uses the same serialization path as `wiki export`:

- JSON-LD (expanded and compacted)
- Turtle, N3, RDF/XML, N-Triples, TriG, N-Quads

`wiki build` embeds all format views in each page. On `wiki serve`, set the initial view with query parameters, for example `?metadata_format=turtle` or `?metadata_format=json-ld&metadata_mode=compacted`. Aliases such as `ttl`, `rdf`, and `jsonld` are accepted.

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
      
      - name: Run Docs Wiki Integrity Audits
        run: uv run wiki -c docs/wiki.yaml check --strict -v

      - name: Run Docs Wiki Convention Audits
        run: uv run wiki -c docs/wiki.yaml lint --strict -v

      - name: Build Static Site
        run: uv run wiki -c docs/wiki.yaml build --output-dir _site --base-url /wiki

      - name: Upload Pages Artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: "_site/wiki"

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

Then enable **GitHub Pages > Source: GitHub Actions** in your repo settings.

### `view`
Render a single wiki document as a terminal-friendly infobox view.

```bash
# View a markdown page with infobox and body
wiki view wiki/Gregory_Davidson.md

# View a data-only record
wiki view wiki/Bella_Davidson.yaml
```

`wiki view` reuses the same page typing and infobox resolution as `wiki build` and `wiki serve`:

- template names are shown as file-style identifiers like `Person.html`
- internal wiki references are displayed using the target page title
- markdown pages include their body below the infobox
- data-only pages show their title and infobox without a markdown body

### `serve`
Start a local development HTTP server that renders wiki markdown files as HTML (wikilinks, backlinks, ToC, infobox, and metadata pane included). Uses the same rendering engine as `build` but serves pages on-the-fly without writing files to disk.

```bash
# Default: http://127.0.0.1:8080/wiki/ (when base_url is /wiki)
wiki serve

# Custom host and port
wiki serve --host 0.0.0.0 --port 3000

# Watch vault files; rebuild graph, SPARQL blocks, and reload the browser on change
wiki serve --watch

# Editable install: run the in-repo package without reinstalling after pip/uv -e .
python -m wiki serve --watch
```

`--watch` polls `input_dirs` and `asset_dirs` only. Restart the server after changing Python code in the installed package. Set the metadata pane with `?metadata_format=FORMAT` (for example `turtle`, `ttl`, or `json-ld`) and, for JSON-LD, `?metadata_mode=expanded|compacted`.

When `serve_api.enabled` is true in `wiki.yaml`, `wiki serve` also exposes a read-only SPARQL endpoint (default path `/api/sparql`).

### `init`
Interactively scaffold a new wiki workspace (`wiki.yaml` + starter `wiki/` content) in the current directory.

```bash
wiki init

# Also initialize a Git repository explicitly
wiki init --git
```

### `export`
Compile and export parsed **Frontmatter** blocks of documents in a supported RDF format.

When run without a file argument, exports all documents in the wiki directory.

**Note:** When using the default `dict` format or `json-ld`, each file's output is wrapped in a JSON object with `name` (the filename) and `rdf` (the content). For raw RDF formats (`turtle`, `xml`, `n3`, `nt`, `trig`, `nquads`), single-file export outputs raw serialized RDF directly (no JSON wrapper). Multi-file bulk export with raw formats still uses the JSON wrapper for structure.

```bash
# Export parsed frontmatter of the entire wiki as dict (default)
wiki export

# Export a single file
wiki export wiki/Gregory_Davidson.md

# Export as JSON-LD
wiki export wiki/rdf.md -f json-ld

# Export as compacted JSON-LD
wiki export wiki/rdf.md -f json-ld --mode compacted

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
  cat wiki/Gregory_Davidson.md | pr -h "Gregory Document" | lp
  ```
* **Format and Print Query Results:**
  Run a query and print its tabular results:
  ```bash
  wiki query "SELECT ?s ?p WHERE { ?s ?p ?o }" | pr -h "SPARQL Graph Query" | lp
  ```

#### Windows
* **Print a Document:**
  ```powershell
  Get-Content wiki/Gregory_Davidson.md | Out-Printer
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

### Declarative modeling & full-text SPARQL

The Wiki CLI natively turns your folder of Markdown files into an active logical ontology and validation graph.

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
You are not limited to YAML headers! For rich semantic embedding directly inside your content flow, you can simply use standard **HTML5 Microdata** (`itemscope`, `itemtype`, `itemprop`) anywhere in your markdown body. The CLI parses the DOM tree via `BeautifulSoup` and injects assertions natively into the graph pool. Prefixed CURIEs in `itemtype`, `itemid`, `itemprop`, `href`, and `src` expand through the same `context` bindings as frontmatter (for example `schema:Product`, `wiki:Gregory_Davidson`).

````markdown
# Product X Overview
Product X is state-of-the-art.

<div itemscope itemtype="schema:Product" itemid="wiki:Product_X">
  Our latest model is the <span itemprop="schema:name">Quantum Processor X</span>.
  
  <div itemprop="schema:offers" itemscope itemtype="schema:Offer">
    Price: <span itemprop="schema:price">999.99</span> 
    Currency: <meta itemprop="schema:priceCurrency" content="USD" />
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
# wiki/Gregory_Davidson.md
---
id: wiki:Gregory_Davidson
type: wiki:Engineer
name: Gregory Davidson
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
By enabling `content_predicate` in your `wiki.yaml`, the unstructured markdown body (everything after the frontmatter) is automatically loaded as a literal under your configured predicate (e.g. `schema:text`). This allows you to perform hybrid logical and full-text searches inside a single SPARQL query:

```sparql
PREFIX schema: <https://schema.org/>

SELECT ?doc ?content WHERE {
  ?doc a wiki:Dog ;
       schema:text ?content .
  FILTER(CONTAINS(LCASE(?content), "swimming"))
}
```

## Workspace configuration (`WikiConfig`)

The CLI automatically detects and loads configurations from `wiki.yaml`, `wiki.yml`, or `wiki.json` in your current working directory. The configuration file holds CLI parameters and check/lint severities, with an embedded `@context` or `context` block defining prefix mappings:

```yaml
# wiki.yaml
input_dirs:
  - wiki
asset_dirs:
  - assets
base_url: /wiki
url_style: dir
filename_pattern: "[A-Za-z0-9_()-]+\\.md"
exclude:
  - assets/private/**
content_predicate: schema:text # Opt-in full-text markdown body auto-injection

check:
  broken_links: warning      # "error" | "warning" | "off"

lint:
  filename_pattern: warning  # "error" | "warning" | "off"
  headings: off              # sentence case, numbered headings, body ---

html_template: index.html    # optional custom HTML shell; see docs/wiki/Wiki_Configuration.md

serve_api:
  enabled: false             # opt-in read-only SPARQL endpoint on wiki serve
  path: /api/sparql

context:
  schema: https://schema.org/
  wiki: https://book.etok.me/wiki/
  foaf: http://xmlns.com/foaf/0.1/
```

## Glossary and decisions
To understand the domain terminology (such as **Wiki**, **Document**, **Context**, **Validation**, and **Shape**), please refer to:
*   [CONTEXT.md](https://github.com/wazootech/wiki/blob/main/CONTEXT.md) — Glossary and Domain Model mapping.


