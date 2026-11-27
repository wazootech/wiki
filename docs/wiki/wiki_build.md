---
type: TechArticle
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
wiki build --public --output-dir _public
```

## Options

| Flag               | Default     | Description                                                     |
| ------------------ | ----------- | --------------------------------------------------------------- |
| `--output-dir`     | `_site`     | Site root on disk                                               |
| `--site-base-url`  | from config | Override `site.base_url` (`/wiki`, `/my-wiki`, or `''`)         |
| `--site-url-style` | from config | Override `site.url_style`: `dir` or `file`                      |
| `--render`         | off         | Run [wiki render](wiki_render.md) before building               |
| `--reload`         | off         | Rebuild graph when using `--render`                             |
| `--cache`          | off         | Persist a warm graph under `.wiki/cache/` when using `--render` |
| `--no-check`       | off         | Skip pre-build `lint` then `check` preflight                    |
| `--public`         | off         | Build only [public pages](#public-builds)                       |
| `-v`, `--verbose`  | off         | List output paths                                               |

## Output layout

With `site.base_url: /wiki` and `site.url_style: dir`:

```
_site/wiki/Alice/index.html  →  /wiki/Alice/
```

Assets from `wiki.assets` copy under the same prefix. See [Wiki Configuration](Wiki_Configuration.md).

## Metadata view

Each built page embeds compacted JSON-LD plus Turtle, N3, N-Triples, TriG, and N-Quads. JSON-LD is selected by default; the chip row stays usable without JavaScript. RDF/XML output is deferred from the Deno/TypeScript cutover and is not offered in the metadata panel.

## Wiki page layout

If your [Wiki Configuration](Wiki_Configuration.md#page-layout) sets `site.layout`, every page is rendered through that page layout unless `wazoo:layout` overrides it. The builder substitutes layout slots (see [Layout slots](Wiki_Configuration.md#layout-slots)).

If the configured page layout file is missing, the packaged `index.html` fallback is used silently.

## Checks and collisions

By default, convention (`wiki lint`) then integrity (`wiki check`) preflight must pass before the output directory is wiped and rebuilt. Output path collisions abort the build with errors.

Wiki page bodies are rendered without raw HTML passthrough; inline HTML tags in markdown are not emitted as live markup in built pages.

`--output-dir` must point at a disposable directory that does not overlap the wiki config root, input directories, asset directories, or the page layout folder. The build refuses to delete paths that would remove source or config files.

## Public builds

Pages are private unless their frontmatter publishes them:

```yaml
wazoo:visibility: public
```

`wiki build --public` writes only those pages, and its generated index lists only them. A plain `wiki build` still writes every page. Build the two into different output directories, and serve the full one behind [wiki auth](wiki_auth.md).

The public build copies no assets, and it fails, writing nothing, when a public page:

- links to anything that is not a public page, including a private page's full IRI or any asset;
- contains a query block, whose saved results may come from private pages.

It also fails when `wazoo:visibility` is neither `public` nor `private`.

It cannot judge prose: private facts written on a public page are published. A custom page layout is published as written, and `--public` does not apply to theme builds made through the Deno API.

## Related

- [Deploying to GitHub Pages](Deploying_to_GitHub_Pages.md)
- [wiki serve](wiki_serve.md)
- [Wiki Configuration](Wiki_Configuration.md#page-layout)
