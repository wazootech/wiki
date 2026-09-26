# Wiki CLI

[![npm version](https://img.shields.io/npm/v/wazootech-wiki)](https://www.npmjs.com/package/wazootech-wiki)
[![CI Status](https://github.com/wazootech/wiki/actions/workflows/ci.yml/badge.svg)](https://github.com/wazootech/wiki/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![skills.sh](https://skills.sh/b/wazootech/wiki)](https://skills.sh/wazootech/wiki)

**Wiki CLI** is a command-line tool for Markdown wikis. You keep writing in Obsidian, VS Code, or any editor — the CLI validates your documents, runs queries against them, and builds static sites. Drop a `wiki.yaml` in your folder and you're set.

Repository: [github.com/wazootech/wiki](https://github.com/wazootech/wiki). CLI command: `wiki`. Install via [npm](https://www.npmjs.com/package/wazootech-wiki) or download a standalone executable from [GitHub Releases](https://github.com/wazootech/wiki/releases).

Starter templates: [wiki-templates](https://github.com/wazootech/wiki-templates) (monorepo with all starter templates). See [Wiki CLI templates](docs/wiki/wiki.md#ecosystem-templates).

## Use cases and integrations

Wiki CLI is **interop-first**: it runs beside your existing wiki without owning the editor.

- **Obsidian & PKM** — Validate links and run queries inside your personal wiki. See [Obsidian integration](docs/wiki/Obsidian_Integration.md).
- **Static Documentation & Wikis** — Auto-generate styled HTML documentation pages, tables of contents, and sidebar infoboxes for publishing to GitHub Pages or static hosts.
- **LLM Wikis & Agent Memory** — Validate and query machine-generated Markdown databases. See [LLM Wiki](docs/wiki/LLM_Wiki.md).
- **Adoption path** — `wiki init` → `wiki check` → `wiki serve` (add `lint`, `query`, and `build` as you need them).

### Distinguishing Wiki CLI from Farzapedia

While inspired by personal digital gardens like **Farzapedia** (a subjective, first-person memory wiki optimized for a single agent), **Wiki CLI** is a general-purpose, multi-player toolchain:

- **Farzapedia** is a specific *content wiki* containing diary entries, notes, and messages.
- **Wiki CLI** is a *utility* for *any* wiki. It validates structure, runs queries, and builds static websites from a folder of Markdown files.

Adoption path: [Wiki CLI](docs/wiki/wiki.md) in the docs wiki.

## Key features

Three capabilities, one toolchain:

| Capability       | Commands                                                    | What you get                                                                    |
| ---------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **Trust**        | [`check`](#check), [`lint`](#lint), [`fmt`](#fmt)           | Integrity checks (SHACL, JSON Schema), wiki conventions, automated formatting   |
| **Intelligence** | [`query`](#query), [`render`](#render), [`export`](#export) | Semantic queries (SPARQL), live inline tables, data exports (JSON-LD, Turtle)   |
| **Publish**      | [`build`](#build), [`serve`](#serve), [`link`](#link)       | Static HTML with infoboxes and metadata viewer, local preview, wikilink hygiene |

Also: [`init`](#init) scaffolds `wiki.yaml`; `wiki query --pretty` renders Rich tables in the terminal; YAML and JSON frontmatter feed into the same queryable model; per-page layouts via `wazoo:layout`.

## Agent skills

Wiki CLI ships one consolidated agent skill for coding assistants (Claude Code,
Cursor, OpenCode, Gemini). It is not a thin wrapper — it encodes opinionated
best practices that apply to any wiki or docs repo:

- **[wiki](skills/wiki/SKILL.md)** — the consolidated operational skill.
  Routes to install, scaffold, audit, deploy, or code-wiki sync workflows.
  Encodes the "silence is golden" philosophy (exit 0 on success) and
  deterministic verification scripts instead of agent reasoning about whether
  things look right. Code-wiki maintenance (`references/sync.md`) treats the
  last-synced commit as an anchor and diffs forward, editing only the pages
  the diff demands; defaults to drift-free docs with an opt-in `detail_level`
  directive.

Integration and template proposals are not handled by a skill: they follow the
contributing guide in the [wiki-templates](https://github.com/wazootech/wiki-templates)
repository, where proposals are filed.

```bash
npx skills add wazootech/wiki@wiki -g -y
```

The skills follow the same convention as the CLI: deterministic scripts
(`verify.sh`, `audit.sh`) for anything that can be checked, agent reasoning
only for decisions that require judgment.

## Templates

All templates live in the [wiki-templates](https://github.com/wazootech/wiki-templates) monorepo. Template specs, epics, and roadmap are tracked in the [wiki-templates issue tracker](https://github.com/wazootech/wiki-templates/issues) (see the [template program umbrella](https://github.com/wazootech/wiki-templates/issues/4)). Clone the one that matches your stack:

| Template                                                              | Description                                                                                                                                                       |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [generic](https://github.com/wazootech/wiki-templates/tree/main/generic)               | **Generic starter** — `wiki init` parity, deploy config, CI checks, best practices                                                                                |
| [llm-wiki](https://github.com/wazootech/wiki-templates/tree/main/llm-wiki)             | **LLM Wiki** — agent gardening vault with SHACL shapes and SPARQL indexes                                                                                         |
| [mintlify](https://github.com/wazootech/wiki-templates/tree/main/mintlify)              | **Mintlify/Holocron** — MDX docs site powered by Wiki CLI vault                                                                                                   |
| [holocron](https://github.com/wazootech/wiki-templates/tree/main/holocron)              | **Holocron** — Holocron docs site from a Wiki CLI-compatible vault                                                                                                |
| [astro](https://github.com/wazootech/wiki-templates/tree/main/astro)                   | **Astro SSG** — consuming wiki export JSON-LD                                                                                                                     |
| [nextjs](https://github.com/wazootech/wiki-templates/tree/main/nextjs)                 | **Next.js SSG** — consuming wiki export JSON-LD                                                                                                                   |
| [quartz](https://github.com/wazootech/wiki-templates/tree/main/quartz)                 | **Quartz publish** — digital garden with Wiki CLI CI checks                                                                                                       |
| [cocoindex](https://github.com/wazootech/wiki-templates/tree/main/cocoindex)           | **CocoIndex sidecar** — incremental sidecar for Wiki-derived memory, RAG, and provenance-preserving indexes ([#201](https://github.com/wazootech/wiki/issues/201)) |
| [yasgui](https://github.com/wazootech/wiki-templates/tree/main/yasgui)                 | **YASGUI SPARQL** — query UI explorer                                                                                                                             |
| [wikipedia](https://github.com/wazootech/wiki-templates/tree/main/wikipedia)           | **Wikipedia theme** — Wikipedia-inspired static layout using the Wiki Deno/TypeScript engine                                                                 |
| [camunda](https://github.com/wazootech/wiki-templates/tree/main/camunda)               | **Camunda governance** — BPMN/DMN knowledge base starter with SHACL shapes and JSON Schemas                                                                      |

Full details: [Wiki CLI templates](docs/wiki/wiki.md#ecosystem-templates).

## Installation

### From npm

```bash
npm install -g wazootech-wiki
```

This installs the `wiki` command. The npm package includes the platform-matched Deno runtime and packaged engine source; system Python and a separate Deno installation are not required. Node.js 18 or newer is required.

`npx wazootech-wiki` accepts the same commands and flags as the global `wiki` command.

```bash
npx wazootech-wiki --help
npx wazootech-wiki init
npx wazootech-wiki -c docs/wiki.yml check
```

### Standalone executable

Self-contained Deno-compiled executables for Linux x64/arm64, Windows x64/arm64, and macOS x64/arm64 are published on [GitHub Releases](https://github.com/wazootech/wiki/releases) with `SHA256SUMS`. They do not require Node.js, Python, or Deno.

### From source

Install Deno, then run `deno task check`, `deno task lint`, `deno task fmt:check`, and `deno task test`.

## Programmatic APIs

### TypeScript SDK

The npm package preserves its TypeScript SDK. It invokes the same Deno-backed engine as the `wiki` command.

```bash
npm install wazootech-wiki
```

```ts
import { Wiki } from "wazootech-wiki";

const wiki = Wiki.load({ config: "docs/wiki.yml" });

await wiki.check({ strict: true });

const results = await wiki.query({
  query: "SELECT ?s WHERE { ?s ?p ?o }",
  format: "json",
});
```

CommonJS is supported too:

```js
const { Wiki } = require("wazootech-wiki");
```

Methods mirror the CLI surface (`check`, `lint`, `fmt`, `render`, `build`, `export`, `link`, `query`, `serve`, `init`, and `upgrade`) with camelCase TypeScript options. Report-producing commands return command results today; JSON-capable commands such as `query --format json` and JSON exports can return parsed data.

## Local development

Use Deno tasks for type checking, linting, formatting, and tests. Run the docs CLI from source with `deno run -A src/wiki/cli.ts -c docs/wiki.yml <command>`; the repository-specific Wikipedia-themed Pages site is built with `deno run -A docs/build.ts --output-dir _site`.

`serve --watch` rebuilds when files under `wiki.input` and `wiki.assets` change. Restart the server after editing CLI code.

Suggested contributor loop:

- Edit files under `docs/wiki/`.
- Use `deno run -A src/wiki/cli.ts -c docs/wiki.yml serve --watch` for the main live-preview workflow (restart after CLI changes).
- Run `wiki -c docs/wiki.yml check --strict -v` and `wiki -c docs/wiki.yml lint --strict -v` before landing documentation changes.
- Use `wiki render --cache` or `wiki build --render --cache` when you want faster repeated one-shot SPARQL runs across fresh shells.

## Quickstart

```bash
mkdir my-wiki
cd my-wiki

# Interactive scaffold: creates wiki.yaml and wiki/ starter files
wiki init

# Also initialize a Git repository explicitly
wiki init --git

# Validate document structure (silent on success)
wiki check

# Check conventions (links, filenames, headings)
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
  style: standard
```

**Wikipedia-style** names (for example `Gregory_Davidson.md`, `LLM_Wiki.md`) are the recommended default. Lowercase kebab-case is optional — only use it if you configure a matching pattern (for example `[a-z0-9-]+\\.md`). Build-safety rules, such as rejecting spaces and unsafe URL characters in page paths, are always enforced separately in `wiki check`.

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

`wiki lint` reports broken links (`lint.broken_links`). `wiki link` enriches prose with new internal links (`--apply`) or fixes typos and renames when the target is unique (`--fix-broken`). `--apply` uses `link.style` in `wiki.yaml` (`standard` inserts `[text](Page.md)`; `wikilink` inserts `[[Page|text]]`). `lint.link_style` flags Obsidian wikilinks in body prose when `link.style` is `standard`. Optional `link.renames` maps old slugs to new routes for renames.

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

**Graph cache:** By default, the wiki graph (including OWL-RL when inference is on) is built once per process and reused for every SPARQL query and `render` pass in that run, so you do not reload the graph for each block or subcommand. A new shell still starts cold unless you opt into `--cache`, which persists the current graph under `.wiki/cache/` and reuses it across one-shot `query`, `render`, and `build --render` invocations when the wiki fingerprint still matches. Use `wiki serve --watch` for a long-lived process that rebuilds the graph and SPARQL output when files under `wiki.input` or `wiki.assets` change (not when CLI source code changes).

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

# Build to a disposable directory with verbose output (must not overlap wiki inputs)
wiki build --output-dir _site -v

# Build for a project site under /my-wiki/
wiki build --site-base-url /my-wiki --output-dir _site

# Build with pages at root level (no prefix); output must be separate from source
wiki build --site-base-url '' --output-dir _site

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

Page URLs are derived from the source path under `wiki.input`, minus `.md`, with case preserved. Folders are preserved. `index.md` maps to its containing folder route, so `wiki/index.md` owns `/wiki/` and `wiki/games/index.md` owns `/wiki/games/`. For ordinary pages, the default examples use Wikipedia-style filenames such as `Gregory_Davidson.md` and `Pokemon_Diamond.md`. Headings do not create separate pages; they receive GitHub-compatible fragment IDs such as `#release-history`.

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

- **Site page layout** — `site.layout` in `wiki.yaml` (default layout for all pages, usually `layouts/wikipedia.html`)
- **Per-page layout** — optional `wazoo:layout` frontmatter pointing at an HTML file path relative to the config root
- **Wiki article** — any markdown route (for example `wiki/Page_Layouts.md`)

Set `wazoo:layout` to choose a different page layout for one page. Paths resolve like `site.layout` (relative to the directory containing `wiki.yaml`):

```yaml
id: wiki:Gregory_Davidson
type: schema:Person
wazoo:layout: layouts/article.html
knows: wiki:Bella_Davidson
url: https://gregorydavidson.com
```

When `wazoo:layout` is omitted, the page uses `site.layout`. Layout files are `.html` page layouts: use `%wiki.head%`, `%wiki.base_url%`, and `%wiki.body%` as listed in [Layout slots](docs/wiki/Wiki_Configuration.md#layout-slots).

In the built site:

- `wiki:Bella_Davidson` links to the `Bella_Davidson` page when that page exists
- `https://gregorydavidson.com` renders as an external link

`wiki check` errors on missing `wazoo:layout` files.

#### Metadata pane (RDF views)

The repository's themed static docs build provides a **Metadata** tab with compacted JSON-LD, Turtle, N3, N-Triples, TriG, and N-Quads. RDF/XML input is supported, but RDF/XML output is deferred and is not included in the pane. The generic `wiki serve` renderer does not currently provide this repository-specific metadata panel.

#### GitHub Pages deployment

After the first tagged release publishes `@wazoo/wiki`, create `.github/workflows/deploy.yml` in your wiki repository. For the native Deno CLI, install Deno and run the JSR module. Until then, use `deno run -A src/wiki/cli.ts` from a Wiki repository checkout.

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
      - uses: actions/checkout@v4
      - uses: denoland/setup-deno@v2
        with:
          deno-version: v2.x
      - name: Check the wiki
        run: deno run -A jsr:@wazoo/wiki/cli -c docs/wiki.yml check --strict -v
      - name: Lint the wiki
        run: deno run -A jsr:@wazoo/wiki/cli -c docs/wiki.yml lint --strict -v
      - name: Build the site
        run: deno run -A jsr:@wazoo/wiki/cli -c docs/wiki.yml build --output-dir _site --site-base-url /wiki
      - uses: actions/upload-pages-artifact@v3
        with:
          path: "_site/wiki"
      - uses: actions/deploy-pages@v4
```

Then enable **GitHub Pages > Source: GitHub Actions** in your repo settings.

### `serve`

Start a local development HTTP server that renders wiki Markdown as HTML. Use `wiki serve` from an installed package or `deno run -A src/wiki/cli.ts serve --watch` from a source checkout. The repository-specific metadata panel is part of its static Wikipedia-themed docs build, not the generic serve renderer.

```bash
# Default: http://127.0.0.1:8080/wiki/ (when site.base_url is /wiki)
wiki serve

# Custom host and port
wiki serve --host 0.0.0.0 --port 3000

# Watch wiki files; rebuild graph, SPARQL blocks, and reload the browser on change
wiki serve --watch
```

`--watch` polls `wiki.input` and `wiki.assets` only. Restart the server after changing CLI code.

When `sparql_service.enabled` is true in `wiki.yaml`, `wiki serve` also exposes a read-only SPARQL endpoint (default path `/api/sparql`).

### `init`

Interactively scaffold a new wiki project (`wiki.yaml` + starter `wiki/` content) in the current directory.

```bash
wiki init

# Also initialize a Git repository explicitly
wiki init --git
```

### `export`

Compile and export parsed **Frontmatter** blocks of documents in a supported RDF format.

When run without a file argument, exports all documents in the wiki directory.

**Note:** `dict` and `json-ld` outputs are wrapped with `name` and `rdf`. Supported serialized output formats are `turtle`, `n3`, `nt`, `trig`, and `nquads`. RDF/XML input remains supported for `.rdf` and `.xml` files; RDF/XML output is deferred, and `-f xml` fails clearly rather than substituting another format.

```bash
# Export parsed frontmatter of the entire wiki as dict (default)
wiki export

# Export a single file
wiki export wiki/Gregory_Davidson.md

# Export as JSON-LD
wiki export wiki/rdf.md -f json-ld

# Export as compacted JSON-LD
wiki export wiki/rdf.md -f json-ld --mode compacted

# Export in another supported RDF format (turtle, n3, nt, trig, nquads)
wiki export wiki/rdf.md -f turtle

# Write to a file
wiki export -f json-ld -o wiki-export.json
```

The `--format` choices are `dict`, `json-ld`, `turtle`, `n3`, `nt`, `trig`, and `nquads`. RDF/XML parsing remains supported for input `.rdf` and `.xml` files. RDF/XML output is deferred from the Deno cutover; `-f xml` returns a clear unsupported-format error.

### Global options

These flags can be used on any subcommand:

| Option                 | Description                                                                |
| ---------------------- | -------------------------------------------------------------------------- |
| `-c, --config <path>`  | Path to `wiki.yaml` config file or directory containing one (default: `.`) |
| `--input <path>` | Override `wiki.input` for this invocation (can be repeated)               |

### Printing and piping

Following the Unix philosophy of pipes and filters, `wiki` works seamlessly with native system utilities. Outputs from query execution or document inspection can be easily formatted and spooled directly to your printer.

#### Unix/macOS

- **Format and Print a Document:**
  Use `pr` to add headers, margins, and page numbers before sending to `lp`:
  ```bash
  cat wiki/Gregory_Davidson.md | pr -h "Gregory Document" | lp
  ```
- **Format and Print Query Results:**
  Run a query and print its tabular results:
  ```bash
  wiki query "SELECT ?s ?p WHERE { ?s ?p ?o }" | pr -h "SPARQL Graph Query" | lp
  ```

#### Windows

- **Print a Document:**
  ```powershell
  Get-Content wiki/Gregory_Davidson.md | Out-Printer
  ```
- **Print Query Results:**
  ```powershell
  wiki query "SELECT ?s ?p WHERE { ?s ?p ?o }" | Out-Printer
  ```

### Obsidian integration

While the Wiki CLI operates as a standalone tool, it pairs naturally with Obsidian. You can seamlessly trigger operations directly from within your wiki using the **Shell Commands** community plugin.

Recommended workflows:

- **Check on save**: Bind `wiki check` to run whenever a file is modified — catch validation errors immediately.
- **Trigger re-rendering**: Map a hotkey to `wiki render` to refresh live query tables in your documents.

### Validation rules and queries

The Wiki CLI turns your folder of Markdown files into a structured, queryable knowledge base.

#### Define validation rules in frontmatter

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

#### Class hierarchies and automatic inference

Define class relationships in one document and declare instances in another — the CLI automatically connects them when you run queries.

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

#### Full-text search with SPARQL

By enabling `graph.content_predicate` in your `wiki.yaml`, the unstructured markdown body (everything after the frontmatter) is automatically loaded as a literal under your configured predicate (for example `schema:articleBody` for article wikis). This allows you to perform hybrid logical and full-text searches inside a single SPARQL query:

```sparql
PREFIX schema: <https://schema.org/>

SELECT ?doc ?content WHERE {
  ?doc a schema:TechArticle ;
       schema:articleBody ?content .
  FILTER(CONTAINS(LCASE(?content), "swimming"))
}
```

## Wiki configuration (`Config`)

The CLI automatically detects and loads configurations from `wiki.yaml`, `wiki.yml`, or `wiki.json` in your current working directory. Settings are grouped under `wiki`, `graph`, `site`, and `link` blocks (see [Wiki Configuration](docs/wiki/Wiki_Configuration.md)).

```yaml
# wiki.yaml
wiki:
  input: [wiki]
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
  layout: layouts/wikipedia.html

link:
  style: standard

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

- [CONTEXT.md](https://github.com/wazootech/wiki/blob/main/CONTEXT.md) — Glossary and Domain Model mapping.
