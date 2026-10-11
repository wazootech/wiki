---
type: TechArticle
headline: wiki show
description: Describe one page as the engine sees it, with the content hash an edit expects.
---

# `wiki show`

Print one page the way the engine reads it: parsed frontmatter, the same frontmatter as compacted JSON-LD, the heading outline, the pages it links to, and the SHA-256 of the file's bytes. That hash is what a [wiki edit](wiki_edit.md) op takes as `expect`, so reading a page with `show` and then editing it is safe against another agent changing it in between.

## Usage

```bash
wiki show wiki/Alpha.md
wiki show wiki/Alpha.md --json
wiki show wiki/Alpha.md --field schema:headline
wiki -c docs/wiki.yml show docs/wiki/SPARQL.md --json
```

`PATH` is relative to the config root, not the working directory, exactly as in [wiki edit](wiki_edit.md), so a path from `show` pastes into an edit plan unchanged. Any wiki document resolves, including pages from installed sources, which are readable but never editable.

## Options

| Flag             | Default | Description                                                             |
| ---------------- | ------- | ----------------------------------------------------------------------- |
| `--field KEY`    | —       | Print only this frontmatter field; exits `1` when the field is not set. |
| `-f`, `--format` | `text`  | `text` or `json`. With `--field`, `json` prints the value as JSON.      |
| `--json`         | —       | Shorthand for `--format json`.                                          |

`KEY` is the literal frontmatter key, CURIE included (`schema:headline`), not an expanded IRI.

## JSON output

`--json` is the stable contract; the text form is for people.

```json
{
  "version": 1,
  "path": "wiki/Alpha.md",
  "route": "Alpha",
  "hash": "3f0c…",
  "frontmatter": { "@type": "schema:Article", "schema:headline": "Alpha" },
  "jsonld": { "@context": { "…": "…" }, "@graph": ["…"] },
  "headings": [
    { "level": 1, "text": "Alpha", "slug": "alpha", "line": 6 }
  ],
  "links": [
    { "route": "Beta", "path": "wiki/Beta.md" }
  ]
}
```

- `jsonld` is what [wiki export](wiki_export.md) writes with `-f json-ld -m compacted` for this one file.
- `headings[].line` counts from the top of the file, frontmatter included; `slug` is the anchor a `#fragment` link uses. Headings inside fenced code are not headings.
- `links` lists each linked page once, in first-link order, by the same rules [wiki lint](wiki_lint.md) uses for backlinks. `path` is `null` when no document has the route.

## Exit codes

| Code | Meaning                                                 |
| ---- | ------------------------------------------------------- |
| `0`  | Printed.                                                |
| `1`  | `--field` names a field the page does not set.          |
| `2`  | Usage error, including a `PATH` that is not a document. |

## See also

- [wiki refs](wiki_refs.md) — who links to a page
- [wiki edit](wiki_edit.md) — validated, atomic page edits
- [wiki export](wiki_export.md) — whole-wiki RDF and JSON-LD
