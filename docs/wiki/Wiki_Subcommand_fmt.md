---
type: TechArticle
headline: wiki fmt
description: Format markdown vault pages using mdformat with wikilink preservation.
---

# `wiki fmt`

Format markdown vault pages in-place using **mdformat** with standard GFM and frontmatter support. It preserves internal wiki links while formatting.

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
