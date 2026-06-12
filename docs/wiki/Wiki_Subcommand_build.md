---
type: TechArticle
headline: wiki build
description: Generate a static HTML site from the wiki.
---

# `wiki build`

Compile markdown and data files into static HTML with wikilinks, backlinks, table of contents, and typed templates/infoboxes. Pages with frontmatter embed all metadata format views so the chip picker works without JavaScript.

## Usage

```bash
wiki build
wiki build --output-dir _site --site-base-url /wiki -v
wiki build --site-url-style file
wiki build --site-base-url ''
wiki build --render --reload
wiki build --render --cache
wiki build --no-check
```

## Options

| Flag               | Default     | Description                                                             |
| ------------------ | ----------- | ----------------------------------------------------------------------- |
| `--output-dir`     | `_site`     | Site root on disk                                                       |
| `--site-base-url`  | from config | Override `site.base_url` (`/wiki`, `/my-wiki`, or `''`)                 |
| `--site-url-style` | from config | Override `site.url_style`: `dir` or `file`                              |
| `--render`         | off         | Run [Wiki Subcommand render](Wiki_Subcommand_render.md) before building |
| `--reload`         | off         | Rebuild graph when using `--render`                                     |
| `--cache`          | off         | Persist a warm graph under `.wiki/cache/` when using `--render`         |
| `--no-check`       | off         | Skip pre-build `lint` then `check` preflight                            |
| `-v`, `--verbose`  | off         | List output paths                                                       |

## Output layout

With `site.base_url: /wiki` and `site.url_style: dir`:

```
_site/wiki/Alice/index.html  →  /wiki/Alice/
```

Assets from `wiki.assets` copy under the same prefix. See [Wiki Configuration](Wiki_Configuration.md).

## Metadata view

Each built page embeds compacted JSON-LD plus Turtle, N3, RDF/XML, N-Triples, TriG, and N-Quads. JSON-LD is selected by default; the chip row stays usable without JavaScript.

## Wiki page layout

If your [Wiki Configuration](Wiki_Configuration.md#page-layout) sets `site.layout`, every page is rendered through that file unless `wazoo:layout` overrides it. The builder passes page content and metadata as `{placeholder}` tokens.

If the configured template file is missing, the fallback shell is used silently.

## Checks and collisions

By default, convention (`wiki lint`) then integrity (`wiki check`) preflight must pass before the output directory is wiped and rebuilt. Output path collisions abort the build with errors.

## Related

- [Deploying to GitHub Pages](Deploying_to_GitHub_Pages.md)
- [Wiki Subcommand serve](Wiki_Subcommand_serve.md)
- [Wiki Configuration](Wiki_Configuration.md#page-layout)
