---
type: TechArticle
name: HTML template reference
description: Placeholders, CSS classes, IDs, and JS hooks for custom HTML shells.
---

# HTML template reference

When `html_template` is set in [Wiki_Configuration](Wiki_Configuration.md), the CLI uses your HTML file
as the document shell instead of the built-in minimal fallback.

## Template strategy

The current first-class template contract in this repository is the optional `index.html` / `html_template` shell.

- The Wiki CLI owns the semantic markdown-to-HTML pipeline and placeholder contract.
- This repository treats custom HTML shells as the primary built-in extension point for presentation.
- Framework-specific sites such as Next.js, Mintlify, or other external docs stacks are better treated as downstream integrations or separate template repositories unless they need core CLI changes.

## Minimal fallback

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

## Placeholders

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

## Built-in CSS classes and IDs

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

## JavaScript hooks

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

## Related

- [Wiki_Configuration](Wiki_Configuration.md) — `html_template` config key.
- [Wiki_Subcommand_build](Wiki_Subcommand_build.md) — building with custom templates.
- [Wiki_Subcommand_init](Wiki_Subcommand_init.md) — seeding a custom template.
