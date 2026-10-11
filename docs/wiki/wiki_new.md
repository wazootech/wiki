---
type: TechArticle
headline: wiki new
description: Create a page of a known type, with its required fields first, as a validated edit.
---

# `wiki new`

Create a page of a known type. The type's required fields come first in the frontmatter, then the other fields you pass, then an H1 taken from `headline` or `name`. The page is built as a [wiki edit](wiki_edit.md) create, so it is validated against the wiki's shapes before anything is written, and it is written only with `--apply`.

A required field you do not pass is left out, never filled with a placeholder. The edit is then rejected, and the report names the missing fields, so an agent learns exactly what to add.

## Usage

```bash
wiki new "wiki/Neon_(payment).md" --type schema:Purchase \
  --set "schema:name=Neon plan" --set schema:price=5.00 --set schema:priceCurrency=USD
wiki new wiki/ --type schema:Purchase --set "schema:name=Neon plan" --apply
wiki new wiki/Ada_Lovelace.md --type schema:Person --set "schema:name=Ada Lovelace" --json
```

`PATH` is relative to the config root, as in [wiki edit](wiki_edit.md). When `PATH` is a directory (or ends in `/`), the filename comes from the title, Wikipedia-style: `Neon plan` becomes `Neon_plan.md`. `wiki new` never overwrites: it expects the file to be absent and exits `3` if it exists.

## Required fields

A field is required when either of these says so:

- A SHACL shape page whose `sh:targetClass` is the type lists it as an `sh:property` with `sh:minCount` of 1 or more. The key is written as the shape spells `sh:path` (`schema:name`).
- A JSON Schema bound to the type (`wazoo:jsonSchema` on a shape page) lists it in its top-level `required`.

Shapes written only in Turtle blocks or RDF files do not contribute to the scaffold's field order, but the edit's validation still enforces them. The type key is `@type` or `type`, whichever more of the wiki's pages already use.

## Options

| Flag              | Default | Description                                                          |
| ----------------- | ------- | -------------------------------------------------------------------- |
| `--type CLASS`    | —       | The page's type, such as `schema:Purchase`.                          |
| `--set KEY=VALUE` | —       | A frontmatter field (repeatable). `VALUE` is YAML, written as given. |
| `--body TEXT`     | —       | Markdown to put under the H1.                                        |
| `--apply`         | off     | Write the page. Without it, validate and report only.                |
| `--force`         | off     | Write even if the page introduces errors (they are still reported).  |
| `-f`, `--format`  | `text`  | `text` or `json`.                                                    |
| `--json`          | —       | Shorthand for `--format json`.                                       |

`VALUE` keeps its YAML spelling, so `schema:price=5.00` is written as `5.00`, not `5`. Quote a value that contains spaces for your shell.

## JSON output

The [wiki edit](wiki_edit.md) report (`status`, `files`, `conflicts`, `introduced`, `check`), plus:

- `required`: the type's required fields, in order.
- `missing`: the required fields this run did not supply.

## Exit codes

| Code | Meaning                                                        |
| ---- | -------------------------------------------------------------- |
| `0`  | The page is valid (dry run), or written (`--apply`).           |
| `1`  | Rejected: the page introduces check or lint errors.            |
| `2`  | Usage error, such as a directory `PATH` with no title to name. |
| `3`  | Conflict: the file already exists.                             |

## See also

- [wiki set](wiki_set.md) and [wiki patch](wiki_patch.md) — change a page after it exists
- [wiki show](wiki_show.md) — read a page and its content hash
- [SHACL](SHACL.md) — writing shape pages
