---
type: TechArticle
headline: wiki export
description: Export document frontmatter as RDF or JSON-LD.
---

# `wiki export`

Serialize parsed **frontmatter** (and RDF derived from it) for one file or the whole vault.

## Usage

```bash
wiki export
wiki export wiki/Page.md
wiki export wiki/A.md wiki/B.md
wiki export wiki/Page.md -f turtle
wiki export -f json-ld -o vault.json
wiki export wiki/Page.md --mode compacted -f json-ld
```

## Options

| Flag             | Default        | Description                                                      |
| ---------------- | -------------- | ---------------------------------------------------------------- |
| `FILE...`        | all vault docs | One or more vault documents, or omit for entire vault            |
| `-f`, `--format` | `dict`         | `dict`, `json-ld`, `turtle`, `xml`, `n3`, `nt`, `trig`, `nquads` |
| `--mode`         | `expanded`     | `expanded` or `compacted` serialization mode                     |
| `-o`, `--output` | stdout         | Output file                                                      |

## Output shape

For `dict` and `json-ld`, each entry is `{"name": "<filename>", "rdf": ...}`.

Raw RDF formats (`turtle`, etc.) on a **single** FILE write plain serialization without a JSON wrapper. Multiple FILE args or whole-vault export with raw formats is not supported — use `dict` or `json-ld`, or export one file at a time.

`--mode compacted` is most visible for JSON-LD, where it emits `@context` and compacted terms when the vault context provides them.

## Related

- [RDF](RDF.md)
- [RDF_XML](RDF_XML.md)
- [Turtle](Turtle.md)
- [JSON_LD](JSON_LD.md)
- [Notation3](Notation3.md)
- [N_Triples](N_Triples.md)
- [TriG](TriG.md)
- [N_Quads](N_Quads.md)
- [XML](XML.md)
- [Style_Guide](Style_Guide.md)
