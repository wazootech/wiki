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

## Serve API

| Key                | Default       | Purpose                                               |
| ------------------ | ------------- | ----------------------------------------------------- |
| `serveApi.enabled` | `false`       | Enable or disable the SPARQL endpoint on `wiki serve` |
| `serveApi.path`    | `/api/sparql` | Reserved route for the SPARQL endpoint                |

Example:

```yaml
serveApi:
  enabled: true
  path: /api/sparql
```

The endpoint reuses the same SPARQL engine as `wiki query`. It is read-only and intended for local or development-oriented use through `wiki serve`.

It is **opt-in by default** because enabling it exposes raw graph-query access in addition to HTML preview.

`serveApi.path` must not collide with the effective `baseUrl` page routes or the watch endpoint. Invalid values such as `/`, `/wiki`, `/wiki/foo`, or `/wiki/__watch` are rejected when `wiki serve` starts.

## HTML template

When `html_template` is set, the CLI renders every page through that file using `{placeholder}` tokens.

### Template strategy

The current first-class template contract in this repository is the optional `index.html` / `html_template` shell.

- The Wiki CLI owns the semantic markdown-to-HTML pipeline and placeholder contract.
- This repository treats custom HTML shells as the primary built-in extension point for presentation.
- Framework-specific sites such as Next.js, Mintlify, or other external docs stacks are better treated as downstream integrations or separate template repositories unless they need core CLI changes.

### Minimal fallback

Without a custom template, every page is rendered as:

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

Replace `{key}` tokens in your HTML shell:

| Placeholder               | Type         | Description                                                                                                |
| ------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------- |
| `{page_title}`            | escaped text | Page title (frontmatter `name` or document H1).                                                            |
| `{page_content}`          | raw HTML     | Rendered page body. For index pages: `<ul>…</ul>` of all page links. For articles: full rendered markdown. |
| `{page_kind}`             | text string  | `"index"` or `"article"`. Use in JS or CSS selectors.                                                      |
| `{body_class}`            | text string  | CSS classes for the `<body>` element. `wiki-index` for index, `wiki-page template-{slug}` for articles.    |
| `{base_url}`              | text string  | URL prefix from config (e.g. `/wiki`).                                                                     |
| `{url_style}`             | text string  | `"dir"` or `"file"`.                                                                                       |
| `{inline_css}`            | raw CSS      | Wiki CLI's bundled Wikipedia-style CSS.                                                                    |
| `{logo_svg}`              | raw SVG      | Wikipedia-style globe logo.                                                                                |
| `{all_pages_json}`        | JSON string  | Array of `{slug, title}` for all pages.                                                                    |
| `{current_slug_json}`     | JSON string  | Current page slug as a JSON string literal.                                                                |
| `{template_label}`        | raw HTML     | Typed template label (e.g. `<div>Template: Person.html</div>`).                                            |
| `{template_class}`        | text string  | CSS-safe slug of the template name.                                                                        |
| `{infobox_html}`          | raw HTML     | Typed frontmatter property table (empty for index).                                                        |
| `{toc_html}`              | raw HTML     | Table of contents `<div>` with heading links (empty if no headings).                                       |
| `{backlinks_html}`        | raw HTML     | Backlinks section (empty if none).                                                                         |
| `{categories_html}`       | raw HTML     | Category links `<div>` (empty if none).                                                                    |
| `{sidebar_contents_html}` | raw HTML     | Extra sidebar links from typed properties.                                                                 |
| `{source_markdown}`       | escaped text | Raw markdown source for the "view source" tab.                                                             |
| `{metadata_tool_html}`    | raw HTML     | Sidebar "View metadata" link `<li>` (empty if no frontmatter).                                             |
| `{metadata_tab_html}`     | raw HTML     | Tab bar "Metadata (JSON)" `<li>` (empty if no frontmatter).                                                |
| `{metadata_pane_html}`    | raw HTML     | Full metadata display pane `<div>` (empty if no frontmatter).                                              |

Unknown `{placeholders}` are left untouched in the output. This lets you use literal braces in JavaScript or CSS without escaping.

### Built-in CSS classes and IDs

The wiki builder generates these selectors in the rendered page content:

| Selector                    | Where                                                   |
| --------------------------- | ------------------------------------------------------- |
| `#firstHeading`             | The `<h1>` with the page title (in article body).       |
| `#siteSub`                  | Subtitle line under the heading.                        |
| `article`                   | Wrapper around the rendered markdown body.              |
| `.toc` / `#toc`             | Table of contents container.                            |
| `#catlinks` / `.catlinks`   | Category links box.                                     |
| `.backlinks` / `#backlinks` | Backlinks section.                                      |
| `.catlinks-label`           | Categories heading label.                               |
| `.catlinks-list`            | Categories `<ul>`.                                      |
| `.infobox`                  | Typed frontmatter property table.                       |
| `.page-meta`                | Infobox class (used for styling).                       |
| `.template-SLUG`            | Per-template class on infobox (e.g. `template-person`). |
| `toclevel-N` / `lN`         | TOC list item classes for heading level N.              |
| `.wikilink`                 | Internal wiki page links.                               |

### JavaScript hooks

The bundled seed template (`index.html` created by `wiki init`) provides:

| Function                       | Purpose                                              |
| ------------------------------ | ---------------------------------------------------- |
| `switchTab(viewName)`          | Switch between read / talk / source / metadata tabs. |
| `loadTalkNotes()`              | Load per-page local-storage notes.                   |
| `saveTalkNotes()`              | Save per-page notes to localStorage.                 |
| `clearTalkNotes()`             | Clear per-page notes.                                |
| `copySourceCode()`             | Copy markdown source to clipboard.                   |
| `toggleToc()`                  | Show/hide table of contents.                         |
| `goToRandomArticle()`          | Navigate to a random page.                           |
| `triggerSearch()`              | Execute search and navigate to first match.          |
| `onSearchInput(e)`             | Live search suggestions.                             |
| `handleSearchKey(e)`           | Keyboard navigation for search suggestions.          |
| `navigateSearch(slug)`         | Navigate to a search result.                         |
| `applyCategoryFilterFromUrl()` | Filter index page by `?category=` URL parameter.     |

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
