---
type: TechArticle
headline: wiki set
description: Set or remove one frontmatter field, keeping comments, key order, and value spelling, as a validated edit.
---

# `wiki set`

Set one frontmatter field, or remove it with `--unset`. Everything else in the frontmatter stays exactly as it was: comments, key order, and how each value is spelled. The change is a [wiki edit](wiki_edit.md) set op, so it is validated against the wiki's shapes before it is written, and written only with `--apply`.

## Usage

```bash
wiki set "wiki/DeepSeek_(payment).md" schema:price 13.50
wiki set "wiki/DeepSeek_(payment).md" schema:price 13.50 --expect 3f0c… --apply
wiki set "wiki/DeepSeek_(payment).md" schema:url --unset --apply
wiki set wiki/Alpha.md schema:keywords "[wiki, rdf]" --json
```

`FIELD` is taken literally, so `schema:price` is one key; it is never split on `.` or `:`. `VALUE` is YAML and is written as given: `13.50` stays `13.50` and `2026-10-10` stays unquoted. A page with no frontmatter gets one.

If the page was already formatted the way `wiki fmt` leaves it, the result is formatted too. A page that was not formatted is not reformatted, so the diff shows only the field you changed.

## Options

| Flag             | Default | Description                                                                             |
| ---------------- | ------- | --------------------------------------------------------------------------------------- |
| `--unset`        | off     | Remove `FIELD` instead of setting it. Takes no `VALUE`.                                 |
| `--expect HASH`  | —       | Refuse unless the file's SHA-256 still matches; take it from [wiki show](wiki_show.md). |
| `--apply`        | off     | Write the change. Without it, validate and report only.                                 |
| `--force`        | off     | Write even if the change introduces errors (they are still reported).                   |
| `-f`, `--format` | `text`  | `text` or `json` (the [wiki edit](wiki_edit.md) report).                                |
| `--json`         | —       | Shorthand for `--format json`.                                                          |

Removing a field a shape requires is rejected like any other change that breaks the page.

## Exit codes

| Code | Meaning                                                               |
| ---- | --------------------------------------------------------------------- |
| `0`  | The change is valid (dry run), or written (`--apply`).                |
| `1`  | Rejected: the change introduces check or lint errors.                 |
| `2`  | Usage error, such as a value that is not YAML or a non-Markdown page. |
| `3`  | Conflict: the file no longer matches `--expect`.                      |

## See also

- [wiki patch](wiki_patch.md) — change a page's body
- [wiki new](wiki_new.md) — create a page of a known type
- [wiki show](wiki_show.md) — read a page and its content hash
