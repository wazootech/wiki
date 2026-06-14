# Preferences wizard — `wiki.yaml` touches

Use after `wiki init` when the user approves file edits. Run `wiki fmt` on changed markdown paths.

## Init scaffold defaults

Fresh `wiki init` writes:

| Block | Init content |
| ----- | ------------ |
| `site:` | `layout`, `base_url`, `url_style` only |
| `lint:` | `broken_links`, `filename_pattern`, `link_style` at `warning` |
| `fmt:` | Inline mapping in `wiki.yaml` (wrap, end_of_line, extensions) — init does not write `.mdformat.toml` |

Other `lint.*` keys (e.g. `headings`, `heading_levels`) are valid but init omits them (defaults are `off`).

## Removed / invalid keys (config load fails)

Do not add these to new scaffolds; remove them when upgrading — invalid in the current schema:

- `site.manifest`, `site.title`, `site.theme_color`
- Template vars `{{ site.manifest.* }}` — replace with literals or `{{ site.base_url }}/assets/…` in custom layouts
- `<link rel="manifest">` and built `manifest.webmanifest` — removed from build/serve

Upgrade steps: CHANGELOG Migration section and [Wiki Configuration](https://github.com/wazootech/wiki/blob/main/docs/wiki/Wiki_Configuration.md). No runtime rename hints or `wiki config migrate` shims.

## Site branding

Branding is **not** in `wiki.yaml`. Edit `site.layout` (e.g. `layouts/default.html.j2`) and files under `wiki.assets` for site name, theme color, favicon, and sidebar chrome. Init scaffolds `assets/logo.svg` and references it at `{{ site.base_url }}/assets/logo.svg` in the default layout. `--site-name` and `--site-theme-color` at init affect only the generated logo SVG.

## Lint strictness (only if asked)

| Key | Values | Effect |
| --- | ------ | ------ |
| `lint.headings` | `off`, `warning`, `error` | Sentence-case H2+ and numbered headings (init omits; default `off`) |
| `lint.filename_pattern` | severity | Wikipedia-style filenames |
| `lint.broken_links` | severity | Unresolved internal links |
| `lint.link_style` | severity | Obsidian wikilinks in body when `link.style: markdown` |

Severity is `off`, `warning`, or `error`. Unknown top-level keys fail at config load.

## Config lanes (do not confuse)

| Block | Command | Purpose |
| ----- | ------- | ------- |
| `fmt:` | `wiki fmt` | Mechanical markdown |
| `lint:` | `wiki lint` | Conventions |
| `check:` | `wiki check` | SHACL, JSON Schema, routes, layouts |

Regex belongs in `wiki.filename_pattern`, not under `check:`.
