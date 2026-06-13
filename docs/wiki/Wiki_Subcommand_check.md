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
```

## Options

| Flag              | Description                                                                           |
| ----------------- | ------------------------------------------------------------------------------------- |
| `FILE...`         | Optional documents; otherwise entire wiki (scoped mode: SHACL + JSON Schema per file) |
| `-v`, `--verbose` | Print warnings                                                                        |
| `--strict`        | Treat warnings as errors (exit 1)                                                     |

## What is checked

### Full wiki (default)

`wiki check` with no `FILE` argument runs every check below.

### Always errors (not configurable)

- **SHACL** — shapes from wiki frontmatter (`sh:NodeShape`, etc.) on the full RDF graph
- **Route safety** — unsafe path segments (spaces, reserved characters, and similar)
- **Output collisions** — two wiki sources mapping to the same built URL (against default `_site` layout)

### Configurable (`check.*` in `wiki.yaml`)

| Rule key              | What it audits                                                         |
| --------------------- | ---------------------------------------------------------------------- |
| `missing_layout_file` | `wazoo:layout` paths that do not resolve to a readable `.html.j2` file |
| `frontmatter_schema`  | Frontmatter that fails JSON Schema validation                          |
| `missing_schema_ref`  | `wazoo:jsonSchema` paths or URLs that cannot be loaded                 |

Default: `missing_layout_file`, `frontmatter_schema`, and `missing_schema_ref` are `error`.

### JSON Schema frontmatter

Bind schemas on `sh:NodeShape` documents with `wazoo:jsonSchema` and `sh:targetClass`. Type-level schemas apply to every matching page; pages may append extra schemas with their own `wazoo:jsonSchema` (string or list). Local refs resolve under the wiki config root; remote `http(s)` URLs are fetched at check time. Shape binding documents are excluded from instance validation. See [SHACL](SHACL.md) and [Style Guide](Style_Guide.md#shacl-shapes).

Broken links, filename pattern, and heading style are **not** part of `wiki check` — use [Wiki Subcommand lint](Wiki_Subcommand_lint.md).

### Scoped mode (one or more FILE args)

`wiki check path/to/Page.md` (or multiple paths) runs **SHACL and JSON Schema** per file. Route safety, output collisions, and layout frontmatter rules are **full-wiki only**. Cross-document SHACL interactions may only appear in a full-wiki check. Broken links on those pages require `wiki lint` with the same paths.

`--strict` applies only when warnings exist; scoped mode does not emit warnings today.

### Related CI commands

| Command               | Purpose                                              |
| --------------------- | ---------------------------------------------------- |
| `wiki lint --strict`  | Broken links, filename pattern, headings, link style |
| `wiki fmt --check`    | mdformat consistency                                 |
| `wiki render --check` | Stale inline SPARQL result blocks                    |
| `wiki link --check`   | Remaining missing-wikilink opportunities             |

`wiki build` runs `wiki lint` then `wiki check` before writing output unless `--no-check`.

## Related

- [Wiki Configuration](Wiki_Configuration.md) — `check.*` severities
- [SHACL](SHACL.md) — shape and JSON Schema binding
- [Wiki Subcommand lint](Wiki_Subcommand_lint.md) — convention lane
- [Style Guide](Style_Guide.md)
