---
type: TechArticle
headline: wiki refs
description: List the pages that link to a page and the pages it links to.
---

# `wiki refs`

List a page's place in the link graph: the pages that link to it (inbound) and the pages it links to (outbound). Check `refs` before moving or deleting a page to see which pages an edit would touch.

## Usage

```bash
wiki refs wiki/Alpha.md
wiki refs wiki/Alpha.md --json
```

`PATH` is relative to the config root, as in `wiki edit` and [wiki show](wiki_show.md).

## Options

| Flag             | Default | Description                    |
| ---------------- | ------- | ------------------------------ |
| `-f`, `--format` | `text`  | `text` or `json`.              |
| `--json`         | —       | Shorthand for `--format json`. |

## JSON output

```json
{
  "version": 1,
  "path": "wiki/Beta.md",
  "route": "Beta",
  "inbound": [{ "route": "Alpha", "path": "wiki/Alpha.md" }],
  "outbound": [{ "route": "Alpha", "path": "wiki/Alpha.md" }]
}
```

Inbound pages come in document order and outbound pages in first-link order, each listed once. Both use the link index behind [wiki lint](wiki_lint.md)'s broken-link audit: wikilinks and Markdown page links in the body, skipping links inside code. Links that resolve to no page are left out; `wiki lint` reports those.

## Exit codes

| Code | Meaning                                                 |
| ---- | ------------------------------------------------------- |
| `0`  | Printed.                                                |
| `2`  | Usage error, including a `PATH` that is not a document. |

## See also

- [wiki show](wiki_show.md) — one page's frontmatter, outline, and hash
- [wiki link](wiki_link.md) — suggest and repair links
