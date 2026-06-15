---
type: TechArticle

headline: Wiki Page Layouts

description: Wiki page layout files for build and serve output.
---

# Wiki Page Layouts

Wiki CLI builds each article into HTML using a **page layout** file. Two levels apply:

1. **Site default** — `site.layout` in [Wiki Configuration](Wiki_Configuration.md) (for example `layouts/shell.html`)

1. **Per-page override** — optional `wazoo:layout` frontmatter on a single markdown file (`.html` only)

## `site.layout`

Set the path in `wiki.yaml` relative to the directory that contains the config file:

```yaml

site:

  layout: layouts/shell.html

```

`wiki init` with `--site-layout wikipedia` (default) copies `layouts/shell.html` and `assets/wikipedia.css` from the packaged bundle. The shell links the stylesheet and injects full Vector chrome at `%wiki.body%`. With `--site-layout minimal`, `site.layout` is omitted and Wiki CLI uses the packaged minimal inner body inside the default shell.

## `wazoo:layout`

Override the site default for one page:

```yaml

type: schema:Person

wazoo:layout: layouts/article.html

givenName: Ethan

familyName: Davidson

```

When `wazoo:layout` is omitted, the page uses `site.layout`. Layout files must exist and end in `.html`. `wiki check` reports missing `wazoo:layout` paths as errors.

`wazoo:layout` is ordinary frontmatter: it appears in the RDF graph, infobox, and metadata pane like other properties.

## Layout tokens

Layout files use `%wiki.*%` token substitution (not Jinja). See [Layout shell tokens](Wiki_Configuration.md#layout-shell-tokens) in Wiki Configuration for the full token table, including `%wiki.page.content%`, `%wiki.nav.infobox%`, and `%wiki.page.layout.class%`.

Custom logos and favicons are shell markup plus `wiki.assets` overrides; see [Custom logos and icons](Wiki_Configuration.md#custom-logos-and-icons) in Wiki_Configuration.

## Related

- [Wiki Subcommand build](Wiki_Subcommand_build.md)

- [Wiki Subcommand serve](Wiki_Subcommand_serve.md)

- [Style Guide](Style_Guide.md)
