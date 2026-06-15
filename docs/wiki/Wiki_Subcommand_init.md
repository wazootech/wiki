---
type: TechArticle
headline: wiki init
description: Scaffold wiki.yaml and starter wiki pages interactively.
---

# `wiki init`

Create a new workspace in the **current directory**: `wiki.yaml`, `README.md`, `layouts/`, and starter files under `wiki/`.

Does not use loaded Config; safe to run before a config exists.

## Usage

```bash
wiki init
wiki init --force
wiki init --git
wiki init --repo wazootech/wiki
wiki init --graph-context-wiki https://example.org/mywiki/ --site-base-url /mywiki
```

## Options

| Flag                             | Description                                                                                                                                                                        |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--force`                        | Overwrite existing `wiki.yaml`, `README.md`, starter `wiki/` files, and `layouts/index.html`                                                                                       |
| `--git`                          | Run `git init` after scaffolding                                                                                                                                                   |
| `--repo`                         | GitHub `owner/repo`; infer `graph.context.wiki` and `site.base_url` for GitHub Pages                                                                                               |
| `--graph-context-wiki`           | Override `graph.context.wiki` (overrides `--repo` inference)                                                                                                                       |
| `--site-base-url`                | Override `site.base_url` (default `/wiki` or inferred from `--repo`)                                                                                                               |
| `--site-url-style`               | Override `site.url_style`: `dir` or `file` (default `dir`)                                                                                                                         |
| `--graph-content-predicate`      | Override `graph.content_predicate` CURIE (e.g. `schema:articleBody`)                                                                                                               |
| `--link-style`                   | Override `link.style`: standard page links (`standard`) or wikilinks (`wikilink`)                                                                                                  |
| `--site-name`                    | First letter used in `assets/logo.svg` only (default name `Wiki CLI` → `W`); does not change copied layout title, sidebar label, or search placeholder; not written to `wiki.yaml` |
| `--wiki-inputs`                  | Override `wiki.inputs` list (can be specified multiple times, default `[wiki]`)                                                                                                    |
| `--graph-base-iri`               | Override `graph.base_iri` URI                                                                                                                                                      |
| `--site-theme-color`             | Logo gradient at init only (e.g. `#3b82f6`; not written to `wiki.yaml`)                                                                                                            |
| `--graph-implicit-types`         | Override `graph.implicit_types` (can be specified multiple times)                                                                                                                  |
| `--graph-implicit-types-policy`  | Override `graph.implicit_types_policy`: `fallback` or `append`                                                                                                                     |
| `--graph-include-file-extension` | Override `graph.include_file_extension` flag (defaults to `--no-graph-include-file-extension`)                                                                                     |

## URL resolution

When `--graph-context-wiki` is not passed, init resolves `graph.context.wiki` in this order:

1. **`--repo`** — GitHub Pages project site: `https://{owner}.github.io/{repo}/` and `site.base_url: /{repo}` (accepts `owner/repo`, HTTPS, or SSH URLs).
1. **Git remote** — If `.git` already exists or `--git` was passed, parse `git remote get-url origin` when it points at GitHub.
1. **Interactive prompt** — **Custom wiki namespace IRI** (default `https://wiki.example.org/`).

`--graph-context-wiki` always wins over `--repo` and remote detection. `--site-base-url` overrides the inferred path from `--repo`.

Document subject IRIs default to `graph.context.wiki`. Set optional `graph.base_iri` in `wiki.yaml` when auto-generated document IRIs must differ from the `wiki:` namespace (see [Wiki Configuration](Wiki_Configuration.md)).

## Prompts

When no flag or git remote supplies `graph.context.wiki`, init prompts once:

1. **Custom wiki namespace IRI** (default `https://wiki.example.org/`) → `wiki:` in `graph.context`

Always includes `schema`, `wiki`, `wazoo`, `foaf`, `dc`, `dcterms`, `sh`, and `xsd` prefixes. The `wazoo` URI is fixed in the scaffold (`https://schema.wazoo.dev/`), like the other built-in prefixes.

## Generated config

New workspaces receive a plain `wiki.yaml` rendered from [`wiki.yaml.j2`](https://github.com/wazootech/wiki/blob/main/src/wiki/templates/wiki.yaml.j2). Jinja variables (such as `graph_context_wiki`, `site_base_url`, `graph_content_predicate`, and `link_style`) map from init CLI flags into nested blocks.

For every key — schema default, whether init writes it, and which command audits it — see [Wiki Configuration → Overview](Wiki_Configuration.md#overview) and the per-block defaults tables in [Wiki Configuration](Wiki_Configuration.md).

## Generated files

- `layouts/shell.html` and `assets/wikipedia.css` — copied when `--site-layout wikipedia` (default); token shell links the stylesheet and injects packaged Vector chrome at `%wiki.body%`. With `--site-layout minimal`, `site.layout` is omitted and the packaged minimal inner body applies inside the default shell.
- `assets/logo.svg` — starter sidebar logo; center glyph is the first letter of `--site-name` (default `Wiki CLI` → `W`); optional `--site-theme-color` sets the gradient. Sidebar label and search placeholder live in the packaged chrome template.
- `README.md` — starter workspace overview and common commands
- `wiki/Person_Shape.md` — starter `sh:NodeShape` for `schema:Person`
- `wiki/Ethan_Davidson.md` — starter `schema:Person` example

By default `wiki init` does **not** create a Git repository. Use `--git` if you want to run `git init` immediately.

## Related

- [Getting Started](Getting_Started.md)
- [Wiki Configuration](Wiki_Configuration.md)
