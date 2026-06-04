---
type: TechArticle
name: wiki serve
description: Local HTTP server for live HTML preview.
---

# `wiki serve`

Start a development server that renders vault pages on demand (same engine as [Wiki_Subcommand_build](Wiki_Subcommand_build.md), without writing files).

## Usage

```bash
wiki serve
wiki serve --host 0.0.0.0 --port 3000
wiki serve --watch
wiki serve --base-url /my-wiki --style dir
python -m wiki serve --watch
```

## Options

| Flag         | Default         | Description                                                 |
| ------------ | --------------- | ----------------------------------------------------------- |
| `--host`     | `127.0.0.1`     | Bind address                                                |
| `--port`     | `8080`          | Port                                                        |
| `--base-url` | from config     | Page URL prefix                                             |
| `--style`    | from `urlStyle` | `dir` or `file`                                             |
| `--watch`    | off             | Rebuild graph, SPARQL blocks, and reload browser on changes |

Default URL with config `baseUrl: /wiki`: `http://127.0.0.1:8080/wiki/`.

## Custom HTML shell

The same `html_template` from [Wiki_Configuration](Wiki_Configuration.md) applies to the dev server.
See [HTML_Template](HTML_Template.md) for the placeholder reference.

## Related

- [Wiki_Subcommand_build](Wiki_Subcommand_build.md)
- [Graph_Cache](Graph_Cache.md)
- [HTML_Template](HTML_Template.md)
