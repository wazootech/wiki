---
type: TechArticle
headline: wiki fmt
description: Format markdown wiki pages using mdformat with wikilink preservation.
---

# `wiki fmt`

Format markdown wiki pages in-place using **mdformat**. Mechanical markdown style (ATX headings, list spacing, GFM tables, frontmatter layout) is configured under the top-level **`fmt`** key in `wiki.yaml` (or `wiki.json`).

## Configuration

### Inline `fmt` (default)

`wiki init` scaffolds inline `fmt` in `wiki.yaml`:

```yaml
fmt:
  wrap: "no"
  end_of_line: lf
  extensions: [gfm, frontmatter, wikilink]
```

Keys and values follow [mdformat configuration](https://mdformat.readthedocs.io/en/stable/users/configuration_file.html). Unknown keys fail at config load; invalid values fail at load or when `wiki fmt` reads TOML.

An empty mapping (`fmt: {}`) is valid and resolves to the same **wiki-cli fmt defaults** as omitting `fmt` when no TOML file applies (`wrap: "no"`, `end_of_line: lf`, extensions `gfm`, `frontmatter`, `wikilink`).

### Pointer mode (optional TOML file)

Instead of an inline mapping, set `fmt` to a **relative path** from the config file directory:

```yaml
fmt: .mdformat.toml
```

Create the file beside `wiki.yaml` with the same keys as inline `fmt` (for example `wrap = "no"`, `end_of_line = "lf"`, `extensions = ["gfm", "frontmatter", "wikilink"]`). Absolute paths are rejected at config load.

### Resolution order

`wiki fmt` stops at the **first** source below. Inline `fmt` always wins — it never merges with a `.mdformat.toml` on disk.

1. **Inline** — `fmt:` mapping in `wiki.yaml` (`fmt: {}` counts as inline and uses wiki-cli defaults)
1. **Pointer** — TOML at the relative path in `fmt:`
1. **Wiki TOML** — `config_root/.mdformat.toml` when `fmt` is omitted or the pointer file is missing
1. **Parent walk** — nearest `.mdformat.toml` above the markdown file (mdformat behavior)
1. **Defaults** — wiki-cli fmt defaults (`wrap: "no"`, `end_of_line: lf`, `gfm` / `frontmatter` / `wikilink`)

`wiki fmt -v` prints which step matched (for example `Using inline fmt in wiki config.`).

| Concern               | Command       | Config                                           |
| --------------------- | ------------- | ------------------------------------------------ |
| Mechanical markdown   | `wiki fmt`    | `fmt:` in `wiki.yaml` (inline or path)           |
| Editorial conventions | `wiki lint`   | `wiki.yaml` → `lint:`                            |
| Link integrity        | `wiki lint`   | `wiki.yaml` → `lint:`                            |
| Dynamic SPARQL tables | `wiki render` | (query-driven; blocks are left untouched by fmt) |

Recommended CI order: `fmt --check` → `lint --strict` → `check --strict` → `render --check`.

## Usage

```bash
wiki fmt
wiki fmt wiki/Some_Page.md
wiki fmt --check
wiki fmt -v
```

From another directory, pass the config path on the main command:

```bash
wiki --config docs fmt -v
```

## Options

| Flag              | Description                                                               |
| ----------------- | ------------------------------------------------------------------------- |
| `FILE...`         | Optional markdown paths; otherwise entire wiki                            |
| `--check`         | Check formatting without modifying files; exits 1 if formatting is needed |
| `-v`, `--verbose` | Print fmt config source and formatted files                               |

## Related

- [Style Guide.md](Style_Guide.md)
- [Wiki CLI.md](Wiki_CLI.md)
- [Wiki Configuration.md](Wiki_Configuration.md)
