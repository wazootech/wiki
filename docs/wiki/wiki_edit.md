---
type: TechArticle
headline: wiki edit
description: Change a wiki through validated, atomic edits instead of hand-written Markdown.
---

# `wiki edit`

Apply a batch of page changes as one edit: validate it against the wiki's shapes, routes, and links before anything is written, then write every file or none. `wiki edit` takes the edit as JSON; [wiki new](wiki_new.md), [wiki set](wiki_set.md), [wiki patch](wiki_patch.md), [wiki mv](wiki_mv.md), and [wiki rm](wiki_rm.md) build a one-op edit for you and share its flags, report, and exit codes. [wiki show](wiki_show.md) and [wiki refs](wiki_refs.md) are the read side.

## Why

Without it, an agent changes a wiki the way a person does in an editor: read whole files, hand-assemble YAML frontmatter, write body text, fix links by hand, then run `wiki check` and `wiki lint` and iterate on the diff. The engine already knows every invariant that loop re-derives (shapes, routes, the link graph), so `wiki edit` checks them at write time instead of after the fact ([wiki#353](https://github.com/wazootech/wiki/issues/353)).

These are guarded semantic writes, not an editor: there are no app-control verbs, and the CLI never commits. Git history stays with the caller's worktree.

## Usage

```bash
wiki edit --from plan.json            # validate and report; writes nothing
wiki edit --from plan.json --apply    # validate, then write atomically
cat plan.json | wiki edit --json      # read the edit from stdin
```

## The edit format

An edit is `{"ops": [...]}`. Paths are relative to the config root (or absolute), never to the working directory, so a plan can be handed between agents unchanged.

| Op        | Fields                                                     | What it does                                                                                                                                                                                                             |
| --------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `create`  | `path`, `content` or `type`/`frontmatter`/`body`, `expect` | Create a page from full `content`, or scaffold it from a class `type` (such as `schema:Purchase`): the type's required fields first, then the rest of `frontmatter`, then an H1 and `body`.                              |
| `replace` | `path`, `content`, `expect`                                | Replace a file's whole content.                                                                                                                                                                                          |
| `set`     | `path`, `field`, `value` or `yaml`, `expect`               | Set one top-level frontmatter field; `value: null` removes it. `yaml` passes the value as YAML source, kept verbatim (`"12.00"` stays `12.00`, where the JSON number `12.00` becomes `12`). See [wiki set](wiki_set.md). |
| `patch`   | `path`, `target`, `mode`, `content`, `expect`              | `target` is `{"heading": "Change log"}`, `{"frontmatter": true}`, or `{"body": true}`; `mode` is `append`, `prepend`, or `replace`. See [wiki patch](wiki_patch.md).                                                     |
| `move`    | `from`, `to`, `expect`                                     | Move a page and repoint every link and metadata reference to it. `expect` applies to `from`; `to` must not exist. See [wiki mv](wiki_mv.md).                                                                             |
| `delete`  | `path`, `pruneLinks`, `expect`                             | Delete a page. Refused while other pages link to it, unless `pruneLinks` turns those links into plain text. See [wiki rm](wiki_rm.md).                                                                                   |

`expect` is the SHA-256 of the file's raw bytes, as [wiki show](wiki_show.md) reports it, or `"absent"` for a create. It is checked against the file on disk before the edit, even when an earlier op in the same edit touched that file.

## The `expect` loop

1. `wiki show PATH --json` and keep its `hash`.
2. Build the edit with `"expect": "<hash>"` on each op and dry-run it.
3. Apply it with `--apply`. Each file in the report carries its new `after` hash, which is the `expect` for the next edit.

If another agent changed the file in between, the edit exits `3` and writes nothing. Re-read the page with `wiki show`, rebuild the edit against what is there now, and retry. Never `--force` past a conflict: `--force` overrides validation errors, not stale reads.

## Validation

The edit is staged in memory and the ordinary `check` and `lint` passes run twice over the same scope, once on the wiki as it is and once on the wiki as it would be. Only findings the edit **introduces** reject it, so a wiki that is already broken elsewhere does not block an unrelated change. A move re-anchors the moved page's existing findings, so they are not blamed on the move.

Validation is scoped, not whole-wiki: it covers the pages the edit touches and the pages that link to deleted or moved ones. A page whose SHACL result depends on a touched page without linking to it (for example an `sh:class` constraint on an IRI that page defines) is not re-validated, so an accepted edit can still break it. `wiki check` over the whole wiki remains the full gate; keep it in CI.

## Writing

Nothing is written without `--apply`. With it, every new file content goes to a sibling temp file first, then each is renamed over its target, and deletes go last. If any step fails, every file already written is restored to its exact original bytes, new files and directories are removed, and the error is reported. Just before writing, each file is compared with what was read once more, so a change that landed during validation is still a conflict.

Writes land only on wiki documents under `wiki.input`. Installed sources and the `.wiki/` cache are read-only, and so are symlinks and excluded paths.

## Options

| Flag             | Default | Description                                                         |
| ---------------- | ------- | ------------------------------------------------------------------- |
| `--from FILE`    | `-`     | Read the edit from `FILE`, or `-` for stdin.                        |
| `--apply`        | off     | Write the edit. Without it, validate and report only.               |
| `--force`        | off     | Write even if the edit introduces errors (they are still reported). |
| `-f`, `--format` | `text`  | `text` or `json` (the edit report on stdout).                       |
| `--json`         | —       | Shorthand for `--format json`.                                      |

## Exit codes

| Code | Meaning                                                                          |
| ---- | -------------------------------------------------------------------------------- |
| `0`  | The edit is valid (dry run), or written (`--apply`).                             |
| `1`  | Rejected: the edit introduces check or lint errors, or would leave links broken. |
| `2`  | Usage error: malformed JSON, an unknown op, or a path outside `wiki.input`.      |
| `3`  | Conflict: an `expect` hash no longer matches the file. Nothing was written.      |

## Report

`--json` writes one object (`version` 1):

| Field        | Description                                                                                                       |
| ------------ | ----------------------------------------------------------------------------------------------------------------- |
| `status`     | `dry_run`, `applied`, `rejected`, or `conflict`.                                                                  |
| `ok`         | `true` for `dry_run` and `applied`.                                                                               |
| `files`      | Per file: `path`, `action` (`create`, `modify`, `delete`), and `before`/`after` hashes (`null` when absent).      |
| `conflicts`  | Per stale `expect`: `path`, `expected`, and `actual` (`null` when the file does not exist).                       |
| `introduced` | Findings present after the edit and absent before it, in the [wiki check](wiki_check.md#json-output) issue shape. |
| `check`      | The scoped `check -f json` report of the edited pages, or `null` on a conflict.                                   |

## Example

Record a new spend in a budget ledger and note it in the ledger's change log, as one edit:

```json
{
  "ops": [
    {
      "op": "create",
      "path": "wiki/Neon_(payment).md",
      "expect": "absent",
      "type": "schema:Purchase",
      "frontmatter": {
        "schema:name": "Neon plan",
        "schema:orderDate": "2026-10-10",
        "schema:priceCurrency": "USD",
        "schema:seller": "https://memory.wazoo.dev/Neon",
        "schema:customer": "https://memory.wazoo.dev/Ethan_Davidson"
      },
      "body": "Monthly Neon plan for the hosted world."
    },
    {
      "op": "set",
      "path": "wiki/Neon_(payment).md",
      "field": "schema:price",
      "yaml": "19.00"
    },
    {
      "op": "patch",
      "path": "wiki/Budget_Ledger.md",
      "expect": "9d97…",
      "target": { "heading": "Change log" },
      "mode": "append",
      "content": "- 2026-10-10 — Added the Neon plan."
    }
  ]
}
```

A dry run reports `status: "dry_run"` and the three files' `after` hashes, or `status: "rejected"` naming any required field the shape still misses. Adding `--apply` writes all of it or none of it.

## See also

- [wiki show](wiki_show.md) and [wiki refs](wiki_refs.md) — read a page and its links before editing
- [wiki check](wiki_check.md) — the whole-wiki gate
- [Wiki Programmatic API](Wiki_Programmatic_API.md) — `Wiki.edit()` in process
