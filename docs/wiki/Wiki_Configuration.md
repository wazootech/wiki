---
type: TechArticle
headline: Wiki configuration
description: Reference for wiki.yaml, wiki.yml, and wiki.json (WikiConfig).
---

# Wiki configuration

The CLI loads **WikiConfig** from `wiki.yaml`, `wiki.yml`, or `wiki.json` in the working directory (or from `-c path`).

Config files are validated strictly. Unknown keys, removed aliases, wrong nested keys under `check`, `lint`, or `sparql_service`, invalid syntax, or a non-mapping top level all fail immediately instead of being ignored.

## Config semantics

Three audit lanes map to three commands:

| Lane       | Command      | YAML block | Purpose                                                             |
| ---------- | ------------ | ---------- | ------------------------------------------------------------------- |
| Integrity  | `wiki check` | `check:`   | SHACL, route safety, collisions, layout frontmatter                   |
| Convention | `wiki lint`  | `lint:`    | `broken_links`, `filename_pattern`, `headings`, `heading_levels`, `duplicate_headings`, `thematic_breaks`, `link_style` (plus top-level regex) |
| Formatting | `wiki fmt`   | —          | `.mdformat.toml` at vault root (not `wiki.yaml`)                    |

### Rule placement

Mechanical markdown (lists, tables, ATX syntax, line endings) belongs in **`.mdformat.toml`** and **`wiki fmt`** — not in `wiki.yaml`. Vault policy and link conventions belong under **`lint:`**. SHACL, routes, and layout keys belong under **`check:`** — never under `lint:`. See [Style_Guide](Style_Guide.md) for the full matrix.

- Top-level **`filename_pattern`** is the regex string. **`lint.filename_pattern`** is the severity (`error`, `warning`, or `off`).
- Putting a regex under `check.filename_pattern` fails at load with a hint.
- Legacy combined `check:` keys (`filename_pattern`, `headings`) are rejected — move them to `lint:`.

Relative **`--input-dir`** paths on the CLI resolve against the config file directory (same as paths in yaml), not the shell cwd.

## Example

```yaml
input_dirs:
  - wiki
asset_dirs:
  - assets
wiki_base: https://example.org/wiki/
base_url: /wiki
url_style: dir
filename_pattern: "[A-Za-z0-9_()-]+\\.md"
exclude:
  - assets/private/**
content_predicate: schema:articleBody

lint:
  broken_links: warning
  filename_pattern: warning
  headings: off

# Optional: old slug -> new route for wiki link --fix-broken after renames
link_renames:
  Old_Page_Name: New_Page_Name

# Optional: format for wiki link --apply (markdown | wikilink; default markdown)
link_style: markdown

context:
  schema: https://schema.org/
  wiki: https://example.org/wiki/
  foaf: http://xmlns.com/foaf/0.1/
```

JSON configs may use `"context"` or `"@context"` for prefix maps (JSON-LD compatible).

## Paths and vault layout

| Key          | Default                            | Purpose                                                                   |
| ------------ | ---------------------------------- | ------------------------------------------------------------------------- |
| `input_dirs` | `["wiki"]`                         | Markdown and data files to load (relative to config file directory)       |
| `asset_dirs` | `["assets"]` if that folder exists | Static files copied on `wiki build`                                       |
| `exclude`    | `[]`                               | Glob patterns (POSIX paths relative to config root) skipped when indexing |

Page URLs come from paths under `input_dirs`: `wiki/Alice.md` → `/wiki/Alice/` with default `base_url` and `url_style: dir`. `index.md` in a folder owns that folder’s route (for example `wiki/index.md` → `/wiki/`).

## Wiki and RDF

| Key                    | Default                                            | Purpose                                                                                                                          |
| ---------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `wiki_base`            | from `context.wiki` or `https://wiki.example.org/` | Base URI for generated document IDs                                                                                              |
| `context` / `@context` | built-in prefixes                                  | Prefix → namespace URI map for CURIEs in frontmatter and \[\[Microdata                                                           |
| `content_predicate`    | —                                                  | When set (for example `schema:articleBody`), markdown body text is added as a literal on each document node for full-text SPARQL |
| `uri_ext`              | `false`                                            | Include file extension in generated URIs when true                                                                               |

## Site output

| Key           | Default | Purpose                                                             |
| ------------- | ------- | ------------------------------------------------------------------- |
| `base_url`    | `/wiki` | URL prefix for built/served pages (`""` for site root)              |
| `url_style`   | `dir`   | `dir` → `slug/index.html`; `file` → `slug.html`                     |
| `page_layout` | —       | Path (relative to config) to the site default page layout HTML file |

## Serve API

| Key                 | Default       | Purpose                                               |
| ------------------- | ------------- | ----------------------------------------------------- |
| `sparql_service.enabled` | `false`       | Enable or disable the SPARQL endpoint on `wiki serve` |
| `sparql_service.path`    | `/api/sparql` | Reserved route for the SPARQL endpoint                |

Example:

```yaml
sparql_service:
  enabled: true
  path: /api/sparql
```

The endpoint reuses the same SPARQL engine as `wiki query`. It is read-only and intended for local or development-oriented use through `wiki serve`.

It is **opt-in by default** because enabling it exposes raw graph-query access in addition to HTML preview.

`sparql_service.path` must not collide with the effective `base_url` page routes or the watch endpoint. Invalid values such as `/`, `/wiki`, `/wiki/foo`, or `/wiki/__watch` are rejected when `wiki serve` starts.

## Page layout

When `page_layout` is set, the CLI renders every page through that HTML file using `{placeholder}` tokens. Per-page overrides use `wazoo:layout` in frontmatter; see [Wiki_Page_Layouts](Wiki_Page_Layouts.md).

### Layout strategy

The first-class presentation contract in this repository is page layout files under `layouts/` (for example `layouts/default.html` referenced from `page_layout`).

- The [Wiki CLI](Wiki_CLI.md) owns the semantic markdown-to-HTML pipeline and placeholder contract.
- Wiki page layout files are the primary built-in extension point for presentation.
- Framework-specific sites such as Next.js, Mintlify, or other external docs stacks are better treated as downstream integrations or separate layout repositories unless they need core CLI changes.

### Minimal fallback

Without a configured layout file (or when the path is missing), every page is rendered as:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>{page_title}</title>
</head>
<body>
  <h1>{page_title}</h1>
  {page_content}
</body>
</html>
```

No CSS, JavaScript, infobox, table of contents, backlinks, or categories are included.

### Placeholders

Replace `{key}` tokens in your wiki page layout:

| Placeholder               | Type         | Description                                                                                                |
| ------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------- |
| `{page_title}`            | escaped text | Page title (frontmatter `name` or document H1).                                                            |
| `{page_content}`          | raw HTML     | Rendered page body. For index pages: `<ul>…</ul>` of all page links. For articles: full rendered markdown. |
| `{page_kind}`             | text string  | `"index"` or `"article"`. Use in JS or CSS selectors.                                                      |
| `{body_class}`            | text string  | CSS classes for the `<body>` element. `wiki-index` for index, `wiki-page layout-{slug}` for articles.      |
| `{base_url}`              | text string  | URL prefix from config (e.g. `/wiki`).                                                                     |
| `{url_style}`             | text string  | `"dir"` or `"file"`.                                                                                       |
| `{inline_css}`            | raw CSS      | \[\[Wiki_CLI                                                                                               |
| `{logo_svg}`              | raw SVG      | Wikipedia-style globe logo.                                                                                |
| `{all_pages_json}`        | JSON string  | Array of `{slug, title}` for all pages.                                                                    |
| `{current_slug_json}`     | JSON string  | Current page slug as a JSON string literal.                                                                |
| `{layout_label}`          | raw HTML     | Layout label when `wazoo:layout` is set (empty when using the site default shell).                         |
| `{type_label}`            | raw HTML     | Schema type badge from frontmatter `type` / `@type` (empty when unset). Read view only.                    |
| `{layout_class}`          | text string  | CSS-safe slug derived from the layout file stem (`default` when unset).                                    |
| `{infobox_html}`          | raw HTML     | Typed frontmatter property table (empty for index).                                                        |
| `{toc_html}`              | raw HTML     | Table of contents `<div>` with heading links (empty if no headings).                                       |
| `{backlinks_html}`        | raw HTML     | Backlinks section (empty if none).                                                                         |
| `{categories_html}`       | raw HTML     | Category links `<div>` (empty if none).                                                                    |
| `{sidebar_contents_html}` | raw HTML     | Extra sidebar links from typed properties.                                                                 |
| `{source_markdown}`       | escaped text | Raw markdown source for the "view source" tab.                                                             |
| `{metadata_tool_html}`    | raw HTML     | Sidebar "View metadata" link `<li>` (empty if no frontmatter).                                             |
| `{metadata_tab_html}`     | raw HTML     | Tab bar "Metadata" `<li>` (empty if no frontmatter).                                                       |
| `{metadata_pane_html}`    | raw HTML     | Full metadata display pane `<div>` (empty if no frontmatter).                                              |

Unknown `{placeholders}` are left untouched in the output. This lets you use literal braces in JavaScript or CSS without escaping.

The metadata pane uses the same RDF serialization path as `wiki export` (compacted JSON-LD, Turtle, N3, RDF/XML, N-Triples, TriG, N-Quads). A compact **Format** chip row switches views without JavaScript. In `wiki serve`, set the initial chip with `?metadata_format=FORMAT` (for example `turtle` or `json-ld`). In `wiki build`, all format views are embedded in the page HTML so the picker works offline.

### Built-in CSS classes and IDs

The wiki builder generates these selectors in the rendered page content:

| Selector                    | Where                                                       |
| --------------------------- | ----------------------------------------------------------- |
| `#article-top`              | Read-view `<article>` anchor; TOC “(Top)” links here.       |
| `#firstHeading`             | Talk / Source / Metadata pane `<h1>` titles (not read).     |
| `#siteSub`                  | Subtitle under Talk / Source / Metadata pane headings.      |
| `article`                   | Wrapper around the rendered markdown body (`#article-top`). |
| `.layout-label`             | Uppercase type or custom-layout badge in read view.         |
| `.toc` / `#toc`             | Table of contents container.                                |
| `#catlinks` / `.catlinks`   | Category links box.                                         |
| `.backlinks` / `#backlinks` | Backlinks section.                                          |
| `.catlinks-label`           | Categories heading label.                                   |
| `.catlinks-list`            | Categories `<ul>`.                                          |
| `.infobox`                  | Typed frontmatter property table.                           |
| `.page-meta`                | Infobox class (used for styling).                           |
| `.template-SLUG`            | Per-template class on infobox (e.g. `template-person`).     |
| `toclevel-N` / `lN`         | TOC list item classes for heading level N.                  |
| `.wikilink`                 | Internal wiki page links.                                   |
| `pre[data-copy]`            | Block code with raw source for clipboard copy.              |
| `.code-block`               | Wrapper injected around copyable pre blocks.                |
| `.code-copy-btn`            | Copy button shown on code-block hover/focus.                |

### JavaScript hooks

The bundled default wiki page layout (`layouts/default.html` created by `wiki init`) provides:

| Function                       | Purpose                                              |
| ------------------------------ | ---------------------------------------------------- |
| `switchTab(viewName)`          | Switch between read / talk / source / metadata tabs. |
| `loadTalkNotes()`              | Load per-page local-storage notes.                   |
| `saveTalkNotes()`              | Save per-page notes to localStorage.                 |
| `clearTalkNotes()`             | Clear per-page notes.                                |
| `copySourceCode()`             | Copy markdown source to clipboard.                   |
| `copyPreContent()`             | Copy a `pre[data-copy]` block to clipboard.          |
| `initCodeCopyButtons()`        | Wrap copyable pre blocks and inject copy buttons.    |
| `toggleToc()`                  | Show/hide table of contents.                         |
| `goToRandomArticle()`          | Navigate to a random page.                           |
| `triggerSearch()`              | Execute search and navigate to first match.          |
| `onSearchInput(e)`             | Live search suggestions.                             |
| `handleSearchKey(e)`           | Keyboard navigation for search suggestions.          |
| `navigateSearch(slug)`         | Navigate to a search result.                         |
| `applyCategoryFilterFromUrl()` | Filter index page by `?category=` URL parameter.     |

If the configured template file does not exist, the built-in minimal shell is used silently — no error.

CLI flags on `wiki build` and `wiki serve` can override `base_url` and `url_style` for a single run.

## Filename conventions

The CLI does not hard-code kebab-case. Projects choose a convention with **`filename_pattern`**, matched against the **full filename** (including `.md`) on markdown files only.

**Wikipedia-style (recommended):** preserved capitalization and underscores — `Gregory_Davidson.md`, `Pokemon_Diamond_(copy_1).md`, `LLM_Wiki_CLI.md`. Use a pattern such as:

```yaml
filename_pattern: "[A-Za-z0-9_()-]+\\.md"
```

**Kebab-case (optional):** if you prefer `gregory-house.md`, set an explicit pattern (for example `[a-z0-9-]+\\.md`) and enforce it via `lint.filename_pattern`. Wikipedia-style and kebab-case should not be mixed in one vault.

Page routes keep the casing from the filename; GitHub Pages URLs are case-sensitive.

## Link renames (`link_renames`)

Optional map of **old slug → new route** used by `wiki link --fix-broken` when a page was renamed but wikilinks still use the old target. Fuzzy slug matching applies only when exactly one vault route is a close match.

## Link style (`link_style`)

Controls how `wiki link --apply` inserts new internal links:

| Value      | Inserts               | Default |
| ---------- | --------------------- | ------- |
| `markdown` | `[display](Route.md)` | yes     |
| `wikilink` | `[[Route\|display]]`  |         |

`wiki link --fix-broken` preserves the existing link kind in each file; only `--apply` uses `link_style`.

When `link_style` is `markdown`, `lint.link_style` (default `warning`) flags Obsidian wikilinks in body prose. Set `lint.link_style: off` to allow wikilinks while keeping markdown as the apply format, or set `link_style: wikilink` for an Obsidian-style vault.

## Integrity checks (`check`)

Under `check`, each rule is `error`, `warning`, or `off`:

| Rule key                | Default | What it audits                                                               |
| ----------------------- | ------- | ---------------------------------------------------------------------------- |
| `forbidden_layout_keys` | `error` | Legacy `template` / `wiki:template` frontmatter (use `wazoo:layout` instead) |
| `missing_layout_file`   | `error` | `wazoo:layout` paths that do not resolve to a readable `.html` file          |

Build-safety rules (unsafe URL characters, spaces in routes) and output URL collision detection always apply regardless of `check` settings.

## Convention audits (`lint`)

Under `lint`, each rule is `error`, `warning`, or `off`:

| Rule key           | Default   | What it audits                                                                                                                         |
| ------------------ | --------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `broken_links`     | `warning` | Wikilinks, internal markdown links, heading fragments, assets, `wiki:` CURIEs                                                        |
| `filename_pattern` | `warning` | Full filename vs top-level `filename_pattern` regex                                                                                    |
| `headings`         | `off`     | ATX `#` headings only (no Setext underlines), sentence-case H2+, H1 title case conventional, numbered headings                         |
| `thematic_breaks`  | `off`     | Horizontal rules (`---`, `***`, `___`) in body prose                                                                                   |
| `link_style`       | `warning` | Wikilinks in body prose when top-level `link_style` is `markdown`                                                                      |

## This repository

`docs/wiki.yaml` drives the documentation vault and GitHub Pages deploy. It sets `content_predicate: schema:articleBody` so page bodies participate in SPARQL when needed, `lint.broken_links: warning`, `link_style: markdown` with `lint.link_style: warning`, and stricter `lint.headings` / `lint.thematic_breaks` warnings than the `wiki init` defaults.

## Related

- [Wiki_CLI](Wiki_CLI.md#global-options) — `-c` and `--input-dir` global options
- [Wiki_Subcommand_check](Wiki_Subcommand_check.md) — integrity checks
- [Wiki_Subcommand_lint](Wiki_Subcommand_lint.md) — convention audits
- [Style_Guide](Style_Guide.md) — shapes and frontmatter
