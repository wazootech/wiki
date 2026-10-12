---
type: TechArticle
description: Remove frontmatter that repeats a value the graph derives from the page's H1 or Git history.
---

# `wiki fix`

Remove frontmatter entries that repeat a value the graph already **derives**: a `headline` equal to the page's first H1, or a `dateCreated` / `dateModified` equal to its Git dates. Preview by default — files change only with `--apply`.

This page has no `headline` key: its `schema:headline` comes from the H1 above.

## Usage

```bash
wiki fix
wiki fix -v
wiki fix wiki/Some_Page.md
wiki fix --dry-run
wiki fix --apply
```

## Options

| Flag              | Description                                                              |
| ----------------- | ------------------------------------------------------------------------ |
| `FILE...`         | Optional markdown paths; otherwise entire wiki                           |
| `--apply`         | Write the changes, validated and atomic (all files or none)              |
| `-n`, `--dry-run` | Preview without writing files (the default; cannot be used with `apply`) |
| `-v`, `--verbose` | Name each removed field and the derived value it repeats                 |

Exit codes: `0` on success (including a preview with findings), `1` when the change is rejected, `2` on a usage error, `3` when a file changed while `fix` ran.

## Derived metadata

Every typed document in the graph gets three [schema.org](https://schema.org/) values without any frontmatter:

| Property              | Derived from                                                               | Literal                            |
| --------------------- | -------------------------------------------------------------------------- | ---------------------------------- |
| `schema:headline`     | The plain text of the first ATX `# H1` outside fenced code (Markdown only) | `xsd:string`, e.g. `The wiki CLI`  |
| `schema:dateCreated`  | The **oldest** committer time among the commits `git log --follow` reaches | `xsd:dateTime`, UTC, whole seconds |
| `schema:dateModified` | The **newest** committer time among the commits `git log --follow` reaches | `xsd:dateTime`, UTC, whole seconds |

- **The H1** is reduced to text: ``# The `wiki` *CLI*`` yields `The wiki CLI`, a link yields its label. A Setext (underlined) H1 does not count; `wiki fmt` rewrites those to ATX. A page without an H1 derives no headline.
- **Dates** use the committer time, so a rebase or amend moves them, written as RFC 3339 in UTC (`2026-10-11T09:30:00Z`). `--follow` carries history across renames, so moving a page keeps its creation date. Only the history the checkout already has counts: nothing is fetched, and a shallow clone reports the commits it holds.
- **No usable history** — `git` is not installed or not permitted, the wiki is not in a repository, the repository has no commits, or the file is untracked — sets both dates to the file's modification time.
- **An explicit frontmatter value always wins.** A key counts as the same property when it resolves to the same predicate IRI, so `headline` (under a schema.org `@vocab`) and `schema:headline` both override the H1. A differing value is never rewritten or reported.
- **Derived values are optional.** A document with no H1 still validates unless one of your own shapes requires `schema:headline`. Conversely, such a shape is now satisfied by an H1 alone.

Deriving happens while the graph is built (`query`, `check`, `render`, `build`, `serve`, `mcp`) and never writes to a source file. It costs one `git log` per document, run in parallel and remembered for the rest of the process until `HEAD` moves; the [Graph Cache](Graph_Cache.md) disk cache is keyed on `HEAD` too. `wiki export` and `wiki file show` report frontmatter as written and do not add derived values.

## What counts as redundant

An entry is redundant only when it repeats the derived value **exactly**:

- `headline` must equal the H1's plain text character for character.
- A date must be an unquoted YAML timestamp with a time part, at the same instant. `2026-10-11` (a date, `xsd:date`) is a coarser claim than `2026-10-11T00:00:00Z`, and a quoted `"2026-10-11T00:00:00Z"` is a string, so neither is redundant.
- When several keys name one property (`headline` and `schema:headline`), all of them must repeat the derived value; otherwise none is redundant, because removing one would change the graph.
- An untyped document (no subject in the graph) and an entry whose removal would leave the frontmatter empty are never reported.

[wiki lint](wiki_lint.md) reports the same entries as `redundant_frontmatter` when that rule is enabled; it is `off` by default.

## Safe removal

`fix` cuts only the lines an entry occupies and keeps every other byte: other keys, comments, key order, quoting, line endings (CRLF stays CRLF), a byte order mark, and the body. It does not re-serialize the YAML. An entry it cannot cut cleanly is kept with a warning: one in a flow mapping (`{headline: X}`), one sharing its line with another value, one whose value carries an anchor, or a key written twice.

`--apply` goes through the same guarded write as [wiki edit](wiki_edit.md): each file's content hash is checked before writing, the result is validated with `check` and `lint`, and the files are written atomically. A fix that would introduce an error, such as a JSON Schema bound with `wazoo:jsonSchema` that still lists `headline` in `required`, is rejected and nothing is written.

## Scope

`fix` handles only these derived properties. It does not extract facts from commit diffs or reconcile competing claims across sources.

## Related

- [wiki lint](wiki_lint.md) — `lint.redundant_frontmatter`
- [Wiki Configuration](Wiki_Configuration.md) — rule severities
- [wiki edit](wiki_edit.md) — the guarded write `--apply` uses
