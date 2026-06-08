---
type: TechArticle
headline: wiki fmt
description: Format markdown vault pages using mdformat with wikilink preservation.
---

# `wiki fmt`

Format markdown vault pages in-place using **mdformat**. Mechanical markdown style (ATX headings, list spacing, GFM tables, frontmatter layout) is configured under the top-level **`fmt`** key in `wiki.yaml` (or `wiki.json`).

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

An empty mapping (`fmt: {}`) is valid and merges mdformat built-in defaults with wiki-cli’s default extensions (`gfm`, `frontmatter`, `wikilink`).

### Pointer mode (optional TOML file)

Instead of an inline mapping, set `fmt` to a **relative path** from the config file directory:

```yaml
fmt: .mdformat.toml
```

Copy the packaged reference template from [`src/wiki/templates/mdformat.toml.j2`](https://github.com/wazootech/wiki/blob/main/src/wiki/templates/mdformat.toml.j2) or call `render_mdformat_toml()` in tests. Absolute paths are rejected at config load.

### Resolution order

For each file, `wiki fmt` picks the first source that applies:

1. Inline `fmt` mapping in the loaded wiki config
1. TOML file at `config_root / fmt` when `fmt` is a path string and the file exists
1. `config_root/.mdformat.toml` when present
1. Nearest `.mdformat.toml` found by walking up from the markdown file’s directory (mdformat default)
1. mdformat built-in defaults plus wiki-cli default extensions

Use `wiki fmt -v` to print which source was used (for example `Using inline fmt in wiki config.`).

| Concern               | Command       | Config                                           |
| --------------------- | ------------- | ------------------------------------------------ |
| Mechanical markdown   | `wiki fmt`    | `fmt:` in `wiki.yaml` (inline or path)           |
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

From another directory, pass the config path on the main command:

```bash
wiki --config docs fmt -v
```

## Options

| Flag              | Description                                                               |
| ----------------- | ------------------------------------------------------------------------- |
| `FILE`            | Optional single document; otherwise entire vault                          |
| `--check`         | Check formatting without modifying files; exits 1 if formatting is needed |
| `-v`, `--verbose` | Print fmt config source and formatted files                               |

## Related

- [Style_Guide.md](Style_Guide.md)
- [Wiki_CLI.md](Wiki_CLI.md)
- [Wiki_Configuration.md](Wiki_Configuration.md)
