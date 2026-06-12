## ﻿--- type: TechArticle headline: Wiki configuration description: Reference for wiki.yaml, wiki.yml, and wiki.json (Config).

# Wiki configuration

The CLI loads **Config** from `wiki.yaml`, `wiki.yml`, or `wiki.json` in the working directory (or from `-c path`).

The in-memory **Config** model uses the same nested blocks as the file (`wiki`, `graph`, `site`, `link`, `check`, `lint`, `fmt`, `sparql_service`). There is no separate flat runtime shape. `Config.load()` validates the file, injects `config_root` (the directory containing the config file), and resolves relative paths under `wiki` and `site`. Library and test code can construct configs with `Config(wiki={...}, config_root=path)` or `Config.for_root(path, wiki={...})`.

Config files are validated strictly through a Pydantic schema (`extra='forbid'` on every block). Unknown keys, removed aliases, wrong nested keys under `check`, `lint`, or `sparql_service`, invalid syntax, or a non-mapping top level all fail immediately instead of being ignored.

## Config semantics

Three audit lanes map to three commands:

| Lane       | Command      | YAML block | Purpose                                                                                                                                                      |
| ---------- | ------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Integrity  | `wiki check` | `check:`   | SHACL, route safety, collisions, layout frontmatter                                                                                                          |
| Convention | `wiki lint`  | `lint:`    | `broken_links`, `filename_pattern`, `headings`, `heading_levels`, `duplicate_headings`, `thematic_breaks`, `link_style` (plus `wiki.filename_pattern` regex) |
| Formatting | `wiki fmt`   | `fmt:`     | Mechanical markdown (mdformat options; inline mapping or TOML path)                                                                                          |

### Rule placement

Mechanical markdown (lists, tables, ATX syntax, line endings) belongs under top-level **`fmt:`** and **`wiki fmt`**. You may use an inline mapping in `wiki.yaml`, a relative path to a TOML file, or fall back to `.mdformat.toml` at the config root or above the page file. Wiki policy and link conventions belong under **`lint:`**. SHACL, routes, and layout keys belong under **`check:`** — never under `lint:`. See [Style Guide](Style_Guide.md) for the full matrix.

- **`wiki.filename_pattern`** is the regex string. **`lint.filename_pattern`** is the severity (`error`, `warning`, or `off`).
- Putting a regex under `check.filename_pattern` fails at load with a hint.
- Legacy combined `check:` keys (`filename_pattern`, `headings`) are rejected — move them to `lint:`.

Relative **`--wiki-inputs`** paths on the CLI resolve against the config file directory (same as paths in yaml), not the shell cwd.

## Top-level blocks

| Block             | Purpose                                                     |
| ----------------- | ----------------------------------------------------------- |
| `wiki:`           | Content paths, indexing excludes, filename regex            |
| `graph:`          | RDF document URIs, namespace prefixes, SPARQL body literals |
| `site:`           | Built/served HTML chrome and URL routing                    |
| `link:`           | `wiki link` authoring format and rename repair map          |
| `check:`          | Integrity severities (`wiki check`)                         |
| `lint:`           | Convention severities (`wiki lint`)                         |
| `fmt:`            | mdformat options (`wiki fmt`)                               |
| `sparql_service:` | Optional SPARQL HTTP endpoint on `wiki serve`               |

## Example

```yaml
wiki:
  inputs:
    - wiki
  assets:
    - assets
  filename_pattern: "[A-Za-z0-9_()-]+\\.md"
  exclude:
    - assets/private/**

graph:
  content_predicate: schema:articleBody
  context:
    schema: https://schema.org/
    wiki: https://example.org/wiki/
    foaf: http://xmlns.com/foaf/0.1/

site:
  manifest:
    name: Example Wiki
  layout: layouts/default.html
  base_url: /wiki
  url_style: dir

link:
  style: markdown
  renames:
    Old_Page_Name: New_Page_Name

lint:
  broken_links: warning
  filename_pattern: warning
  headings: off

fmt:
  wrap: "no"
  end_of_line: lf
  extensions: [gfm, frontmatter, wikilink]
```

JSON configs may use `graph.context` or `graph.@context` for prefix maps (JSON-LD compatible).

## Wiki (`wiki:`)

| Key                     | Default                            | Purpose                                                                                    |
| ----------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------ |
| `wiki.inputs`           | `["wiki"]`                         | Markdown and data files to load (relative to config file directory)                        |
| `wiki.assets`           | `["assets"]` if that folder exists | Static files copied on `wiki build`                                                        |
| `wiki.exclude`          | `[]`                               | Glob patterns (POSIX paths relative to config root) skipped when indexing                  |
| `wiki.filename_pattern` | —                                  | Full-filename regex for markdown files (see [Filename conventions](#filename-conventions)) |

Page URLs come from paths under `wiki.inputs`: `wiki/Alice.md` → `/wiki/Alice/` with default `site.base_url` and `site.url_style: dir`. `index.md` in a folder owns that folder’s route (for example `wiki/index.md` → `/wiki/`).

## Graph (`graph:`)

RDF and document URI settings for graph build, `wiki query`, microdata, and SHACL.

| Key                                | Default           | Purpose                                                                                                                                                                                                                         |
| ---------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `graph.base_iri`                   | —                 | Optional override for auto-generated document IRIs; when unset, uses `graph.context.wiki`, then `https://wiki.example.org/`                                                                                                     |
| `graph.context` / `graph.@context` | built-in prefixes | Prefix → namespace URI map for CURIEs in frontmatter and microdata                                                                                                                                                              |
| `graph.content_predicate`          | —                 | When set (for example `schema:articleBody`), markdown body text is added as a literal on each document node for full-text SPARQL                                                                                                |
| `graph.include_file_extension`     | `false`           | Include file extension in generated URIs when true                                                                                                                                                                              |
| `graph.implicit_types`             | `[]`              | CURIE list applied when a document has no `type` / `@type`, or merged per policy when it does                                                                                                                                   |
| `graph.implicit_types_policy`      | `fallback`        | `fallback` — use `implicit_types` only when frontmatter has no type; `append` — union frontmatter types with `implicit_types` (deduped by resolved URI). SHACL shape documents (`sh:NodeShape`, `sh:PropertyShape`) skip append |

## Site (`site:`)

Default page layout, routing, and Web App Manifest metadata for `wiki build` / `wiki serve`:

| Key              | Default | Purpose                                                        |
| ---------------- | ------- | -------------------------------------------------------------- |
| `site.layout`    | —       | Path (relative to config) to the site default page layout file |
| `site.base_url`  | `/wiki` | URL prefix for built/served pages (`""` for site root)         |
| `site.url_style` | `dir`   | `dir` → `slug/index.html`; `file` → `slug.html`                |

### Site manifest (`site.manifest:`)

Branding and PWA metadata use the [Web App Manifest](https://www.w3.org/TR/appmanifest/) field names. Values feed layout placeholders (`{site_title}`, `{theme_color}`, `{logo_svg}`), `{manifest_json}`, `{manifest_url}`, and the built/served `manifest.webmanifest` file at `{base_url}/manifest.webmanifest`.

| Key                              | Default    | Purpose                                                                                                                                                                           |
| -------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `site.manifest.name`             | `Wiki CLI` | Site name in layout chrome; first character drives the **default** `{logo_svg}` globe glyph when the layout still uses that placeholder; always included in the manifest document |
| `site.manifest.short_name`       | —          | Optional short label for install surfaces                                                                                                                                         |
| `site.manifest.description`      | —          | Optional site description                                                                                                                                                         |
| `site.manifest.theme_color`      | —          | Optional `#RGB` / `#RRGGBB` hex for the **default** `{logo_svg}` globe gradient and `theme-color` / `msapplication-TileColor` meta tags (default `#3b82f6`)                       |
| `site.manifest.background_color` | —          | Optional `#RGB` / `#RRGGBB` hex background color for the manifest                                                                                                                 |
| `site.manifest.start_url`        | —          | Manifest `start_url`; defaults to `{site.base_url}/` (or `/` when `base_url` is empty)                                                                                            |
| `site.manifest.display`          | —          | `fullscreen`, `standalone`, `minimal-ui`, or `browser`                                                                                                                            |
| `site.manifest.icons`            | —          | PWA install icons; `src` should be an assets path (for example `assets/icon-192.png`); relative values are prefixed with `site.base_url` in `manifest.webmanifest`                |

## Link (`link:`)

Settings for the `wiki link` command family (separate from `lint.link_style` severity):

| Key            | Default    | Purpose                                                       |
| -------------- | ---------- | ------------------------------------------------------------- |
| `link.style`   | `markdown` | Format `wiki link --apply` inserts (`markdown` or `wikilink`) |
| `link.renames` | `{}`       | Old slug → new route map for `wiki link --fix-broken`         |

## Serve API

| Key                      | Default       | Purpose                                               |
| ------------------------ | ------------- | ----------------------------------------------------- |
| `sparql_service.enabled` | `false`       | Enable or disable the SPARQL endpoint on `wiki serve` |
| `sparql_service.path`    | `/api/sparql` | Reserved route for the SPARQL endpoint                |

Example:

```yaml
sparql_service:
  enabled: true
  path: /api/sparql
```

The endpoint reuses the same SPARQL engine as `wiki query`. It is read-only and intended for local or development-oriented use through `wiki serve`. HTTP request forms, supported query types, and `Accept` negotiation are documented in [Wiki Subcommand serve](Wiki_Subcommand_serve.md#sparql-endpoint).

It is **opt-in by default** because enabling it exposes raw graph-query access in addition to HTML preview.

`sparql_service.path` must not collide with the effective `site.base_url` page routes or the watch endpoint. Invalid values such as `/`, `/wiki`, `/wiki/foo`, or `/wiki/__watch` are rejected when `wiki serve` starts.

## Page layout

When `site.layout` is set, the CLI renders every page through that HTML file using `{placeholder}` tokens. Per-page overrides use `wazoo:layout` in frontmatter; see [Wiki Page Layouts](Wiki_Page_Layouts.md).

### Layout strategy

The first-class presentation contract in this repository is page layout files under `layouts/` (for example `layouts/default.html` referenced from `site.layout`).

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

| Placeholder               | Type         | Description                                                                                                                                                                                                                             |
| ------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{page_title}`            | escaped text | Page title (frontmatter `name` or document H1).                                                                                                                                                                                         |
| `{page_content}`          | raw HTML     | Rendered page body. For index pages: `<ul>…</ul>` of all page links. For articles: full rendered markdown.                                                                                                                              |
| `{page_kind}`             | text string  | `"index"` or `"article"`. Use in JS or CSS selectors.                                                                                                                                                                                   |
| `{body_class}`            | text string  | CSS classes for the `<body>` element. `wiki-index` for index, `wiki-page layout-{slug}` for articles.                                                                                                                                   |
| `{base_url}`              | text string  | URL prefix from config (e.g. `/wiki`).                                                                                                                                                                                                  |
| `{url_style}`             | text string  | `"dir"` or `"file"`.                                                                                                                                                                                                                    |
| `{site_title}`            | escaped text | Site name from `site.manifest.name` (sidebar label, `<title>` suffix, search placeholder).                                                                                                                                              |
| `{theme_color}`           | text string  | Resolved hex color from `site.manifest.theme_color`, or `#3b82f6` when unset (`theme-color` and TileColor meta tags).                                                                                                                   |
| `{manifest_json}`         | raw JSON     | Canonical Web App Manifest document derived from `site.manifest` (for inline `<script type="application/manifest+json">` or debugging).                                                                                                 |
| `{manifest_url}`          | text string  | Public URL of `manifest.webmanifest` (`{base_url}/manifest.webmanifest`).                                                                                                                                                               |
| `{inline_css}`            | raw CSS      | Bundled default page CSS from `layout_default.css.j2` plus runtime metadata-format and Pygments rules. Not configurable in `wiki.yaml`; customize presentation via layout HTML or linked assets (see [Custom CSS](#custom-css)).        |
| `{logo_svg}`              | raw SVG      | Default built-in Wikipedia-style globe logo; center letter from `site.manifest.name`; globe gradient from `site.manifest.theme_color` when set. Override by editing the layout (see [Custom logos and icons](#custom-logos-and-icons)). |
| `{all_pages_json}`        | JSON string  | Array of `{slug, title}` for all pages.                                                                                                                                                                                                 |
| `{current_slug_json}`     | JSON string  | Current page slug as a JSON string literal.                                                                                                                                                                                             |
| `{layout_label}`          | raw HTML     | Layout label when `wazoo:layout` is set (empty when using the site default shell).                                                                                                                                                      |
| `{type_label}`            | raw HTML     | Schema type badge from frontmatter `type` / `@type` (empty when unset). Read view only.                                                                                                                                                 |
| `{layout_class}`          | text string  | CSS-safe slug derived from the layout file stem (`default` when unset).                                                                                                                                                                 |
| `{infobox_html}`          | raw HTML     | Typed frontmatter property table (empty for index).                                                                                                                                                                                     |
| `{toc_html}`              | raw HTML     | Table of contents `<div>` with heading links (empty if no headings).                                                                                                                                                                    |
| `{backlinks_html}`        | raw HTML     | Backlinks section (empty if none).                                                                                                                                                                                                      |
| `{categories_html}`       | raw HTML     | Category links `<div>` (empty if none).                                                                                                                                                                                                 |
| `{sidebar_contents_html}` | raw HTML     | Extra sidebar links from typed properties.                                                                                                                                                                                              |
| `{source_markdown}`       | escaped text | Raw markdown source for the "view source" tab.                                                                                                                                                                                          |
| `{metadata_tool_html}`    | raw HTML     | Sidebar "View metadata" link `<li>` (empty if no frontmatter).                                                                                                                                                                          |
| `{metadata_tab_html}`     | raw HTML     | Tab bar "Metadata" `<li>` (empty if no frontmatter).                                                                                                                                                                                    |
| `{metadata_pane_html}`    | raw HTML     | Full metadata display pane `<div>` (empty if no frontmatter).                                                                                                                                                                           |

Unknown `{placeholders}` are left untouched in the output. This lets you use literal braces in JavaScript or CSS without escaping.

### Custom CSS

The bundled stylesheet injected as `{inline_css}` covers the default Wikipedia-style shell (navigation, tabs, infobox, TOC, code blocks). It is not a `wiki.yaml` key. To change how pages look:

1. **Edit the layout HTML** — `site.layout` (usually `layouts/default.html`) is the primary extension point. Add or override rules in a `<style>` block, change classes on structural elements, or replace `{inline_css}` with your own CSS (you lose the bundled defaults unless you copy them).
1. **Link wiki assets** — put `.css` files under a directory listed in `wiki.assets`, then reference them from the layout with a normal `<link>` tag, for example `<link rel="stylesheet" href="{base_url}/assets/site.css">`. Built assets are served at `{base_url}/assets/…` during `wiki serve` and copied into the build output.

`site.manifest.theme_color` only affects the default `{logo_svg}` globe gradient and `theme-color` / TileColor meta tags; accent colors inside `{inline_css}` remain the bundled defaults unless you override them in the layout or a linked stylesheet.

### Custom logos and icons

The default layout uses `{logo_svg}` inside `#p-logo`. When you do not customize the layout, Wiki CLI injects a built-in globe SVG: the center glyph is the first character of resolved `site.manifest.name`, and the gradient comes from `site.manifest.theme_color` (fallback `#3b82f6`). There is no `site.logo` or `site.favicon` yaml key — customize branding through `wiki.assets` and `site.layout`, the same pattern as [Custom CSS](#custom-css).

**Custom sidebar logo**

1. Enable `wiki.assets` (uncomment or add an `assets:` directory in `wiki.yaml`).
1. Place a file under assets, for example `assets/logo.svg` or `assets/logo.png`.
1. Edit `site.layout` and replace `{logo_svg}` with an asset reference:

```html
<img src="{base_url}/assets/logo.svg" alt="" width="80" height="80">
```

You can also embed inline SVG directly in the layout file (no asset copy).

**Favicons and touch icons**

Put `favicon.ico`, `favicon.svg`, `apple-touch-icon.png`, and similar files under `assets/`. Add standard `<link rel="icon">` and `<link rel="apple-touch-icon">` tags in the layout `<head>` pointing at `{base_url}/assets/…`. Favicons are not configurable through dedicated yaml keys.

**PWA / manifest icons**

Declare install icons under `site.manifest.icons` with `src` paths under your assets directory:

```yaml
site:
  manifest:
    name: Wiki CLI
    icons:
      - src: assets/icon-192.png
        sizes: "192x192"
        type: image/png
      - src: assets/icon-512.png
        sizes: "512x512"
        type: image/png
```

`{manifest_url}` and the built `manifest.webmanifest` file pick these up automatically. The default layout already includes `<link rel="manifest" href="{manifest_url}">`.

Built assets are served at `{base_url}/assets/…` during `wiki serve` and copied into the build output.

See also [Wiki Page Layouts](Wiki_Page_Layouts.md) for the layout file contract and placeholder list.

The metadata pane uses the same RDF serialization path as `wiki export` (compacted JSON-LD, Turtle, N3, RDF/XML, N-Triples, TriG, N-Quads). A compact **Format** chip row switches views without JavaScript. In `wiki serve`, set the initial chip with `?metadata_format=FORMAT` (for example `turtle` or `json-ld`). In `wiki build`, all format views are embedded in the page HTML so the picker works offline.

### Built-in CSS classes and IDs

The wiki builder generates these selectors in the rendered page content:

| Selector                    | Where                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------- |
| `#article-top`              | Read-view `<article>` wrapper around rendered markdown body.                                      |
| `#firstHeading`             | Read-view page title `<h1>`; also Talk / Source / Metadata pane headings. TOC “(Top)” links here. |
| `#siteSub`                  | Subtitle under Talk / Source / Metadata pane headings.                                            |
| `article`                   | Wrapper around the rendered markdown body (`#article-top`).                                       |
| `.layout-label`             | Uppercase type or custom-layout badge in read view.                                               |
| `.toc` / `#toc`             | Table of contents container.                                                                      |
| `#catlinks` / `.catlinks`   | Category links box.                                                                               |
| `.backlinks` / `#backlinks` | Backlinks section.                                                                                |
| `.catlinks-label`           | Categories heading label.                                                                         |
| `.catlinks-list`            | Categories `<ul>`.                                                                                |
| `.infobox`                  | Typed frontmatter property table.                                                                 |
| `.page-meta`                | Infobox class (used for styling).                                                                 |
| `.template-SLUG`            | Per-template class on infobox (e.g. `template-person`).                                           |
| `toclevel-N` / `lN`         | TOC list item classes for heading level N.                                                        |
| `.wikilink`                 | Internal wiki page links.                                                                         |
| `pre[data-copy]`            | Block code with raw source for clipboard copy.                                                    |
| `.code-block`               | Wrapper injected around copyable pre blocks.                                                      |
| `.code-copy-btn`            | Copy button shown on code-block hover/focus.                                                      |

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

CLI flags on `wiki build` and `wiki serve` can override `site.base_url` and `site.url_style` for a single run.

## Filename conventions

The CLI does not hard-code kebab-case. Projects choose a convention with **`wiki.filename_pattern`**, matched against the **full filename** (including `.md`) on markdown files only.

**Wikipedia-style (recommended):** preserved capitalization and underscores — `Gregory_Davidson.md`, `Pokemon_Diamond_(copy_1).md`, `LLM_Wiki_CLI.md`. Use a pattern such as:

```yaml
wiki:
  filename_pattern: "[A-Za-z0-9_()-]+\\.md"
```

**Kebab-case (optional):** if you prefer `gregory-house.md`, set an explicit pattern (for example `[a-z0-9-]+\\.md`) and enforce it via `lint.filename_pattern`. Wikipedia-style and kebab-case should not be mixed in one wiki.

Page routes keep the casing from the filename; GitHub Pages URLs are case-sensitive.

`wiki link --fix-broken` preserves the existing link kind in each file; only `--apply` uses `link.style`.

When `link.style` is `markdown`, `lint.link_style` (default `warning`) flags Obsidian wikilinks in body prose. Set `lint.link_style: off` to allow wikilinks while keeping markdown as the apply format, or set `link.style: wikilink` for an Obsidian-style wiki.

## Formatting (`fmt`)

Top-level **`fmt`** configures `wiki fmt` (mdformat). Two shapes are allowed — not both:

| Shape          | Example               | When to use                                 |
| -------------- | --------------------- | ------------------------------------------- |
| Inline mapping | `fmt: { wrap: "no" }` | Default; what `wiki init` writes            |
| Relative path  | `fmt: custom.toml`    | Share one TOML file or keep fmt out of yaml |

Omit `fmt` entirely to use fallbacks: `config_root/.mdformat.toml`, then upward search from each markdown file, then **wiki-cli fmt defaults** (`wrap: "no"`, `end_of_line: lf`, extensions `gfm`, `frontmatter`, `wikilink`). See [Wiki Subcommand fmt](Wiki_Subcommand_fmt.md) for the full resolution order.

Invalid inline keys or values fail when the config loads. Invalid TOML syntax fails when `wiki fmt` reads the file.

In library code, loaded `Config.fmt` is a `FmtConfig` with `options` (inline mapping) or `toml` (resolved path under `config_root`); yaml shapes above are unchanged.

## Integrity checks (`check`)

Under `check`, each rule is `error`, `warning`, or `off`:

| Rule key              | Default | What it audits                                                      |
| --------------------- | ------- | ------------------------------------------------------------------- |
| `missing_layout_file` | `error` | `wazoo:layout` paths that do not resolve to a readable `.html` file |

Build-safety rules (unsafe URL characters, spaces in routes) and output URL collision detection always apply regardless of `check` settings.

## Convention audits (`lint`)

Under `lint`, each rule is `error`, `warning`, or `off`:

| Rule key           | Default   | What it audits                                                                                                 |
| ------------------ | --------- | -------------------------------------------------------------------------------------------------------------- |
| `broken_links`     | `warning` | Wikilinks, internal markdown links, heading fragments, assets, `wiki:` CURIEs                                  |
| `filename_pattern` | `warning` | Full filename vs `wiki.filename_pattern` regex                                                                 |
| `headings`         | `off`     | ATX `#` headings only (no Setext underlines), sentence-case H2+, H1 title case conventional, numbered headings |
| `thematic_breaks`  | `off`     | Horizontal rules (`---`, `***`, `___`) in body prose                                                           |
| `link_style`       | `warning` | Wikilinks in body prose when `link.style` is `markdown`                                                        |

## This repository

`docs/wiki.yaml` is the dogfood wiki config: the same structure and default severities as `wiki init` (`wiki.yaml.j2`), with this repository’s GitHub Pages URLs and `graph.content_predicate: schema:articleBody` for SPARQL full-text.

## Related

- [Wiki CLI](Wiki_CLI.md#global-options) — `-c` and `--wiki-inputs` global options
- [Wiki Subcommand check](Wiki_Subcommand_check.md) — integrity checks
- [Wiki Subcommand lint](Wiki_Subcommand_lint.md) — convention audits
- [Wiki Subcommand query](Wiki_Subcommand_query.md) — ad-hoc SPARQL
- [Wiki Subcommand render](Wiki_Subcommand_render.md) — inline SPARQL tables
- [Wiki Subcommand serve](Wiki_Subcommand_serve.md#sparql-endpoint) — `#serve-api` config block
- [Graph Cache](Graph_Cache.md) — `--cache` and graph reuse
- [Style Guide](Style_Guide.md) — shapes and frontmatter
