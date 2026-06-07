---
type: TechArticle
headline: wiki fmt
description: Format markdown vault pages using mdformat with wikilink preservation.
---

# `wiki fmt`

Format markdown vault pages in-place using **mdformat**. Mechanical markdown style (ATX headings, list spacing, GFM tables, frontmatter layout) lives in **`.mdformat.toml`** at the vault root—not in `wiki.yaml`.

## Configuration

Place `.mdformat.toml` next to `wiki.yaml` (for this repo: `docs/.mdformat.toml`). Example:

```toml
wrap = "no"
end_of_line = "lf"
extensions = ["gfm", "frontmatter", "wikilink"]
```

| Concern               | Command       | Config                                           |
| --------------------- | ------------- | ------------------------------------------------ |
| Mechanical markdown   | `wiki fmt`    | `.mdformat.toml`                                 |
| Editorial conventions | `wiki lint`   | `wiki.yaml` → `lint:`                            |
| Link integrity        | `wiki check`  | `wiki.yaml` → `check:`                           |
| Dynamic SPARQL tables | `wiki render` | (query-driven; blocks are left untouched by fmt) |

Recommended CI order: `fmt --check` → `lint --strict` → `check --strict` → `render --check`.

## Usage

```bash
wiki fmt
wiki fmt wiki/Some_Page.md
wiki fmt --check
wiki fmt -v
```

## Options

| Flag              | Description                                                               |
| ----------------- | ------------------------------------------------------------------------- |
| `FILE`            | Optional single document; otherwise entire vault                          |
| `--check`         | Check formatting without modifying files; exits 1 if formatting is needed |
| `-v`, `--verbose` | Print formatted files and summary                                         |

## Related

- [Style_Guide.md](Style_Guide.md)
- [Wiki_CLI.md](Wiki_CLI.md)
- [Wiki_Configuration.md](Wiki_Configuration.md)
