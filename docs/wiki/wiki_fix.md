---
type: TechArticle
headline: wiki fix
description: Remove frontmatter that only repeats a value Wiki derives from the page itself.
---

# `wiki fix`

Remove frontmatter fields that only repeat a value Wiki already derives from the page. `wiki fix` previews by default and writes only with `--apply`.

## Derived metadata

At graph-build time (`build`, `query`, `check`, `render`) Wiki fills three `schema:` properties for each Markdown page when frontmatter does not state them. Nothing is written to the page.

| Property              | Derived from                                         |
| --------------------- | ---------------------------------------------------- |
| `schema:headline`     | the first ATX `# H1` outside fenced code             |
| `schema:dateCreated`  | the oldest commit that reaches the file (`--follow`) |
| `schema:dateModified` | the newest commit that reaches the file              |

- A page with no H1 has no derived headline.
- Dates are the Git **committer** time in UTC, RFC 3339, whole seconds (`2026-10-11T23:27:18Z`), typed `xsd:dateTime`. `--follow` means a renamed file keeps its earlier history.
- Only the history in the checkout is used, and nothing is fetched, so a shallow clone reports the commits it has. Uncommitted edits do not move `dateModified`.
- A file with no reachable commit (untracked, no Git) uses its modification time for both dates.
- An explicit frontmatter value for the same property always wins, so derived values never override an author. No built-in shape requires them.
- Derived values are part of the graph that SHACL validates, so a shape of your own that requires `schema:headline` is satisfied by a page's H1, with or without a `headline` key.

## Usage

```bash
wiki fix                  # preview every page
wiki fix --apply          # remove the redundant fields
wiki fix wiki/Page.md -v  # one page, naming each removed field
```

## Options

| Flag              | Description                                                       |
| ----------------- | ----------------------------------------------------------------- |
| `--apply`         | Write the changes. Without it, files are left byte-identical.     |
| `--dry-run`       | Preview only. This is the default; the flag is the explicit form. |
| `-v`, `--verbose` | Name each removed field.                                          |

## What counts as redundant

An entry is removed only when it repeats the derived value exactly:

- `headline` equals the H1 text, ignoring surrounding whitespace.
- `dateCreated` or `dateModified` is a date-time that equals the derived instant. A date-only value (`2026-10-11`) is a coarser claim and is kept.
- A differing value is intentional. It is never reported and never rewritten.

Only the removed entry's own lines change. Other keys, comments, ordering, quoting, line endings, and the document body are preserved byte for byte. Flow-style frontmatter is left unchanged.

## Lint rule

`lint.redundant_frontmatter` reports the same entries as a lint finding. It defaults to `off`, because many wikis repeat `headline` beside the H1 on purpose; set it to `warning` or `error` to enforce a derive-only style.

```yaml
lint:
  redundant_frontmatter: warning
```

## Scope

This derives file-level metadata from the page's own H1 and Git history. It does not extract facts from commit diffs or keep provenance for competing claims.

## Related

- [wiki lint](wiki_lint.md)
- [Wiki Configuration](Wiki_Configuration.md)
