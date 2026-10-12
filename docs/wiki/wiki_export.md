---
type: TechArticle
headline: wiki export
description: Export document frontmatter as RDF or JSON-LD.
---

# `wiki export`

Serialize parsed **frontmatter** (and RDF derived from it) for one file or the whole wiki.

## Usage

```bash
wiki export
wiki export wiki/Page.md
wiki export wiki/A.md wiki/B.md
wiki export wiki/Page.md -f turtle
wiki export -f json-ld -o wiki.json
wiki export wiki/Page.md --mode compacted -f json-ld
```

## Options

| Flag             | Default       | Description                                               |
| ---------------- | ------------- | --------------------------------------------------------- |
| `FILE...`        | all wiki docs | One or more wiki documents, or omit for entire wiki       |
| `-f`, `--format` | `dict`        | `dict`, `json-ld`, `turtle`, `n3`, `nt`, `trig`, `nquads` |
| `--mode`         | `expanded`    | `expanded` or `compacted` serialization mode              |
| `-o`, `--output` | stdout        | Output file                                               |

RDF/XML **input** is supported for `.rdf` and `.xml` files under `wiki.input`. RDF/XML **output** is deferred from the Deno cutover: `-f xml` is rejected with a clear unsupported-format error and never falls back to another format.

## Output shape

For `dict` and `json-ld`, each entry is `{"name": "<filename>", "rdf": ...}`.

Raw RDF formats (`turtle`, `n3`, `nt`, `trig`, `nquads`) on a **single** FILE write plain serialization without a JSON wrapper. Multiple FILE args or whole-wiki export with raw formats is not supported — use `dict` or `json-ld`, or export one file at a time.

## Derived values

Exports include the metadata the graph derives for each typed document: `schema:headline` from its first `# H1` and `schema:dateCreated` / `schema:dateModified` from its Git history or modification time (see [wiki fix](wiki_fix.md#derived-metadata)). The RDF and JSON-LD formats carry them exactly as the wiki graph does. In `dict`, each one the frontmatter does not set is added under its `schema:` key, for example `"schema:headline": "Page Title"`; a key the frontmatter does set (such as `headline`) is kept as written and no derived key is added beside it.

`--mode compacted` is most visible for JSON-LD, where it emits `@context` and compacted terms when the wiki context provides them.

## Related

- [RDF](RDF.md)
- [RDF XML](RDF_XML.md)
- [Turtle](Turtle.md)
- [JSON LD](JSON_LD.md)
- [Notation3](Notation3.md)
- [N Triples](N_Triples.md)
- [TriG](TriG.md)
- [N Quads](N_Quads.md)
- [Style Guide](Style_Guide.md)
