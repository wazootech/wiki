---
type: TechArticle
headline: wiki file
description: Create, change, move, delete, or inspect one wiki document file through validated, link-aware edits.
---

# `wiki file`

Work on one wiki document file at a time. The subcommands cover Markdown pages and the data documents under `wiki.input` (`.md`, `.yaml`, `.yml`, `.json`, `.toml`).

These are **validated, link-aware edits, not plain file operations.** Each write verb builds one [wiki edit](wiki_edit.md): it is checked against the wiki's integrity and convention rules before anything is written, it is a dry run unless you pass `--apply`, and moves and deletes keep links consistent. For ordinary file work (copying, assets, files outside the wiki's documents) use your shell; `wiki file` only edits wiki documents, and installed sources under `.wiki/` stay read-only.

## Usage

```bash
wiki file new wiki/Alice.md --type schema:Person --set "schema:name=Alice" --apply
wiki file set wiki/Alice.md schema:email alice@example.org --apply
wiki file patch wiki/Alice.md --heading Notes --append --content "Met at the summit." --apply
wiki file mv wiki/Alice.md wiki/People/Alice.md --apply
wiki file rm wiki/Old_Draft.md --prune-links --apply
wiki file show wiki/Alice.md --json
wiki file refs wiki/Alice.md
```

## Subcommands

| Subcommand                            | What it does                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------- |
| [wiki file new](wiki_file_new.md)     | Create a file of a known type, with its required fields first.                  |
| [wiki file set](wiki_file_set.md)     | Set or remove one frontmatter field.                                            |
| [wiki file patch](wiki_file_patch.md) | Append to, prepend to, or replace a section, the body, or the frontmatter.      |
| [wiki file mv](wiki_file_mv.md)       | Move or rename a file and repoint every link and metadata reference to it.      |
| [wiki file rm](wiki_file_rm.md)       | Delete a file, refusing while other files link to it unless links are pruned.   |
| [wiki file show](wiki_file_show.md)   | Describe one file as the engine sees it, with the content hash an edit expects. |
| [wiki file refs](wiki_file_refs.md)   | List the files that link to a file and the files it links to.                   |

For several changes at once, across many files, build a batch and run it with [wiki edit](wiki_edit.md). The `wiki file` write verbs are shorthand for one-operation edits.

## Why a group

The subcommands sit under `wiki file` so that the per-file verbs read as one family and stay distinct from whole-wiki commands. In particular, `wiki file rm` (delete a document) is not [wiki remove](wiki_remove.md) (remove an installed source).
