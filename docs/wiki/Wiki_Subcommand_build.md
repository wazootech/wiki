---
type: TechArticle
name: wiki build
description: Generate a static HTML site from the vault.
---

# `wiki build`

Compile markdown and data files into static HTML with wikilinks, backlinks, table of contents, and typed templates/infoboxes.

## Usage

```bash
wiki build
wiki build --output-dir _site --base-url /wiki -v
wiki build --url-style file
wiki build --base-url ''
wiki build --render --reload
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
| `--no-check`      | off         | Skip pre-build [Wiki_Subcommand_check](Wiki_Subcommand_check.md)        |
| `-v`, `--verbose` | off         | List output paths                                                       |

## Output layout

With `baseUrl: /wiki` and `urlStyle: dir`:

```
_site/wiki/Alice/index.html  →  /wiki/Alice/
```

Assets from `assetDirs` copy under the same prefix. See [Wiki_Configuration](Wiki_Configuration.md).

## Checks and collisions

By default, checks must pass before the output directory is wiped and rebuilt. Output path collisions abort the build with errors.

## Related

- [Deploying_to_GitHub_Pages](Deploying_to_GitHub_Pages.md)
- [Wiki_Subcommand_serve](Wiki_Subcommand_serve.md)
