---
type: TechArticle
headline: wiki rm
description: Delete a page, refusing while other pages link to it unless their links are pruned to plain text, as a validated edit.
---

# `wiki rm`

Delete a page. While other pages link to it, `wiki rm` refuses and names each linking page, so a delete never leaves a link dangling by accident. The change is a `wiki edit` delete op, so it is validated before it is written, and written only with `--apply`.

## Usage

```bash
wiki rm wiki/Old_Draft.md
wiki rm wiki/Old_Draft.md --prune-links --apply
wiki rm wiki/Old_Draft.md --expect 3f0c… --apply --json
```

With `--prune-links`, each inbound link becomes its plain label text: `[label](Old_Draft.md)` becomes `label`, `[[Old_Draft|label]]` becomes `label`, and `[[Old_Draft]]` becomes `Old_Draft`. The pruned pages are part of the same edit, so they are written together with the delete or not at all.

Only body links are guarded. A `wiki:` CURIE that names the page in another page's frontmatter is not pruned; the edit reports it as a broken metadata reference.

## Options

| Flag             | Default | Description                                                                             |
| ---------------- | ------- | --------------------------------------------------------------------------------------- |
| `--prune-links`  | off     | Replace inbound links with their label text instead of refusing.                        |
| `--expect HASH`  | —       | Refuse unless the file's SHA-256 still matches; take it from [wiki show](wiki_show.md). |
| `--apply`        | off     | Write the change. Without it, validate and report only.                                 |
| `--force`        | off     | Delete even though links would dangle, or errors are introduced (they are reported).    |
| `-f`, `--format` | `text`  | `text` or `json` (the `wiki edit` report).                                              |
| `--json`         | —       | Shorthand for `--format json`.                                                          |

## Exit codes

| Code | Meaning                                                                                      |
| ---- | -------------------------------------------------------------------------------------------- |
| `0`  | The delete is valid (dry run), or written (`--apply`).                                       |
| `1`  | Rejected: pages still link to it (`dangling_links`, one finding per page), or errors appear. |
| `2`  | Usage error, such as a path outside `wiki.input`.                                            |
| `3`  | Conflict: the file no longer matches `--expect`.                                             |

## See also

- [wiki mv](wiki_mv.md) — move or rename a page instead
- [wiki refs](wiki_refs.md) — list the pages that link to a page
