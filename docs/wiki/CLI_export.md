---
id: wiki:CLI_export
type: TechArticle
name: wiki export
description: Export document frontmatter as RDF or JSON-LD.
---

# `wiki export`

Serialize parsed **frontmatter** (and RDF derived from it) for one file or the whole vault.

## Usage

```bash
wiki export
wiki export wiki/Page.md
wiki export wiki/Page.md -f turtle
wiki export -f json-ld -o vault.json
```

## Options

| Flag | Default | Description |
| --- | --- | --- |
| `FILE` | all vault docs | Single file or entire vault |
| `-f`, `--format` | `dict` | `dict`, `json-ld`, `turtle`, `xml`, `n3`, `nt`, `trig`, `nquads` |
| `-o`, `--output` | stdout | Output file |

## Output shape

For `dict` and `json-ld`, each entry is `{"name": "<filename>", "rdf": ...}`.

Raw RDF formats (`turtle`, etc.) on a **single** file write plain serialization without a JSON wrapper. Bulk export with raw formats still wraps entries in JSON for structure.

## Related

- [[JSON_LD]]
- [[Authoring_Guide]]
