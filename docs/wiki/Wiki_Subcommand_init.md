---
type: TechArticle
label: wiki init
comment: Scaffold wiki.yaml and starter wiki pages interactively.
---

# `wiki init`

Create a new workspace in the **current directory**: `wiki.yaml`, `README.md`, `layouts/`, and starter files under `wiki/`.

Does not use loaded WikiConfig; safe to run before a config exists.

## Usage

```bash
wiki init
wiki init --force
wiki init --git
```

## Options

| Flag      | Description                                         |
| --------- | --------------------------------------------------- |
| `--force` | Overwrite existing `wiki.yaml` or non-empty `wiki/` |
| `--git`   | Run `git init` after scaffolding                    |

## Prompts

1. **Custom base URI prefix** (default `https://wiki.example.org/`) → `wiki_base` and `wiki:` in `context`

Always includes `schema`, `wiki`, `foaf`, `dc`, `dcterms`, `sh`, and `xsd` prefixes.

## Generated config

- `input_dirs: [wiki]`
- `base_url: /wiki`, `url_style: dir`
- `check` rules at `warning` for filename and links
- `page_layout: layouts/default.html` — site default page layout

## Generated files

- `layouts/default.html` — packaged page layout with search, tabs, backlinks, and TOC. Edit to customize the look and feel.
- `README.md` — starter workspace overview and common commands
- `wiki/Person_Shape.md` — starter `sh:NodeShape` for `schema:Person`
- `wiki/Ethan_Davidson.md` — starter `schema:Person` example

By default `wiki init` does **not** create a Git repository. Use `--git` if you want to run `git init` immediately.

## Related

- [Getting_Started](Getting_Started.md)
- [Wiki_Configuration](Wiki_Configuration.md)
