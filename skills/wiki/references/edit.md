# Edit — change pages through the engine, not the file

Structural changes to a wiki go through the Wiki CLI's write verbs. A verb validates the change against shapes, routes, and the link graph **before** anything is written, writes all-or-nothing, and reports what it did as JSON. Hand-editing Markdown re-derives invariants the engine already knows, and the mistakes show up only at the next `wiki check`.

Run `bash skills/wiki/scripts/verify.sh` first. When it prints `write verbs unavailable`, the installed CLI predates them: use the [fallback](#fallback-older-cli).

## Verbs

| Change                                  | Verb                                                      | Notes                                                                 |
| --------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------- |
| Read a page, get its hash               | `wiki show PATH [--field KEY]`                            | Frontmatter, JSON-LD, heading outline, links, and `hash`              |
| What links here, and where it links     | `wiki refs PATH`                                          | Inbound and outbound pages                                            |
| New page of a known type                | `wiki new PATH --type CLASS --set KEY=VALUE…`             | Required fields come from the type's shape; missing ones are rejected |
| One frontmatter field                   | `wiki set PATH FIELD VALUE` / `--unset`                   | VALUE is YAML, written as given; comments and key order kept          |
| Body text under a heading               | `wiki patch PATH --heading H --append\|--prepend\|--replace` | `--content TEXT` or stdin; also `--body`, `--frontmatter`          |
| Rename or move a page                   | `wiki mv FROM TO`                                         | Rewrites every inbound link                                           |
| Delete a page                           | `wiki rm PATH [--prune-links]`                            | Refuses while pages link to it, unless links are pruned to plain text |
| Several changes as one unit             | `wiki edit --from FILE\|-`                                | A `WikiEdit` JSON plan; see [below](#wikiedit-json)                   |

Paths are relative to the **config root** (the directory holding `wiki.yml`), never the working directory, so a path from `wiki show` pastes into any other verb unchanged. Installed sources under `.wiki/` can be read, never edited.

Do not use the verbs for prose rewrites a human would review line by line; a whole-section `patch --replace` is fine, but a page-wide rewrite is ordinary editing followed by `wiki fmt` and `wiki check`.

## The loop

1. **Read.** `wiki show PATH --json` → note `hash`. For a rename or delete, also `wiki refs PATH`.
1. **Dry run.** Run the verb without `--apply`. Nothing is written; the report says what would change and lists any check or lint finding the change **introduces** (findings the wiki already had do not count against it).
1. **Apply.** Re-run with `--apply` and `--expect <hash>`. The report's `files[].after` is the next `expect` for that file.

Pass `--json` whenever the output feeds another step; the text form is for people.

## Exit codes

| Code | Status                  | What to do                                                                                     |
| ---- | ----------------------- | ---------------------------------------------------------------------------------------------- |
| `0`  | `dry_run` or `applied`  | Continue.                                                                                      |
| `1`  | `rejected`              | The change introduces errors (`introduced` lists them). Fix the change, not the check.         |
| `2`  | usage                   | Wrong flags, unknown heading, ambiguous heading, path outside the wiki. Correct the call.      |
| `3`  | `conflict`              | The file changed since you read it (`conflicts` has expected vs actual). Re-`show`, re-plan.   |

On `3`, never retry with a fresh hash you did not read, and never reach for `--force`: someone else's write is in the file, and your plan was made against an older one.

`--force` writes despite `1`, and only for a deliberate, explained reason (for example, creating a page whose required link target lands in the next edit of the same task). It never overrides `3`. Say in the change report why it was used.

## WikiEdit JSON

`wiki edit` takes `{"ops": [...]}`. Every op is validated together and written atomically, so a ledger entry and the log line recording it land together or not at all.

| `op`      | Fields                                                                     |
| --------- | -------------------------------------------------------------------------- |
| `create`  | `path`, then `content` (whole file) or `type` + `frontmatter` + `body`; `expect: "absent"` |
| `set`     | `path`, `field`, `value` (JSON; `null` removes) or `yaml` (verbatim YAML), `expect`        |
| `patch`   | `path`, `target` (`{"heading": "…"}`, `{"body": true}`, `{"frontmatter": true}`), `mode` (`append`, `prepend`, `replace`), `content`, `expect` |
| `move`    | `from`, `to`, `expect` (of `from`)                                         |
| `delete`  | `path`, `expect`                                                           |
| `replace` | `path`, `content` (whole file), `expect`                                   |

Use `yaml` rather than `value` for anything whose spelling matters: JSON `12.00` is the number `12`, while `"yaml": "12.00"` writes `12.00`.

Example: record a purchase in a budget ledger and log it on the ledger page. The shape types `schema:price` as `xsd:double`, so the price goes in a `set` op as `yaml`, not in `frontmatter` (JSON would write the integer `10`); an op may target a page created earlier in the same edit.

```json
{
  "ops": [
    {
      "op": "create",
      "path": "wiki/DeepSeek_top-up_(payment).md",
      "type": "schema:Purchase",
      "frontmatter": {
        "schema:name": "DeepSeek API top-up",
        "schema:description": "Second prepaid DeepSeek API balance for wazoo-memorybench evals.",
        "schema:orderDate": "2026-10-10",
        "schema:priceCurrency": "USD",
        "schema:seller": "https://memory.wazoo.dev/DeepSeek",
        "schema:customer": "https://memory.wazoo.dev/Ethan_Davidson"
      },
      "body": "Second prepaid balance, funding the next round of evals.",
      "expect": "absent"
    },
    {
      "op": "set",
      "path": "wiki/DeepSeek_top-up_(payment).md",
      "field": "schema:price",
      "yaml": "10.00"
    },
    {
      "op": "patch",
      "path": "wiki/Budget_Ledger.md",
      "target": { "heading": "Change log" },
      "mode": "append",
      "content": "- 2026-10-10 — Added the [DeepSeek top-up](./DeepSeek_top-up_(payment).md).",
      "expect": "<hash from wiki show wiki/Budget_Ledger.md --json>"
    }
  ]
}
```

```bash
wiki edit --from plan.json --json            # dry run: review files[] and introduced[]
wiki edit --from plan.json --apply --json    # write it
wiki render && wiki fmt                      # refresh SPARQL tables the new page feeds, then realign them
```

Edits do not re-render SPARQL blocks. When the wiki has them (a ledger table, a register), run `wiki render` after applying, then `wiki fmt` (render writes unaligned tables), or `wiki render --check` / `wiki fmt --check` fail in CI.

## Fallback: older CLI

When `verify.sh` reports the write verbs unavailable, edit the Markdown directly, keeping the same discipline by hand: read the page and the type's shape page first, change only what the task needs, then run `wiki fmt` on the changed files and `wiki lint --strict` and `wiki check --strict` before reporting. For a rename, search the wiki for the old filename and route and update every link to it; for a delete, do the same before removing the file. Mention in the change report that the CLI lacked the write verbs.
