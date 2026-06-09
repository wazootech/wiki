---
type: TechArticle
headline: wiki init
description: Scaffold wiki.yaml and starter wiki pages interactively.
---

# `wiki init`

Create a new workspace in the **current directory**: `wiki.yaml`, `README.md`, `layouts/`, and starter files under `wiki/`.

Does not use loaded WikiConfig; safe to run before a config exists.

## Usage

```bash
wiki init
wiki init --force
wiki init --git
wiki init --repo wazootech/wiki
wiki init --graph-wiki-base https://example.org/mywiki/ --site-base-url /mywiki
```

## Options

| Flag                  | Description                                                                                    |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| `--force`             | Overwrite existing `wiki.yaml`, `README.md`, starter `wiki/` files, and `layouts/default.html` |
| `--git`               | Run `git init` after scaffolding                                                               |
| `--repo`              | GitHub `owner/repo`; infer `graph.wiki_base`, `graph.context.wiki`, and `site.base_url` for GitHub Pages |
| `--graph-wiki-base`         | Override `graph.wiki_base` (overrides `--repo` inference)                              |
| `--site-base-url`           | Override `site.base_url` (default `/wiki` or inferred from `--repo`)                   |
| `--site-url-style`          | Override `site.url_style`: `dir` or `file` (default `dir`)                             |
| `--graph-content-predicate` | Override `graph.content_predicate` CURIE (e.g. `schema:articleBody`)                   |
| `--link-style`              | Override `link.style`: `markdown` or `wikilink`                                        |

## URL resolution

When `graph.wiki_base` is not set with `--graph-wiki-base`, init resolves it in this order:

1. **`--repo`** — GitHub Pages project site: `https://{owner}.github.io/{repo}/` and `site.base_url: /{repo}` (accepts `owner/repo`, HTTPS, or SSH URLs).
1. **Git remote** — If `.git` already exists or `--git` was passed, parse `git remote get-url origin` when it points at GitHub.
1. **Interactive prompt** — **Custom base URI prefix** (default `https://wiki.example.org/`).

`--graph-wiki-base` always wins over `--repo` and remote detection. `--site-base-url` overrides the inferred path from `--repo`.

## Prompts

When no flag or git remote supplies `graph.wiki_base`, init prompts once:

1. **Custom base URI prefix** (default `https://wiki.example.org/`) → `graph.wiki_base` and `wiki:` in `graph.context`

Always includes `schema`, `wiki`, `wazoo`, `foaf`, `dc`, `dcterms`, `sh`, and `xsd` prefixes. The `wazoo` URI is fixed in the scaffold (`https://schema.wazoo.dev/`), like the other built-in prefixes.

## Generated config

New workspaces receive a plain `wiki.yaml`. The packaged scaffold that `wiki init` renders from is [`src/wiki/templates/wiki.yaml.j2`](https://github.com/wazootech/wiki/blob/main/src/wiki/templates/wiki.yaml.j2) (Jinja2). Contributors edit that `.j2` file; Jinja variables (`wiki_base`, `base_url`, `url_style`, optional `content_predicate` / `link_style`) render into nested `graph:`, `site:`, and `link:` blocks via `{% if %}`.

- `vault.inputs: [wiki]`
- `site.base_url: /wiki` (or inferred from `--repo`), `site.url_style: dir`
- `lint` rules at `warning` for filename and links
- `site.title` and `site.layout` — site name and default page layout for build/serve
- `fmt:` — inline mdformat options for `wiki fmt` (`wrap`, `end_of_line`, `extensions`)

Init does **not** write `.mdformat.toml`. To use a separate TOML file instead, set `fmt: .mdformat.toml` and create that file with the same mdformat options as the inline `fmt` block.

## Generated files

- `layouts/default.html` — rendered from packaged [`default.html.j2`](https://github.com/wazootech/wiki/blob/main/src/wiki/templates/layouts/default.html.j2) (same Jinja2 scaffold pattern as `wiki.yaml.j2`); search, tabs, backlinks, and TOC. Edit to customize the look and feel.
- `README.md` — starter workspace overview and common commands
- `wiki/Person_Shape.md` — starter `sh:NodeShape` for `schema:Person`
- `wiki/Ethan_Davidson.md` — starter `schema:Person` example

By default `wiki init` does **not** create a Git repository. Use `--git` if you want to run `git init` immediately.

## Related

- [Getting_Started](Getting_Started.md)
- [Wiki_Configuration](Wiki_Configuration.md)
