---
type: TechArticle
headline: wiki check
description: Integrity checks — SHACL validation, JSON Schema frontmatter, route safety, and layout frontmatter.
---

# `wiki check`

Run **integrity** checks on the wiki: strict **SHACL** validation, **JSON Schema** frontmatter validation, route safety, output collisions, and layout frontmatter contracts.

Exits **0 silently** on success unless `-v` is set. See [Design Philosophies](Design_Philosophies.md).

## Usage

```bash
wiki check
wiki check wiki/Some_Page.md
wiki check wiki/A.md wiki/B.md
wiki check -v
wiki check --strict
wiki check -f json wiki/Some_Page.md
```

## Options

| Flag              | Description                                                                           |
| ----------------- | ------------------------------------------------------------------------------------- |
| `FILE...`         | Optional documents; otherwise entire wiki (scoped mode: SHACL + JSON Schema per file) |
| `-v`, `--verbose` | Print warnings                                                                        |
| `--strict`        | Treat warnings as errors (exit 1)                                                     |
| `-f`, `--format`  | `text` (default) or `json`; see [JSON output](#json-output)                           |
| `--json`          | Shorthand for `--format json`                                                         |

## What is checked

### Full wiki (default)

`wiki check` with no `FILE` argument runs every check below.

### Always errors (not configurable)

- **SHACL** — shapes from wiki frontmatter (`sh:NodeShape`, etc.) on the full RDF graph
- **Route safety** — unsafe path segments (spaces, reserved characters, and similar)
- **Output collisions** — two wiki sources mapping to the same built URL (against default `_site` layout)

### Configurable (`check.*` in `wiki.yaml`)

| Rule key              | What it audits                                                      |
| --------------------- | ------------------------------------------------------------------- |
| `missing_layout_file` | `wazoo:layout` paths that do not resolve to a readable `.html` file |
| `frontmatter_schema`  | Frontmatter that fails JSON Schema validation                       |
| `missing_schema_ref`  | `wazoo:jsonSchema` paths or URLs that cannot be loaded              |
| `shape_definition`    | Ill-formed SHACL shape pages (see [below](#shape-definitions))      |
| `shape_unused`        | Node shape pages that validate nothing                              |
| `remote_schema_refs`  | Policy for remote schema URLs: `allow`, `deny`, or `allowlist`      |
| `remote_schema_hosts` | Hostnames allowed when `remote_schema_refs` is `allowlist`          |

Default: `missing_layout_file`, `frontmatter_schema`, `missing_schema_ref`, and `shape_definition` are `error`. `shape_unused` is `warning`. `remote_schema_refs` defaults to `allow`.

### Shape definitions

A shape page is ordinary frontmatter, so a misspelled `sh:` key compiles to an inert triple and the constraint it meant to declare never fires. `shape_definition` runs before SHACL and fails the check when a page, or a shape nested in it, breaks a SHACL Core rule: an unknown `sh:` term, a property shape without `sh:path`, a malformed path, or a non-IRI value for an IRI-valued parameter. While any remain as errors, SHACL validation is skipped and a `shacl_skipped` warning says so, because a broken shape makes the SHACL verdict meaningless. A node shape that applies to nothing is reported separately, under `shape_unused`, as a warning by default. Each finding names the route and the key path, for example `In Purchase_Shape: sh:property[0].sh:minCont: …`. Shapes written in RDF (fenced `turtle` blocks and `.ttl` and other RDF files) get the same checks, and their findings name the source and the shape. Findings appear in `wiki check -f json` under the code `shape_definition`. See [SHACL](SHACL.md#shape-page-checks) for the rules.

### JSON Schema frontmatter

Bind schemas on `sh:NodeShape` documents with `wazoo:jsonSchema` and `sh:targetClass`. Type-level schemas apply to every matching page; pages may append extra schemas with their own `wazoo:jsonSchema` (string or list). Local refs resolve under the wiki config root; remote `http(s)` URLs are fetched at check time unless `check.remote_schema_refs` is `deny` or the host is outside `check.remote_schema_hosts` when using `allowlist`. Shape binding documents are excluded from instance validation. See [SHACL](SHACL.md) and [Style Guide](Style_Guide.md#shacl-shapes).

Broken links, filename pattern, and heading style are **not** part of `wiki check` — use [wiki lint](wiki_lint.md).

### Scoped mode (one or more FILE args)

`wiki check path/to/Page.md` (or multiple paths) runs **SHACL and JSON Schema** per file. Route safety, output collisions, and layout frontmatter rules are **full-wiki only**. Cross-document SHACL interactions may only appear in a full-wiki check. Broken links on those pages require `wiki lint` with the same paths.

`--strict` applies only when warnings exist; scoped mode does not emit warnings today.

## JSON output

`wiki check -f json` writes a structured report to **stdout** so editors and CI can tell which document, which frontmatter field, which shape, and which constraint failed without parsing the text report. The text report still goes to stderr, and the exit code is unchanged (1 when the check fails, 0 otherwise).

```json
{
  "version": 1,
  "ok": false,
  "documents": [
    {
      "path": "wiki/CSS.md",
      "route": "CSS",
      "focusNode": "https://wiki.example.org/CSS",
      "conforms": false,
      "results": [
        {
          "code": "shacl_violation",
          "severity": "error",
          "check": "shacl",
          "message": "Article must have a description.",
          "resultPath": "https://schema.org/description",
          "frontmatterKeys": ["description", "schema:description"],
          "shaclSeverity": "http://www.w3.org/ns/shacl#Violation",
          "sourceConstraintComponent": "http://www.w3.org/ns/shacl#MinCountConstraintComponent",
          "sourceShapes": [
            {
              "iri": "https://wiki.example.org/Article_Shape",
              "route": "Article_Shape",
              "path": "wiki/Article_Shape.md",
              "targetClass": ["https://schema.org/Article"],
              "label": "Article Shape"
            }
          ],
          "value": null,
          "schema": null,
          "instancePath": null,
          "keyword": null
        }
      ]
    }
  ],
  "issues": [
    {
      "code": "shacl_violation",
      "severity": "error",
      "message": "SHACL Validation Violation in CSS.md: ...",
      "path": "wiki/CSS.md",
      "route": "CSS"
    }
  ]
}
```

- **`version`** is the envelope's format version, currently `1`. New fields can appear without a bump; renaming, removing, or changing the meaning of a field bumps it.
- **`issues`** lists every issue the text report shows, with the same `code`, `severity`, and `message`. Warnings are always included, with or without `-v`.
- **`documents`** groups the document-level issues by page. Each SHACL result and JSON Schema failure gets its own entry in `results`. In scoped mode every `FILE` gets an entry, even when it conforms. In full-wiki mode, only documents with findings are listed.
- **`frontmatterKeys`** are the frontmatter spellings of `resultPath`, resolved through the wiki context. A key the page already uses is listed alone. For a missing field, the list holds the spellings that would satisfy it.
- **`sourceShapes`** names the shape page that declared the failing constraint (SHACL's `sh:sourceShape`), with its `sh:targetClass` and `rdfs:label`. A named `sh:PropertyShape` page is named itself, even when a node shape lists it under `sh:property`. An inline property shape is named by the node shape page that holds it. Blank nodes are never serialized because their labels change between runs. A constraint that has no named shape gives an empty list.
- JSON Schema results (`check: "jsonSchema"`) carry `schema`, `instancePath`, and `keyword`. SHACL results (`check: "shacl"`) carry `resultPath`, `sourceConstraintComponent`, and `value`. A result whose focus node matches no document is listed under a document with `path: null`. It is never dropped.

### Related CI commands

| Command               | Purpose                                              |
| --------------------- | ---------------------------------------------------- |
| `wiki lint --strict`  | Broken links, filename pattern, headings, link style |
| `wiki fmt --check`    | Deno Markdown formatter consistency                  |
| `wiki render --check` | Stale inline SPARQL result blocks                    |
| `wiki link --check`   | Remaining missing-wikilink opportunities             |

`wiki build` runs `wiki lint` then `wiki check` before writing output unless `--no-check`.

## Related

- [Wiki Configuration](Wiki_Configuration.md) — `check.*` severities
- [SHACL](SHACL.md) — shape and JSON Schema binding
- [wiki lint](wiki_lint.md) — convention lane
- [Style Guide](Style_Guide.md)
