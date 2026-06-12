# `wiki init` options

Use non-interactive flags in agent sessions so `wiki init` does not block on stdin.

## Usage

```bash
wiki init
wiki init --force
wiki init --git
wiki init --repo wazootech/wiki
wiki init --graph-context-wiki https://example.org/mywiki/ --site-base-url /mywiki
```

## Flags

| Flag | Description |
| ---- | ----------- |
| `--force` | Overwrite existing `wiki.yaml`, `README.md`, starter `wiki/` files, and `layouts/default.html` |
| `--git` | Run `git init` after scaffolding |
| `--repo` | GitHub `owner/repo`; infer `graph.context.wiki` and `site.base_url` for GitHub Pages |
| `--graph-context-wiki` | Override `graph.context.wiki` (wins over `--repo`) |
| `--site-base-url` | Override `site.base_url` (default `/wiki` or inferred from `--repo`) |
| `--site-url-style` | `dir` or `file` (default `dir`) |
| `--graph-content-predicate` | Override `graph.content_predicate` CURIE (e.g. `schema:articleBody`) |
| `--link-style` | `markdown` or `wikilink` |
| `--site-manifest-name` | Override `site.manifest.name` (default `Wiki CLI`) |
| `--wiki-inputs` | Default markdown directories relative to config root (repeatable; default `wiki`) |
| `--graph-base-iri` | Override `graph.base_iri` when document IRIs differ from `graph.context.wiki` |
| `--site-manifest-theme-color` | Override `site.manifest.theme_color` (e.g. `#3b82f6`) |
| `--graph-implicit-types` | Default `rdf:type` CURIEs for untyped documents (repeatable) |
| `--graph-implicit-types-policy` | `fallback` or `append` when applying `graph.implicit_types` |
| `--graph-include-file-extension` / `--no-graph-include-file-extension` | Include file extension in inferred document URIs |

## URL resolution order

When `--graph-context-wiki` is not passed:

1. **`--repo`** — `https://{owner}.github.io/{repo}/` and `site.base_url: /{repo}`
2. **Git remote** — If `.git` exists or `--git` was passed, parse `origin` when GitHub
3. **Interactive prompt** — default IRI `https://wiki.example.org/` (avoid in agent runs — pass a flag)

`--graph-context-wiki` always wins over `--repo`. `--site-base-url` overrides inferred path from `--repo`.

## Generated layout

| Path | Purpose |
| ---- | ------- |
| `wiki.yaml` | Config: wiki, graph, site, lint, fmt |
| `layouts/default.html` | Default page layout |
| `wiki/Person_Shape.md` | Starter SHACL shape |
| `wiki/Ethan_Davidson.md` | Starter Person example |
| `README.md` | Workspace overview |

Default: no Git repo. Use `--git` to run `git init`.
