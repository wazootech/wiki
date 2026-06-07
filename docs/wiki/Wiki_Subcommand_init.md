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
wiki init --wiki-base https://example.org/mywiki/ --base-url /mywiki
```

## Options

| Flag | Description |
| ---- | ----------- |
| `--force` | Overwrite existing `wiki.yaml` or non-empty `wiki/` |
| `--git` | Run `git init` after scaffolding |
| `--repo` | GitHub `owner/repo`; infer `wiki_base`, `context.wiki`, and `base_url` for GitHub Pages |
| `--wiki-base` | Explicit `wiki_base` URI (overrides `--repo` inference) |
| `--base-url` | URL prefix for built/served pages (default `/wiki` or inferred from `--repo`) |
| `--url-style` | `dir` or `file` (default `dir`) |
| `--wazoo` | `context.wazoo` namespace URI (default `https://schema.wazoo.dev/`) |
| `--content-predicate` | Optional `content_predicate` CURIE (e.g. `schema:articleBody`) |
| `--link-style` | Default link style: `markdown` or `wikilink` |

## URL resolution

When `wiki_base` is not set with `--wiki-base`, init resolves it in this order:

1. **`--repo`** — GitHub Pages project site: `https://{owner}.github.io/{repo}/` and `base_url: /{repo}` (accepts `owner/repo`, HTTPS, or SSH URLs).
2. **Git remote** — If `.git` already exists or `--git` was passed, parse `git remote get-url origin` when it points at GitHub.
3. **Interactive prompt** — **Custom base URI prefix** (default `https://wiki.example.org/`).

`--wiki-base` always wins over `--repo` and remote detection. `--base-url` overrides the inferred path from `--repo`.

## Prompts

When no flag or git remote supplies `wiki_base`, init prompts once:

1. **Custom base URI prefix** (default `https://wiki.example.org/`) → `wiki_base` and `wiki:` in `context`

Always includes `schema`, `wiki`, `wazoo`, `foaf`, `dc`, `dcterms`, `sh`, and `xsd` prefixes. Default `wazoo` is `https://schema.wazoo.dev/`.

## Generated config

New workspaces receive a plain `wiki.yaml`. The packaged scaffold that `wiki init` renders from is [`src/wiki/templates/wiki.yaml.j2`](https://github.com/wazootech/wiki/blob/main/src/wiki/templates/wiki.yaml.j2) (Jinja2). Contributors edit that `.j2` file; variables include `wiki_base`, `base_url`, `url_style`, `wazoo`, and optional `content_predicate` / `link_style` via `{% if %}` blocks.

- `input_dirs: [wiki]`
- `base_url: /wiki` (or inferred from `--repo`), `url_style: dir`
- `lint` rules at `warning` for filename and links
- `page_layout: layouts/default.html` — site default page layout

## Generated files

- `layouts/default.html` — rendered from packaged [`default.html.j2`](https://github.com/wazootech/wiki/blob/main/src/wiki/templates/layouts/default.html.j2) (same Jinja2 scaffold pattern as `wiki.yaml.j2`); search, tabs, backlinks, and TOC. Edit to customize the look and feel.
- `README.md` — starter workspace overview and common commands
- `wiki/Person_Shape.md` — starter `sh:NodeShape` for `schema:Person`
- `wiki/Ethan_Davidson.md` — starter `schema:Person` example

By default `wiki init` does **not** create a Git repository. Use `--git` if you want to run `git init` immediately.

## Related

- [Getting_Started](Getting_Started.md)
- [Wiki_Configuration](Wiki_Configuration.md)
