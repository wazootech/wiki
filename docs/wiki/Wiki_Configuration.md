---
type: TechArticle
name: Wiki configuration
description: Reference for wiki.yaml, wiki.yml, and wiki.json (WikiConfig).
---

# Wiki configuration

The CLI loads **WikiConfig** from `wiki.yaml`, `wiki.yml`, or `wiki.json` in the working directory (or from `-c path`).

## Example

```yaml
inputDirs:
  - wiki
assetDirs:
  - assets
wikiBase: https://example.org/wiki/
baseUrl: /wiki
urlStyle: dir
filenamePattern: "[A-Za-z0-9_()-]+"
exclude:
  - assets/private/**
contentPredicate: schema:text

check:
  filenamePattern: warning
  brokenLinks: warning
  headings: off

context:
  schema: https://schema.org/
  wiki: https://example.org/wiki/
  foaf: http://xmlns.com/foaf/0.1/
```

JSON configs may use `"context"` or `"@context"` for prefix maps (JSON-LD compatible).

## Paths and vault layout

| Key         | Aliases      | Default                            | Purpose                                                                   |
| ----------- | ------------ | ---------------------------------- | ------------------------------------------------------------------------- |
| `inputDirs` | `input_dirs` | `["wiki"]`                         | Markdown and data files to load (relative to config file directory)       |
| `assetDirs` | `asset_dirs` | `["assets"]` if that folder exists | Static files copied on `wiki build`                                       |
| `exclude`   | —            | `[]`                               | Glob patterns (POSIX paths relative to config root) skipped when indexing |

Page URLs come from paths under `inputDirs`: `wiki/Alice.md` → `/wiki/Alice/` with default `baseUrl` and `urlStyle: dir`. `index.md` in a folder owns that folder’s route (for example `wiki/index.md` → `/wiki/`).

## Wiki and RDF

| Key                    | Aliases             | Default                                            | Purpose                                                                                                                   |
| ---------------------- | ------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `wikiBase`             | `wiki_base`         | from `context.wiki` or `https://wiki.example.org/` | Base URI for generated document IDs                                                                                       |
| `context` / `@context` | —                   | built-in prefixes                                  | Prefix → namespace URI map for CURIEs in frontmatter and microdata                                                        |
| `contentPredicate`     | `content_predicate` | —                                                  | When set (for example `schema:text`), markdown body text is added as a literal on each document node for full-text SPARQL |
| `uriExt`               | `uri_ext`           | `false`                                            | Include file extension in generated URIs when true                                                                        |

## Site output

| Key             | Aliases     | Default | Purpose                                                |
| --------------- | ----------- | ------- | ------------------------------------------------------ |
| `baseUrl`       | `base_url`  | `/wiki` | URL prefix for built/served pages (`""` for site root) |
| `urlStyle`      | `url_style` | `dir`   | `dir` → `slug/index.html`; `file` → `slug.html`        |
| `html_template` | —           | —       | Path (relative to config) to a custom HTML shell file  |

When `html_template` is set, the CLI renders every page through that file using `{placeholder}` tokens.
See [HTML_Template](HTML_Template.md) for the full list of placeholders and hooks.

If the configured template file does not exist, the built-in minimal shell is used silently — no error.

CLI flags on `wiki build` and `wiki serve` can override `baseUrl` and `urlStyle` for a single run.

## Filename conventions

The CLI does not hard-code kebab-case. Projects choose a convention with **`filenamePattern`**, matched against each document’s filename stem (without `.md`).

**Wikipedia-style (recommended):** preserved capitalization and underscores — `Gregory_House.md`, `Pokemon_Diamond_(copy_1).md`, `LLM_Wiki_CLI.md`. Use a pattern such as:

```yaml
filenamePattern: "[A-Za-z0-9_()-]+"
```

**Kebab-case (optional):** if you prefer `gregory-house.md`, set an explicit pattern (for example `[a-z0-9-]+`) and enforce it via `check.filenamePattern`. Wikipedia-style and kebab-case should not be mixed in one vault.

Page routes keep the casing from the filename; GitHub Pages URLs are case-sensitive.

## Hygiene checks

Under `check`, each rule is `error`, `warning`, or `off`:

| Rule key          | Default   | What it audits                                                                |
| ----------------- | --------- | ----------------------------------------------------------------------------- |
| `filenamePattern` | `warning` | Custom regex on filename stems (see top-level `filenamePattern`)              |
| `brokenLinks`     | `warning` | Wikilinks, internal markdown links, heading fragments, assets, `wiki:` CURIEs |
| `headings`        | `off`     | Sentence-case headings, numbered headings, thematic `---` in body             |

Build-safety rules (unsafe URL characters, spaces in routes) and output URL collision detection always apply regardless of `check` settings.

## This repository

`docs/wiki.yaml` drives the documentation vault and GitHub Pages deploy. It sets `contentPredicate: schema:text` so page bodies participate in SPARQL when needed.

## Related

- [Wiki_CLI](Wiki_CLI.md#global-options) — `-c` and `--input-dir` global options
- [Wiki_Subcommand_check](Wiki_Subcommand_check.md) — running audits
- [Style_Guide](Style_Guide.md) — shapes and frontmatter
