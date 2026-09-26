# Wiki CLI (`wazootech-wiki`)

Semantic knowledge **toolchain** for Markdown wikis: compile frontmatter and body into RDF, validate with SHACL and JSON Schema, infer with OWL-RL, query with SPARQL, and publish static HTML or serializations. Wiki CLI is the compiler and query engine — not the primary editor or note app. See [docs/wiki/wiki.md](docs/wiki/wiki.md) for scope, boundaries, and command reference.

## Architecture decision: Deno/TypeScript engine

Issue [#273](https://github.com/wazootech/wiki/issues/273) supersedes [#44](https://github.com/wazootech/wiki/issues/44): Wiki is being cut over to a Deno/TypeScript engine over RDF/JS in PR [#317](https://github.com/wazootech/wiki/pull/317). [ADR 0001](docs/adr/0001-deno-rewrite.md) records the architecture, dependency choices, deferred RDF/XML output, and transition gates.

- **Deno/TypeScript is the sole runtime after cutover.** The Python engine, packaging, tests, CI/release steps, and Python docs builder are removed or replaced; the pinned Python checkout is only a local differential oracle during the cutover.
- **Keep the npm contract.** `wazootech-wiki` retains its `wiki` executable, CommonJS/ESM/type exports, and TypeScript SDK. Its runtime is Deno-backed and must not require system Python or a separately installed Deno. `@wazoo/wiki` remains the native JSR package; per-platform `deno compile` binaries remain available for direct downloads.
- **Cutover gate status:** 21 pinned differential cases; 15 pass, 6 documented known differences, 0 pending, 0 failures. The suite compares normalized filesystem trees for mutating commands and includes an end-to-end RDF/XML ingestion fixture.
- **Data and CLI contracts remain stable** — `wiki.yml`, `wiki.lock`, `.wiki/cache/*.nt|.nq`, `%wiki.*%` tokens, `<!-- sparql:start/end -->`, the SPARQL endpoint, supported subcommands, and exit codes are preserved. RDF/XML input remains supported; RDF/XML output is explicitly deferred and returns a clear unsupported-format error.

### Superseded: [#44](https://github.com/wazootech/wiki/issues/44) (Python core)

Kept for the reasoning trail. #44 decided to keep the **Python CLI as the source of truth** for parsing, validation, inference, querying, and export, and to plan no full TypeScript rewrite of the engine.

- **Why Python then** — `rdflib`, `pyshacl`, and `owlrl` composed a single coherent RDF/SHACL/OWL pipeline aligned with this repo’s core job.
- **TypeScript at the edges only** — the npm package was a thin delivery wrapper (private venv + matching PyPI engine), not a second implementation.
- **What changed** — the two hardest subsystems now ship as Deno packages in this org (`@wazoo/sparql-engine`, `@wazoo/linked-markdown`), the npm-only distribution requirement became concrete, and an engine spike settled the OWL-RL replacement empirically.

## Architecture decision: Library-first API

Superseded by the Deno/TypeScript cutover. The former Python library-first API (`Wiki`, Pydantic `AuditReport`, and symbols in `wiki.__all__`) no longer defines the public runtime contract. The current Deno API is exported from `src/wiki/mod.ts` as `@wazoo/wiki`; the npm package keeps its existing TypeScript SDK surface. See [Wiki Programmatic API](docs/wiki/Wiki_Programmatic_API.md).

## Language

**Wiki**: An LLM-managed knowledge base of markdown files containing structured frontmatter. _Avoid_: Book, repository, database.

**Wiki** (or **Wiki corpus**): The semantic corpus the CLI loads from `wiki.input` plus installed read-only `sources:` when present. It is the on-disk home of **Documents**, shapes, raw RDF, and embedded SPARQL; the CLI compiles it into the RDF graph. A composed Wiki can feel like one corpus while preserving source boundaries as RDF named graphs. In this repository, `docs/wiki/`. _Avoid_: Book, generic database.

**Document**: An individual Markdown page in the wiki containing a metadata block. _Avoid_: Page, post, wiki page.

**Frontmatter**: A YAML or JSON metadata block at the top of a Document, mapping to a JSON-LD compliant representation. _Avoid_: Metadata, header.

**Context**: The namespace mapping and prefix bindings (similar to JSON-LD `@context`) embedded inside a Config. _Avoid_: Namespace list.

**Config**: The root configuration object loaded from `wiki.yml` (or legacy `wiki.yaml`) — same nested blocks as the file (`wiki`, `graph`, `site`, …) plus loader-injected `config_root`. Access paths via `config.wiki.input`, routing and layout path via `config.site.*` (`layout`, `base_url`, `url_style`); presentation and branding live in the page layout and `wiki.assets`, RDF via `config.graph.*` and the `config.context` property. Use the `Wiki.load({ config })` API or CLI `-c` option; `Config` is an internal module type, not a top-level public export. _Avoid_: parameters, settings, flat `input_dirs` fields.

**WikiConfig**: Reserved name for a future top-level `wiki:` yaml section (`{section}Config` pattern). Not loaded today. _Avoid_: Using this name for the root loader (use **Config**).

**Namespaces**: The mapping of prefix keys to URI values used for RDF conversion and SPARQL queries. _Avoid_: Prefixes, prefixes list.

**Inference**: The process of applying OWL-RL deductive reasoning to expand the RDF graph. _Avoid_: Reasoning, calculation.

**Axiom**: Ontological rules and schema definitions loaded from Turtle files to guide the inference process. _Avoid_: Rule, schema rule.

**Validation**: The process of checking Document frontmatter against SHACL shapes and optional JSON Schema bindings (`wazoo:jsonSchema`) to ensure structure and value compliance. _Avoid_: Formatting check, manual review.

**Shape**: A SHACL constraint definition loaded from Turtle files to validate the structure of Documents. _Avoid_: Rule, template.

**Query**: A SPARQL query executed against the semantic RDF graph of the Wiki. _Avoid_: Search, database lookup.

**Rendering**: The process of executing embedded SPARQL Queries within Documents and injecting the formatted results back into the files. _Avoid_: Exporting, updating.

**Graph cache**: The in-process RDF graph held for the lifetime of a CLI run so multiple SPARQL queries and renders share one **Wiki** build. _Avoid_: Disk cache, pickle store.

**Source graph**: A read-only RDF named graph for an installed source. Source graph URIs are stable handles for SPARQL `GRAPH` clauses and provenance inspection; they do not imply writable source mutation.

**Checking**: Integrity validation on the **Wiki** via `wiki check` — SHACL, JSON Schema frontmatter, route safety, collisions, and layout frontmatter.

**Linting**: Conventions and broken links via `wiki lint` (`lint.broken_links`, filename pattern, headings, link style).

**Linting**: Convention audits on the **Wiki** via `wiki lint` — configurable `filename_pattern`, `headings` (sentence-case H2+, numbering), `thematic_breaks`, and `link_style`. ATX heading syntax is enforced by **`wiki fmt`** (the Deno in-process Markdown formatter). _Avoid_: Checking (use `wiki check` for integrity).

**Formatting**: Markdown formatting via `wiki fmt`, implemented by the Deno/TypeScript engine's in-process dprint Markdown plugin. Separate from check and lint.

**Link hygiene**: Suggest missing wikilinks or repair unambiguous broken internal links via `wiki link` (`--apply`, `--fix-broken`). Broken-link detection lives in **Linting** (`lint.broken_links`); mutation is explicit and never part of `wiki build` preflight. _Avoid_: Treating enrichment as lint or folding repair into `wiki check`.

**Exporting**: The process of compiling and exporting the Frontmatter of all Documents into a single canonical JSON-LD representation. _Avoid_: Saving, dumping.

**CLI**: The Deno/TypeScript command-line interface for managing the wiki.

## Relationships

- A **Wiki** (the wiki corpus) is the filesystem corpus of **Documents** and raw RDF listed by `wiki.input`, plus installed read-only source inputs resolved from `wiki.lock`
- A **Wiki** is composed of root corpus content and optional source graphs, compiled semantically at runtime
- A **Document** contains exactly one **Frontmatter** block
- The **CLI** manages, validates, and queries the **Wiki** using **Config**, which contains the **Context** and **Namespaces**
- **Inference** uses custom **Axioms** to expand the semantic RDF graph of the **Wiki**
- **Validation** checks **Documents** against custom **Shapes** to ensure data integrity
- **Checking** runs integrity checks on the **Wiki** via `wiki check`; **Linting** runs convention audits via `wiki lint`; **Link hygiene** is optional via `wiki link`; stale SPARQL blocks use `wiki render --check`
- **Query** executes custom SPARQL queries against the expanded RDF graph of the **Wiki**
- **Rendering** runs embedded **Queries** inside **Documents** and updates their dynamic sections inline
- **Graph cache** lets multiple **Queries** and **Rendering** steps in one CLI run reuse a single loaded RDF graph
- **Exporting** packages the **Frontmatter** of the **Wiki** into a unified JSON-LD graph

## Example dialogue

> **Dev:** "Does a **Document** always need `type` in **Frontmatter**?"
> **Domain expert:** "Without `graph.implicit_types`, a document with no `type` / `@type` produces no RDF triples and is invisible to SPARQL and SHACL. With `graph.implicit_types` configured, untyped documents inherit those CURIEs at graph build time; explicit types still win when `implicit_types_policy` is `fallback`."
