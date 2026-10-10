---
type: TechArticle
headline: wiki patch
description: Append to, prepend to, or replace a heading's section, the body, or the frontmatter, as a validated edit.
---

# `wiki patch`

Append to, prepend to, or replace part of a page: the section under a heading, the whole body, or the frontmatter. The change is a `wiki edit` patch op, so it is validated before it is written, and written only with `--apply`.

## Usage

```bash
wiki patch "wiki/DeepSeek_(payment).md" --heading "Change log" --append \
  --content "- 2026-10-10 — Repriced."
echo "Rewritten." | wiki patch wiki/Alpha.md --heading Notes --replace --apply
wiki patch wiki/Alpha.md --body --append --content "Reviewed 2026-10-10." --json
```

Content comes from `--content`, or from stdin when `--content` is not given.

## Targets

- **`--heading TEXT`**: the lines under that heading, up to the next heading at the same or a higher level, so a section's subsections are part of it. The heading line itself is kept. `TEXT` matches the heading's text or its anchor slug (`change-log-1`). A heading that matches more than once is a usage error that lists the slugs to choose from. Headings are found by the Markdown parser, so a `#` line inside a fenced code block is never a heading.
- **`--body`**: everything after the frontmatter.
- **`--frontmatter`**: the YAML between the fences. The result must still parse.

Blocks are separated by one blank line, as `wiki fmt` leaves them. If the page was already fmt-clean, the result is formatted too; an unformatted page is left as it was apart from the patch.

## Options

| Flag                                 | Default | Description                                                                             |
| ------------------------------------ | ------- | --------------------------------------------------------------------------------------- |
| `--heading TEXT`                     | —       | Target the section under this heading.                                                  |
| `--body`                             | —       | Target the whole body.                                                                  |
| `--frontmatter`                      | —       | Target the frontmatter YAML.                                                            |
| `--append`, `--prepend`, `--replace` | —       | Where the content goes; give exactly one.                                               |
| `--content TEXT`                     | stdin   | The content to add.                                                                     |
| `--expect HASH`                      | —       | Refuse unless the file's SHA-256 still matches; take it from [wiki show](wiki_show.md). |
| `--apply`                            | off     | Write the change. Without it, validate and report only.                                 |
| `--force`                            | off     | Write even if the change introduces errors (they are still reported).                   |
| `-f`, `--format`                     | `text`  | `text` or `json` (the `wiki edit` report).                                              |
| `--json`                             | —       | Shorthand for `--format json`.                                                          |

## Exit codes

| Code | Meaning                                                               |
| ---- | --------------------------------------------------------------------- |
| `0`  | The change is valid (dry run), or written (`--apply`).                |
| `1`  | Rejected: the change introduces check or lint errors.                 |
| `2`  | Usage error, such as a heading that matches nothing or more than one. |
| `3`  | Conflict: the file no longer matches `--expect`.                      |

## See also

- [wiki set](wiki_set.md) — change one frontmatter field
- [wiki show](wiki_show.md) — read a page's outline and content hash
