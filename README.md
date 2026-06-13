# Wiki CLI

[![PyPI version](https://badge.fury.io/py/wazootech-wiki.svg)](https://pypi.org/project/wazootech-wiki/)
[![npm version](https://img.shields.io/npm/v/wazootech-wiki)](https://www.npmjs.com/package/wazootech-wiki)
[![CI Status](https://github.com/wazootech/wiki/actions/workflows/ci.yml/badge.svg)](https://github.com/wazootech/wiki/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![skills.sh](https://skills.sh/b/wazootech/wiki)](https://skills.sh/wazootech/wiki)

**Wiki CLI** is a command-line toolchain and compiler for Markdown wikis. It compiles a directory of Markdown documents with structured metadata (YAML or JSON frontmatter) into a queryable semantic graph, validating data integrity with SHACL and JSON Schema, executing queries with SPARQL, and building static websites. It operates as an independent semantic layer underneath your markdown files, meaning you can keep writing in Obsidian, VS Code, or any other editor without changing your tools.

Repository: [github.com/wazootech/wiki](https://github.com/wazootech/wiki). CLI command: `wiki`. Install via [pip](https://pypi.org/project/wazootech-wiki/) or [npm](https://www.npmjs.com/package/wazootech-wiki).

Starter template: [github.com/wazootech/wiki-template](https://github.com/wazootech/wiki-template) (GitHub **Use this template**).


## Use cases and integrations

Wiki CLI is **interop-first**: a general-purpose semantic layer that runs beside your existing wiki without owning the editor.

- **Obsidian & PKM** — Validate links and run queries inside your personal wiki. See [Obsidian integration](docs/wiki/Obsidian_Integration.md).
- **Static Documentation & Wikis** — Auto-generate styled HTML documentation pages, tables of contents, and sidebar infoboxes for publishing to GitHub Pages or static hosts.
- **LLM Wikis & Agent Memory** — Validate and query machine-generated Markdown databases. See [LLM Wiki](docs/wiki/LLM_Wiki.md).
- **Adoption path** — `wiki init` → `wiki check` → `wiki serve` (add `lint`, `query`, and `build` as you need them).

### Distinguishing Wiki CLI from Farzapedia

While inspired by personal digital gardens like **Farzapedia** (a subjective, first-person memory wiki optimized for a single agent), **Wiki CLI** is a general-purpose, multi-player toolchain:
- **Farzapedia** is a specific *content wiki* containing diary entries, notes, and messages.
- **Wiki CLI** is a *utility* for *any* wiki. It compiles Markdown files, enforces structure (SHACL and JSON Schema), queries data (SPARQL), and builds static websites.

Adoption path: [Wiki CLI](docs/wiki/Wiki_CLI.md) in the docs wiki.

## Key features

Three beats, one toolchain:

| Beat | Commands | What you get |
|------|----------|--------------|
| **Trust** | [`check`](#check), [`lint`](#lint), [`fmt`](#fmt) | SHACL and JSON Schema integrity, wiki conventions, mechanical Markdown layout |
| **Intelligence** | [`query`](#query), [`render`](#render), [`export`](#export) | OWL-RL inference, inline SPARQL tables, JSON-LD and RDF serializations |
| **Publish** | [`build`](#build), [`serve`](#serve), [`link`](#link) | Static HTML with infoboxes and metadata pane, local preview, optional read-only SPARQL endpoint, wikilink hygiene |

Also: [`init`](#init) scaffolds `wiki.yaml`; `wiki query --pretty` renders Rich tables in the terminal; YAML/JSON frontmatter and HTML microdata map into the same RDF graph; per-page layouts via `wazoo:layout`.

## Ecosystem templates

| Template | Purpose |
|----------|---------|
| [wiki-template](https://github.com/wazootech/wiki-template) | Starter wiki — use GitHub **Use this template** |
| [sparql-service-template](https://github.com/wazootech/sparql-service-template) ([Pages demo](https://wazootech.github.io/sparql-service-template/)) | YASGUI demo against exported Turtle or a live `wiki serve` endpoint |
| [nextjs-template](https://github.com/wazootech/nextjs-template) | OAuth 2.0-protected, Next.js wiki viewer ([#15](https://github.com/wazootech/wiki/issues/15)) |
| [obsidian-quartz-template](https://github.com/wazootech/obsidian-quartz-template) | Obsidian PKM viewer ([#16](https://github.com/wazootech/wiki/issues/16)) |
| [wiki-mintlify-template](https://github.com/wazootech/wiki-mintlify-template) | Mintlify/Holocron viewer ([#31](https://github.com/wazootech/wiki/issues/31)) |


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

### From npm

```bash
npm install -g wazootech-wiki
```

This installs the `wiki` command globally via npm. The npm package automatically creates a private Python virtual environment and installs the matching PyPI version of `wazootech-wiki` as the engine. Python 3.12 or newer is required.

Zero-install (no install required):

```bash
npx wazootech-wiki --help
uvx wazootech-wiki --help
```

### Standalone binary (no Python required)

Pre-built executables ship on [GitHub Releases](https://github.com/wazootech/wiki/releases) for Linux (x64), macOS (arm64 and x64), and Windows (x64). Each release includes a `SHA256SUMS` file.

```bash
# Linux / macOS — verify checksum, then extract
sha256sum -c SHA256SUMS
tar -xzf wazootech-wiki-VERSION-linux-x64.tar.gz
./wiki --help
```

```powershell
# Windows — verify checksum, then extract
Get-FileHash wazootech-wiki-VERSION-windows-x64.zip -Algorithm SHA256
Expand-Archive wazootech-wiki-VERSION-windows-x64.zip -DestinationPath .
.\wiki.exe --help
```

Add the directory containing `wiki` (or `wiki.exe`) to your `PATH`, or invoke it by full path. Standalone builds do not use `pip`; run `wiki upgrade` to see download instructions when a newer release is available.

On macOS, Gatekeeper may block unsigned binaries until you allow them in System Settings or run `xattr -d com.apple.quarantine ./wiki` after verifying the checksum.

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

`serve --watch` rebuilds when files under `wiki.inputs` and `wiki.assets` change. It does **not** hot-reload Python changes in `src/wiki/` — restart the server after editing CLI code (even when using `python -m wiki`).

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
Run **integrity** validations: strict SHACL validation, JSON Schema frontmatter validation, route safety, output collisions, and layout frontmatter. Under the "silence is golden" philosophy, `check` exits silently with code 0 on success.

```bash
wiki check
wiki check wiki/Gregory_Davidson.md
wiki check -v
wiki check --strict
```

Single-file mode runs SHACL and JSON Schema validation for that document only. Broken links and other conventions are **`wiki lint`**.

### `lint`
Run **convention** audits: broken links, filename pattern, heading style (ATX `#` only, sentence-case H2+), and link style.

```bash
wiki lint
wiki lint wiki/Gregory_Davidson.md
wiki lint -v
wiki lint --strict
```

Use `wiki.filename_pattern` for the regex (matched against the **full** `.md` filename). Set severity under `lint:`:

```yaml
wiki:
  filename_pattern: "[A-Za-z0-9_()-]+\\.md"
lint:
  broken_links: warning
  filename_pattern: warning
  headings: off
  link_style: warning
link:
  style: markdown
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

`wiki lint` reports broken links (`lint.broken_links`). `wiki link` enriches prose with new internal links (`--apply`) or fixes typos and renames when the target is unique (`--fix-broken`). `--apply` uses `link.style` in `wiki.yaml` (`markdown` inserts `[text](Page.md)`; `obsidian` inserts `[[Page|text]]`). `lint.link_style` flags Obsidian wikilinks in body prose when `link.style` is `markdown`. Optional `link.renames` maps old slugs to new routes for renames.

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
wiki query "SELECT ?given WHERE { ?s schema:givenName ?given }" --jq 'results.bindings[].given.value'

# Rebuild the in-memory graph before querying (same process only)
wiki query "SELECT ?given ?family WHERE { ?s schema:givenName ?given ; schema:familyName ?family }" --reload

# Persist a warm graph for reuse across new CLI processes
wiki query --cache "SELECT ?given ?family WHERE { ?s schema:givenName ?given ; schema:familyName ?family }"

# Pretty-print SELECT results as a Rich table (terminal only)
wiki query --pretty "SELECT ?given ?family WHERE { ?s schema:givenName ?given ; schema:familyName ?family }"
```

#### Inspect one document in the terminal

Use `--pretty` with a subject-focused SELECT to peek at frontmatter triples. This does not render markdown body or typed infobox layout — use [`serve`](#serve) for full page preview.

```bash
# Pretty-print all triples for a subject
wiki query --pretty "SELECT ?property ?value WHERE {
  wiki:Gregory_Davidson ?property ?value .
}"
```

`--pretty` requires the default `-f table` format, writes to stdout only (no `-o` or `--jq`), and supports SELECT queries only.

### `render`
Identify embedded SPARQL blocks in your markdown files, run their queries against the reasoning-expanded RDF graph, and replace the outputs inline. Under the "silence is golden" Unix philosophy, this command exits silently with code 0 upon success.

Each `wiki render` run builds the RDF graph once, then evaluates every SPARQL block in scope against that same graph (all markdown files with blocks, or only the FILE paths you pass).

```bash
# Render all SPARQL blocks in the wiki
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

# Render specific markdown files (shell glob expands to multiple FILE args)
wiki render wiki/people/*.md

# Skip OWL-RL during editing when queries use asserted triples only
wiki render --no-inference
```

**Graph cache:** By default, the wiki graph (including OWL-RL when inference is on) is built once per process and reused for every SPARQL query and `render` pass in that run, so you do not reload the graph for each block or subcommand. A new shell still starts cold unless you opt into `--cache`, which persists the current graph under `.wiki/cache/` and reuses it across one-shot `query`, `render`, and `build --render` invocations when the wiki fingerprint still matches. Use `wiki serve --watch` for a long-lived process that rebuilds the graph and SPARQL output when files under `wiki.inputs` or `wiki.assets` change (not when CLI source code changes).

Disk-cache tradeoffs: `--cache` speeds up repeated one-shot commands on unchanged wikis, but it adds `.wiki/cache/` artifacts and still invalidates on wiki or config changes. `--reload` rebuilds from source and refreshes the current cache entry.

An embedded SPARQL block is defined in your markdown files like this:
````html
<!-- sparql:start -->
```sparql
SELECT ?given ?family ?email WHERE {
  ?person a schema:Person ;
          schema:givenName ?given ;
          schema:familyName ?family ;
          schema:email ?email .
}
```

| given | family | email |
| --- | --- | --- |
| Gregory | Davidson | gregory@example.com |
<!-- sparql:end -->
````

### `build`
Generate a static HTML site from your wiki markdown files for deployment to GitHub Pages or any static host.

```bash
# Build site (default: clean directory URLs)
wiki build

# Build with explicit .html URLs instead
wiki build --site-url-style file

# Build to a custom directory with verbose output
wiki build --output-dir docs -v

# Build for a project site under /my-wiki/
wiki build --site-base-url /my-wiki --output-dir _site

# Build with pages at root level (no prefix)
wiki build --site-base-url '' --output-dir docs

# Automatically update all dynamic SPARQL blocks in source files before building
wiki build --render

# Rebuild the in-memory graph before rendering SPARQL blocks (same process only)
wiki build --render --reload

# Persist a warm graph for reuse across repeated build --render runs
wiki build --render --cache

# Skip pre-build integrity and lint checks
wiki build --no-check
```

The `--site-url-style` flag controls how pages are written to disk and linked:

- `dir` (default): `_site/wiki/alice/index.html` on disk, clean `/wiki/alice/` in links
- `file`: `_site/wiki/alice.html` on disk, `.html` in generated links

The `--site-base-url` flag controls the URL prefix for wiki pages. Default is `/wiki`, so pages are accessible at `/wiki/{PageStem}/`. Set it to an empty string for root-level URLs. GitHub Pages paths are case-sensitive.

Output structure (default `--site-base-url /wiki` + `--site-url-style dir`):
```
_site/
+-- wiki/
    +-- index.html                  # Wiki index at /wiki/
    +-- Alice/
    ¦   +-- index.html              # Page at /wiki/Alice/
    +-- Pokemon_Diamond_(copy_1)/
        +-- index.html              # Page at /wiki/Pokemon_Diamond_(copy_1)/
```

With `--site-url-style file`:
```
_site/
+-- wiki/
    +-- index.html                  # Wiki index at /wiki/
    +-- Alice.html                  # Page at /wiki/Alice.html
    +-- Pokemon_Diamond_(copy_1).html
```

With `--site-base-url /my-wiki` + `--site-url-style dir`:
```
_site/
+-- my-wiki/
    +-- index.html                  # Wiki index at /my-wiki/
    +-- alice/
    ¦   +-- index.html              # Page at /my-wiki/alice/
    +-- ...
```

Page URLs are derived from the source path under `wiki.inputs`, minus `.md`, with case preserved. Folders are preserved. `index.md` maps to its containing folder route, so `wiki/index.md` owns `/wiki/` and `wiki/games/index.md` owns `/wiki/games/`. For ordinary pages, the default examples use Wikipedia-style filenames such as `Gregory_Davidson.md` and `Pokemon_Diamond.md`. Headings do not create separate pages; they receive GitHub-compatible fragment IDs such as `#release-history`.

`wiki build` runs `wiki check` and `wiki lint` before cleaning output unless `--no-check` is passed. If checks fail, the previous output is left untouched. Once checks pass, the owned output path is treated as disposable build output and rebuilt.

Static assets can be published from configured asset directories:

```yaml
wiki:
  assets:
    - assets
  exclude:
    - assets/private/**
```

Asset directories are relative to the config file and copied under the base URL preserving their configured path, e.g. `assets/items/photo.jpg` becomes `/wiki/assets/items/photo.jpg`.

#### Page layouts and infoboxes

The HTML builder distinguishes three concepts:

- **Site page layout** — `site.layout` in `wiki.yaml` (default layout for all pages, usually `layouts/default.html.j2`)
- **Per-page layout** — optional `wazoo:layout` frontmatter pointing at an HTML file path relative to the config root
- **Wiki article** — any markdown route (for example `wiki/Page_Layouts.md`)

Set `wazoo:layout` to choose a different page layout for one page. Paths resolve like `site.layout` (relative to the directory containing `wiki.yaml`):

```yaml
id: wiki:Gregory_Davidson
type: schema:Person
wazoo:layout: layouts/article.html.j2
knows: wiki:Bella_Davidson
url: https://gregorydavidson.com
```

When `wazoo:layout` is omitted, the page uses `site.layout`. Layout files are Jinja2 templates (`.html.j2`) with the same variable contract (`{{ page.nav.infobox }}`, `{{ page.content }}`, `{{ page.layout.class }}`, and so on).

Any article with displayable frontmatter gets a sidebar infobox. Structural keys such as `@context`, `@id`, `id`, `@type`, and `type` are hidden from the infobox. Infobox values become links automatically when they reference another wiki page or an external URL.

In the built site:

- `wiki:Bella_Davidson` links to the `Bella_Davidson` page when that page exists
- `https://gregorydavidson.com` renders as an external link

`wiki check` errors on missing `wazoo:layout` files.

#### Metadata pane (RDF views)

Built and served HTML pages include a **Metadata** tab with a compact no-JavaScript format picker (CSS radio chips). The pane uses the same serialization path as `wiki export`:

- JSON-LD (compacted, with `@context`)
- Turtle, N3, RDF/XML, N-Triples, TriG, N-Quads

`wiki build` embeds all format views in each page. On `wiki serve`, set the initial chip with `?metadata_format=FORMAT` (for example `turtle` or `json-ld`). Aliases such as `ttl`, `rdf`, and `jsonld` are accepted.

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
        run: uv run wiki -c docs/wiki.yaml build --output-dir _site --site-base-url /wiki

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
Start a local development HTTP server that renders wiki markdown files as HTML (wikilinks, backlinks, ToC, infobox, and metadata pane included). Uses the same rendering engine as `build` but serves pages on-the-fly without writing files to disk.

```bash
# Default: http://127.0.0.1:8080/wiki/ (when site.base_url is /wiki)
wiki serve

# Custom host and port
wiki serve --host 0.0.0.0 --port 3000

# Watch wiki files; rebuild graph, SPARQL blocks, and reload the browser on change
wiki serve --watch

# Editable install: run the in-repo package without reinstalling after pip/uv -e .
python -m wiki serve --watch
```

`--watch` polls `wiki.inputs` and `wiki.assets` only. Restart the server after changing Python code in the installed package. Set the metadata pane with `?metadata_format=FORMAT` (for example `turtle`, `ttl`, or `json-ld`).

When `sparql_service.enabled` is true in `wiki.yaml`, `wiki serve` also exposes a read-only SPARQL endpoint (default path `/api/sparql`).

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
| `--wiki-inputs <path>` | Override `wiki.inputs` for this invocation (can be repeated) |

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

While the Wiki CLI operates as a standalone tool, it pairs naturally with Obsidian. You can seamlessly trigger operations directly from within your wiki using the **Shell Commands** community plugin.

Recommended workflows:
* **Check on save**: Bind `wiki check` to execute whenever a file is modified to receive instant feedback on SHACL, JSON Schema, and layout validation.
* **Trigger re-rendering**: Map a hotkey or command palette item to `wiki render` to automatically update all dynamic SPARQL blocks in the wiki.

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
SELECT ?given ?family WHERE {
  ?entity a schema:Person ;
          schema:givenName ?given ;
          schema:familyName ?family .
}
```

#### Opt-in full-text SPARQL over markdown content
By enabling `graph.content_predicate` in your `wiki.yaml`, the unstructured markdown body (everything after the frontmatter) is automatically loaded as a literal under your configured predicate (for example `schema:articleBody` for article wikis). This allows you to perform hybrid logical and full-text searches inside a single SPARQL query:

```sparql
PREFIX schema: <https://schema.org/>

SELECT ?doc ?content WHERE {
  ?doc a schema:TechArticle ;
       schema:articleBody ?content .
  FILTER(CONTAINS(LCASE(?content), "swimming"))
}
```

## Workspace configuration (`Config`)

The CLI automatically detects and loads configurations from `wiki.yaml`, `wiki.yml`, or `wiki.json` in your current working directory. Settings are grouped under `wiki`, `graph`, `site`, and `link` blocks (see [Wiki Configuration](docs/wiki/Wiki_Configuration.md)).

```yaml
# wiki.yaml
wiki:
  inputs: [wiki]
  assets: [assets]
  filename_pattern: "[A-Za-z0-9_()-]+\\.md"

graph:
  content_predicate: schema:articleBody
  context:
    schema: https://schema.org/
    wiki: https://book.etok.me/wiki/

site:
  base_url: /wiki
  url_style: dir
  layout: layouts/default.html.j2

link:
  style: markdown

lint:
  broken_links: warning
  filename_pattern: warning
  link_style: warning

sparql_service:
  enabled: false
  path: /api/sparql
```

## Glossary and decisions
To understand the domain terminology (such as **Wiki**, **Document**, **Context**, **Validation**, and **Shape**), please refer to:
*   [CONTEXT.md](https://github.com/wazootech/wiki/blob/main/CONTEXT.md) — Glossary and Domain Model mapping.


