---
type: TechArticle
headline: Page layouts
description: Wiki page layout files for build and serve output.
---

# Wiki page layouts

Wiki CLI builds each article into HTML using a **page layout** Jinja2 template (`.html.j2`). Two levels apply:

1. **Site default** — `site.layout` in [Wiki Configuration](Wiki_Configuration.md) (usually `layouts/default.html.j2`)
1. **Per-page override** — optional `wazoo:layout` frontmatter on a single markdown file

## `site.layout`

Set the path in `wiki.yaml` relative to the directory that contains the config file:

```yaml
site:
  layout: layouts/default.html.j2
```

`wiki init` copies `layouts/default.html.j2` from the packaged default layout. The sidebar logo uses `assets/logo.svg` via `wiki.assets`. To customize CSS, edit the layout HTML or link stylesheets from `wiki.assets`; see [Wiki Configuration](Wiki_Configuration.md#custom-css).

## `wazoo:layout`

Override the site default for one page:

```yaml
type: schema:Person
wazoo:layout: layouts/article.html.j2
givenName: Ethan
familyName: Davidson
```

When `wazoo:layout` is omitted, the page uses `site.layout`. Layout files must exist and end in `.html.j2`; `wiki check` reports missing `wazoo:layout` paths as errors.

`wazoo:layout` is ordinary frontmatter: it appears in the RDF graph, infobox, and metadata pane like other properties.

## Template variables

Layout templates use the variables documented in [Wiki Configuration](Wiki_Configuration.md#page-layout), including `{{ page.layout.class }}`, `{{ page.layout.label }}`, `{{ page.nav.infobox }}`, and `{{ page.content }}`. Custom logos and favicons are layout plus `wiki.assets` overrides; see [Custom logos and icons](Wiki_Configuration.md#custom-logos-and-icons) in Wiki_Configuration.

Layout files are Jinja2 (`.html.j2`). Wiki CLI defines the template **context**; syntax, filters, conditionals, and blocks follow [Jinja](https://jinja.palletsprojects.com/en/stable/templates/).

## Related

- [Wiki Subcommand build](Wiki_Subcommand_build.md)
- [Wiki Subcommand serve](Wiki_Subcommand_serve.md)
- [Style Guide](Style_Guide.md)
