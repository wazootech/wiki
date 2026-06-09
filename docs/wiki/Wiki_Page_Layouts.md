---
type: TechArticle
headline: Page layouts
description: Wiki page layout files for build and serve output.
---

# Wiki page layouts

Wiki CLI builds each article into HTML using a **page layout** file with `{placeholder}` tokens. Two levels apply:

1. **Site default** — `site.layout` in [Wiki_Configuration](Wiki_Configuration.md) (usually `layouts/default.html`)
1. **Per-page override** — optional `wazoo:layout` frontmatter on a single markdown file

## `site.layout`

Set the path in `wiki.yaml` relative to the directory that contains the config file:

```yaml
site:
  layout: layouts/default.html
```

`wiki init` seeds `layouts/default.html` from the packaged default layout. To customize CSS, edit the layout HTML or link stylesheets from `vault.assets`; see [Wiki_Configuration](Wiki_Configuration.md#custom-css).

## `wazoo:layout`

Override the site default for one page:

```yaml
type: schema:Person
wazoo:layout: layouts/article.html
givenName: Ethan
familyName: Davidson
```

When `wazoo:layout` is omitted, the page uses `site.layout`. Layout files must exist and end in `.html`; `wiki check` reports missing `wazoo:layout` paths as errors.

`wazoo:layout` is ordinary frontmatter: it appears in the RDF graph, infobox, and metadata pane like other properties.

## Placeholders

Layout HTML files use the tokens documented in [Wiki_Configuration](Wiki_Configuration.md#page-layout), including `{layout_class}`, `{layout_label}`, `{infobox_html}`, and `{page_content}`.

## Related

- [Wiki_Subcommand_build](Wiki_Subcommand_build.md)
- [Wiki_Subcommand_serve](Wiki_Subcommand_serve.md)
- [Style_Guide](Style_Guide.md)
