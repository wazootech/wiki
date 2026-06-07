---
type: TechArticle
label: wiki link
comment: Suggest missing wikilinks and repair unambiguous broken internal links.
---

# `wiki link`

Suggest **missing wikilinks** for plain-text mentions of other vault pages, or **repair** broken internal links when the fix is unambiguous. Report-only by default — mutations require explicit flags.

## Usage

```bash
wiki link
wiki link wiki/Some_Page.md
wiki link -v
wiki link --check
wiki link --dry-run --apply
wiki link --apply
wiki link --fix-broken
wiki link --fix-broken --dry-run
```

## Options

| Flag              | Description                                                                          |
| ----------------- | ------------------------------------------------------------------------------------ |
| `FILE`            | Optional single markdown document; otherwise entire vault                            |
| `--apply`         | Insert `[[target\|matched text]]` for each suggestion (body only, never frontmatter) |
| `--fix-broken`    | Repair unambiguous broken wikilinks and internal markdown page links                 |
| `-n`, `--dry-run` | Preview `--apply` or `--fix-broken` without writing files                            |
| `-c`, `--check`   | Exit 1 if opportunities or broken links remain (CI gate)                             |
| `-v`, `--verbose` | Include target titles in report output; print changed files when applying            |

## Detection rules

Missing-link suggestions skip:

- Existing wikilinks and markdown links
- Fenced and inline code
- Self-links and overlapping aliases (longest alias wins)
- Short single-word acronyms (for example `HTML`, `JSON`) unless the page slug humanizes to the same text

Broken-link repair (`--fix-broken`) only runs when:

- The target page rename is listed in `link_renames` (see [Wiki_Configuration](Wiki_Configuration.md))
- A unique fuzzy route match exists among vault pages
- A unique fuzzy heading fragment exists on the target page

It never auto-creates pages or deletes links. Asset links, metadata CURIEs, and ambiguous matches stay manual.

## Why not check or lint?

- **`wiki check`** is the integrity lane — it **reports** broken links via `check.broken_links` but does not edit files. Repair is `wiki link --fix-broken`, not `wiki check`.
- **`wiki lint`** is the convention lane — filename patterns and heading style. Missing wikilinks are optional graph enrichment, not a lint violation; plain text is valid markdown.
- **`wiki link`** requires explicit `--apply` or `--fix-broken` because suggestions are heuristic and repairs are conservative by design.
- See [Design_Philosophies](Design_Philosophies.md#check-lint-fmt-and-link) for the full lane model.

## Related

- [Wiki_Subcommand_check](Wiki_Subcommand_check.md) — integrity lane (`check.broken_links`)
- [Style_Guide](Style_Guide.md) — internal link conventions
- [Wiki_CLI](Wiki_CLI.md)
