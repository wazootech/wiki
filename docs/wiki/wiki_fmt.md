---
type: TechArticle
headline: wiki fmt
description: Format Markdown wiki pages with native Deno/dprint formatter options.
---

# `wiki fmt`

Format Markdown wiki pages in place with Wiki's in-process `dprint-plugin-markdown` formatter. Configure Markdown formatting under the top-level **`fmt`** key in `wiki.yml` (or `wiki.json`).

## Configuration

`wiki init` scaffolds native Deno/dprint options:

```yaml
fmt:
  textWrap: never
  lineWidth: 80
  newLineKind: lf
```

| Option        | Values                        | Default | Effect                                                                                          |
| ------------- | ----------------------------- | ------- | ----------------------------------------------------------------------------------------------- |
| `textWrap`    | `always`, `maintain`, `never` | `never` | Whether prose wraps to the configured width, preserves existing line breaks, or stays unwrapped |
| `lineWidth`   | Positive integer              | `80`    | Target width when `textWrap` is `always`                                                        |
| `newLineKind` | `auto`, `crlf`, `lf`          | `lf`    | Line ending emitted by the formatter                                                            |

Options use the Deno/dprint names and values directly. `fmt` must be an inline mapping; TOML pointers and `.mdformat.toml` discovery are not supported. Existing mdformat-only keys such as `wrap`, `end_of_line`, and `extensions` are rejected rather than translated. An empty mapping (`fmt: {}`) uses the same defaults as omitting `fmt`.

`wiki fmt -v` reports whether the options came from the inline `fmt` mapping or the Wiki CLI defaults. It does not search parent directories for formatter configuration.

| Concern               | Command       | Config                                                     |
| --------------------- | ------------- | ---------------------------------------------------------- |
| Mechanical Markdown   | `wiki fmt`    | `fmt:` in `wiki.yml`                                       |
| Editorial conventions | `wiki lint`   | `lint:` in `wiki.yml`                                      |
| Link integrity        | `wiki lint`   | `lint:` in `wiki.yml`                                      |
| Dynamic SPARQL tables | `wiki render` | Query-driven; generated blocks are left untouched by `fmt` |

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
| `FILE...`         | Optional Markdown paths; otherwise formats the entire wiki                |
| `--check`         | Check formatting without modifying files; exits 1 if formatting is needed |
| `-v`, `--verbose` | Print the formatter config source and formatted files                     |

## Related

- [Style Guide.md](Style_Guide.md)
- [wiki](wiki.md)
- [Wiki Configuration.md](Wiki_Configuration.md)
