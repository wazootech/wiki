---
type: TechArticle
headline: wiki build
description: Generate a static HTML site from the vault.
---

# `wiki build`

Compile markdown and data files into static HTML with wikilinks, backlinks, table of contents, and typed templates/infoboxes.
Pages with frontmatter embed all metadata format views so the chip picker works without JavaScript.

## Usage

```bash
wiki build
wiki build --output-dir _site --base-url /wiki -v
wiki build --url-style file
wiki build --base-url ''
wiki build --render --reload
wiki build --render --cache
wiki build --no-check
```

## Options

| Flag              | Default     | Description                                                             |
| ----------------- | ----------- | ----------------------------------------------------------------------- |
| `--output-dir`    | `_site`     | Site root on disk                                                       |
| `--base-url`      | from config | URL prefix (`/wiki`, `/my-wiki`, or `''`)                               |
| `--url-style`     | from config | `dir` or `file`                                                         |
| `--render`        | off         | Run [Wiki_Subcommand_render](Wiki_Subcommand_render.md) before building |
| `--reload`        | off         | Rebuild graph when using `--render`                                     |
| `--cache`         | off         | Persist a warm graph under `.wiki/cache/` when using `--render`         |
| `--no-check`      | off         | Skip pre-build integrity and lint (`check` + `lint`)                    |
| `-v`, `--verbose` | off         | List output paths                                                       |

## Output layout

With `base_url: /wiki` and `url_style: dir`:

```
_site/wiki/Alice/index.html  →  /wiki/Alice/
```

Assets from `asset_dirs` copy under the same prefix. See [Wiki_Configuration](Wiki_Configuration.md).

## Metadata view

Each built page embeds compacted JSON-LD plus Turtle, N3, RDF/XML, N-Triples, TriG, and N-Quads. JSON-LD is selected by default; the chip row stays usable without JavaScript.

## Wiki page layout

If your [Wiki_Configuration](Wiki_Configuration.md#page-layout) sets `page_layout`, every page is rendered through that file unless `wazoo:layout` overrides it.
The builder passes page content and metadata as `{placeholder}` tokens.

If the configured template file is missing, the fallback shell is used silently.

## Checks and collisions

By default, integrity (`wiki check`) and convention (`wiki lint`) preflight must pass before the output directory is wiped and rebuilt. Output path collisions abort the build with errors.

## Related

- [Deploying_to_GitHub_Pages](Deploying_to_GitHub_Pages.md)
- [Wiki_Subcommand_serve](Wiki_Subcommand_serve.md)
- [Wiki_Configuration](Wiki_Configuration.md#page-layout)
