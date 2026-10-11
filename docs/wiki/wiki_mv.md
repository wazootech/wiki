---
type: TechArticle
headline: wiki mv
description: Move or rename a page and repoint every link and metadata reference to it, as a validated edit.
---

# `wiki mv`

Move or rename a page. Every page that links to it is repointed at the new path, so nothing is left broken. The change is a `wiki edit` move op, so it is validated before it is written, and written only with `--apply`.

## Usage

```bash
wiki mv wiki/Jeff_Kazzee.md "wiki/Jeff_Kazzee_(person).md"
wiki mv wiki/Beta.md wiki/people/Beta.md --expect 3f0c… --apply
wiki mv wiki/Beta.md wiki/Gamma.md --json
```

## What follows the page

- **Body links in other pages.** Each one keeps its own style: wikilink or Markdown link, with or without the `.md` extension, a leading `./`, and its `#fragment`. Balanced parentheses stay raw, so a link to `Jeff_Kazzee_(person)` is written `./Jeff_Kazzee_(person).md`; only an unbalanced parenthesis is percent-encoded.
- **The page's own relative links.** When the page changes directory, its links are re-derived from the new directory. Same-page `#fragment` links are left alone.
- **Metadata references.** `wiki:` CURIEs that name the page, and its IRI (the base IRI plus its route), are rewritten in other pages' frontmatter and in data documents. A page that sets its own `@id` keeps that IRI when it moves, so references to it are left alone.

The links rewritten are exactly the ones `wiki lint` and `wiki refs` count, including links written inside fenced code blocks ([wiki#362](https://github.com/wazootech/wiki/issues/362)). Prose that merely mentions the old path, such as a URL in inline code, is not rewritten.

A finding the page already had before the move, such as a missing field or a broken link of its own, is not blamed on the move.

## Options

| Flag             | Default | Description                                                                                            |
| ---------------- | ------- | ------------------------------------------------------------------------------------------------------ |
| `--expect HASH`  | —       | Refuse unless `FROM`'s SHA-256 still matches; take it from [wiki show](wiki_show.md).                  |
| `--apply`        | off     | Write the move. Without it, validate and report only.                                                  |
| `--force`        | off     | Write even if the move introduces errors (they are still reported).                                    |
| `-f`, `--format` | `text`  | `text` or `json` (the `wiki edit` report, listing every file the move creates, modifies, and deletes). |
| `--json`         | —       | Shorthand for `--format json`.                                                                         |

`TO` must not exist, and a move keeps the document's extension.

## Exit codes

| Code | Meaning                                                                      |
| ---- | ---------------------------------------------------------------------------- |
| `0`  | The move is valid (dry run), or written (`--apply`).                         |
| `1`  | Rejected: the move introduces check or lint errors, such as an unsafe route. |
| `2`  | Usage error, such as a target outside `wiki.input` or a different extension. |
| `3`  | Conflict: `TO` already exists, or `FROM` no longer matches `--expect`.       |

## See also

- [wiki rm](wiki_rm.md) — delete a page
- [wiki refs](wiki_refs.md) — list the pages that link to a page
- [wiki link](wiki_link.md) — repair links that are already broken
