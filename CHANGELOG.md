# Changelog

## Unreleased

### Fixed

- Escape all raw HTML in wiki markdown rendering uniformly, including TOC/sidebar outline labels; strip SPARQL comment wrappers before site HTML rendering instead of passthrough ([#91](https://github.com/wazootech/wiki/issues/91), PR [#102](https://github.com/wazootech/wiki/pull/102))

### Changed

- Rename release workflow to [`.github/workflows/release.yml`](.github/workflows/release.yml) (update npm and PyPI trusted publisher workflow filenames to match).
- Rename Pages deploy workflow to [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

## 0.1.15 — 2026-06-14

### Fixed

- Release workflow keeps canonical `release.yaml` filename for npm OIDC trusted publishing; npm publish skips existing versions and verify step retries registry propagation.

## 0.1.14 — 2026-06-14

### Changed

- Consolidate [Wiki CLI templates](docs/wiki/Wiki_CLI.md#ecosystem-templates) registry in Wiki_CLI: single shipped/planned table, SPARQL single-repo (`wiki-yasgui-template` absorbs Virtuoso scope), `wiki-{stack}-template` integration slugs, planned `wiki-astro-template` ([#96](https://github.com/wazootech/wiki/issues/96)). Slim README and downstream wiki pages to point at the canonical section; retire stale slugs (`sparql-service-template`, bare `nextjs-template`, `obsidian-quartz-template`, etc.).
- Remove `site.manifest` and `manifest.webmanifest`. Branding (site name, theme color, favicon, sidebar logo) lives in `site.layout` only; `wiki.yaml` `site:` keeps `layout`, `base_url`, and `url_style`. Init flags rename to `--site-name` and `--site-theme-color` (logo asset only; not persisted to yaml).
- `wiki init` omits `lint:` keys that default to `off` (`headings`, `heading_levels`, `duplicate_headings`, `thematic_breaks`).
- Docs and agent skills use title-case H1 headings and sentence-case H2+ without numbered headings.

### Migration

- Delete the entire `site.manifest` block from `wiki.yaml`.
- Move branding into `layouts/default.html.j2` (or your `site.layout` file): edit `<title>`, sidebar label, `theme-color` meta tags, and asset URLs such as `{{ site.base_url }}/assets/logo.svg` directly.
- Replace `{{ site.manifest.* }}` template variables with literals or `{{ site.base_url }}/assets/…` paths in custom layouts.
- Remove `<link rel="manifest">` and any dependency on built/served `manifest.webmanifest`.

## 0.1.13 — 2026-06-10

### Added

- `wiki-install` and `wiki-create` agent skills under `skills/` — install the CLI and scaffold a workspace with `wiki init` plus a light preferences wizard

### Fixed

- setuptools package discovery includes `wiki.schemas`, `wiki.site`, and `wiki.mdit_py_plugins` subpackages
- Default page layout spacing and copy-button click dead band
- Compacted JSON-LD output prunes `@context` to prefixes used in the document

### Changed

- Release workflow uses Node 24 for npm OIDC trusted publishing

## 0.1.11 — 2026-06-09

### Added

- `site.manifest` — Web App Manifest-shaped block (`name`, `short_name`, `theme_color`, `background_color`, `start_url`, `display`, `icons`) drives layout chrome, `{{ site.manifest.json }}` / `{{ site.manifest.url }}` placeholders, and `manifest.webmanifest` on `wiki build` / `wiki serve`
- `graph.implicit_types` and `graph.implicit_types_policy` (`fallback` | `append`) — vault-wide default `rdf:type` CURIEs for documents missing `type` / `@type`, or merged with explicit types when policy is `append` (SHACL shape documents skip append)

## Unreleased

### Added

- Hidden SPARQL queries in inline render blocks — wrap the fenced query in an HTML comment (`<!-- sparql:start` … `-->`) so built pages show only the results table; visible-query syntax is unchanged ([#73](https://github.com/wazootech/wiki/issues/73))
- JSON Schema frontmatter validation in `wiki check` — bind schemas on SHACL shape documents with `wazoo:jsonSchema` + `sh:targetClass`, or append per-page schemas; configurable via `check.frontmatter_schema` and `check.missing_schema_ref` ([#71](https://github.com/wazootech/wiki/issues/71))
- Standalone `wiki` executables for Linux, macOS, and Windows via PyInstaller — published to GitHub Releases with `SHA256SUMS` on each `v*` tag ([#77](https://github.com/wazootech/wiki/issues/77))
- Unified [`.github/workflows/release.yml`](.github/workflows/release.yml): PyPI, npm, and GitHub Release binaries in one workflow (replaces separate release workflows)
- `wiki-deploy` agent skill — GitHub Pages setup aligned with [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml); pip and uv workflow templates, deploy anti-patterns, and Pages `build_type` verification

### Changed

- `wiki init` no longer scaffolds starter JSON Schema files — SHACL-only `Person_Shape.md` is the default; add `wazoo:jsonSchema` bindings when you want JSON Schema validation
- Agent skills — restore `wiki-improve/scripts/audit.sh` (was empty in rename commit); `wiki-install` capability probe (`wiki fmt --help`) catches stale PATH installs; `wiki-create` default-on post-init `check --strict` with opt-out; stale-CLI handling aligned across create/deploy/improve; eval updates
- `wiki-create` skill — init flag reference is `wiki init --help` (removed duplicated `init-options.md`); README preflight and post-init `.gitignore` guidance; infer `--repo` from git/attachment; batch optional prefs; wiki-deploy handoff at clean exit
- `wiki-install` skill — `python3 -m pip` and pipx troubleshooting fallbacks; IDE pip tool vs terminal install on macOS
- `wiki-deploy` skill — forbid `uv pip install` without venv on standalone repos; eval for CI “No virtual environment found” footgun; embed uv/pip workflow templates wholesale (no install hybridization)
- [Getting Started](docs/wiki/Getting_Started.md) and [Wiki Skills](docs/wiki/Wiki_Skills.md) — refresh agent skills after Wiki CLI upgrades; avoid committing stale `.agents/skills/`
- `wiki upgrade` on standalone binaries prints GitHub Releases re-download instructions instead of calling pip
- `link.style` value `wikilink` renamed to `obsidian` (standard Markdown vs Obsidian wikilinks); `wiki init --link-style` and docs use the new names

### Fixed

- `wiki init --graph-implicit-types-policy` accepts `fallback` or `append` (was incorrectly `override`) ([#72](https://github.com/wazootech/wiki/issues/72))

### Changed (breaking)

- Layout template context uses nested namespaces (`site.*`, `page.*`, `wiki.*`) instead of flat keys (`page_title`, `site_manifest_name`, …); update custom `.html.j2` layouts (see Migration)
- `wiki-best-practices` agent skill renamed to `wiki-improve` — reinstall with `npx skills add wazootech/wiki@wiki-improve -g -y`; improve-style advisor framing and prioritized findings report; `audit.sh` pipeline unchanged
- Remove `site.title` and `site.theme_color`; use `site.manifest.name` and `site.manifest.theme_color` instead
- Remove `graph.wiki_base`; auto-generated document IRIs default from `graph.context.wiki` with optional `graph.base_iri` override
- Rename init flag `--graph-wiki-base` → `--graph-context-wiki` (sets `graph.context.wiki` in the scaffold)
- Rename `graph.uri_ext` → `graph.include_file_extension`, `graph.default_types` → `graph.implicit_types`, and `graph.default_types_policy` → `graph.implicit_types_policy`

- **CLI flags** align with `wiki.yaml` block paths: `--wiki-inputs` (was `--vault-inputs`, was `--input-dir`), `--site-base-url` (was `--base-url`), `--site-url-style` (was `--url-style` / serve `--style`), `--graph-context-wiki` (was `--wiki-base` / `--graph-wiki-base`), `--graph-content-predicate` (was `--content-predicate`); `--link-style` unchanged. Remove `--wazoo` / `--graph-wazoo`; `graph.context.wazoo` stays fixed in the init scaffold like other built-in prefixes.
- Rename `wiki.input_dirs` → `wiki.inputs` and `wiki.asset_dirs` → `wiki.assets` (was `vault.xxx` before the top-level block rename)
- Load `wiki.yaml` / `wiki.json` through strict Pydantic schema validation (`extra='forbid'` on every block)
- **Unified Config:** remove the flat runtime `Config` and `WikiFileConfig` / `from_file_config()` bridge; the loaded model matches yaml blocks (`config.wiki.inputs`, `config.site.base_url`, etc.). Programmatic callers must use nested construction or `Config.for_root()`.
- Rename root loader type `WikiConfig` → `Config` (`from wiki.config import Config`); **`WikiConfig`** reserved for a future `wiki:` yaml section
- Rename exported section types: `VaultBlock` → `VaultConfig` → `WikiConfig`, …; add `FmtConfig` for `Config.fmt` (`.options` / `.toml`)
- Rename `DEFAULT_CHECK_RULES` / `DEFAULT_LINT_RULES` → `DEFAULT_CHECK_CONFIG` / `DEFAULT_LINT_CONFIG`

### Changed

- Page layouts render through Jinja2 (`.html.j2`) instead of `{placeholder}` string substitution; `wiki init` copies `layouts/default.html.j2` from the packaged template
- Packaged default CSS is `layout_default.css` (plain CSS, not a Jinja template)

### Changed (breaking)

- Rename `site.layout` and `wazoo:layout` targets from `*.html` to `*.html.j2`
- Replace `{key}` layout tokens with Jinja `{{ key }}`; CLI-injected HTML/JSON slots use safe markup (or explicit `| safe` for hand-authored template HTML)

### Changed

- Packaged init templates renamed to `layout_default.html.j2` and `layout_default.css`; default page CSS moved out of `site.py` into the template bundle
- Internal domain types (`PageRoute`, `BrokenLink`, `VirtualPage`, `InitOptions`, etc.) live under `wiki.schemas` as Pydantic models; `Config.check` and `Config.lint` are `CheckConfig` / `LintConfig` instances (not plain dicts)
- `Context` (RDF prefix bindings) lives in `wiki.context`; `Config.context` is a computed property from `graph.context`

### Migration

- Agent skill `wiki-best-practices` → `wiki-improve`: `npx skills add wazootech/wiki@wiki-improve -g -y` (remove stale `wiki-best-practices` from `~/.agents/skills/` or project `.agents/skills/` if present). Wiki doc page renamed to [Wiki Skill improve](docs/wiki/Wiki_Skill_improve.md).
- **Layout template variables (breaking):** flat keys removed; use nested paths in custom `.html.j2` files:

| Flat (remove) | Nested (use) |
| --- | --- |
| `site_base_url` | `site.base_url` |
| `site_url_style` | `site.url_style` |
| `site_manifest_name` | `site.manifest.name` |
| `site_manifest_theme_color` | `site.manifest.theme_color` |
| `site_manifest_url` | `site.manifest.url` |
| `manifest_json` | `site.manifest.json` |
| `logo_svg` | `site.logo_svg` |
| `inline_css` | `site.inline_css` |
| `page_title` | `page.title` |
| `page_content` | `page.content` |
| `page_kind` | `page.kind` |
| `body_class` | `page.body_class` |
| `layout_class` / `layout_label` | `page.layout.class` / `page.layout.label` |
| `type_label` | `page.type_label` |
| `infobox_html` / `toc_html` / … | `page.nav.infobox` / `page.nav.toc` / … |
| `metadata_*_html` | `page.metadata.tool` / `.tab` / `.pane` |
| `source_markdown` | `page.source` |
| `all_pages_json` | `wiki.pages_json` |
| `current_slug_json` | `page.slug_json` (plus new `page.slug` string) |

See [Wiki Configuration — Template variables](docs/wiki/Wiki_Configuration.md#template-variables).

1. In `wiki:` rename path keys:
   - `input_dirs` → `inputs`
   - `asset_dirs` → `assets`
2. In `graph:` rename keys:
   - `uri_ext` → `include_file_extension`
   - `default_types` → `implicit_types`
   - `default_types_policy` → `implicit_types_policy`
   - `wiki_base` → remove; set `context.wiki` instead (optional `base_iri` when document IRIs must differ from the `wiki:` namespace)
3. Programmatic imports: root loader is `Config` from `wiki.config` (was `WikiConfig`); section types from `wiki.schemas` (`WikiConfig` (was `VaultConfig`), `CheckConfig`, `FmtConfig`, etc.); `DEFAULT_CHECK_CONFIG` / `DEFAULT_LINT_CONFIG` from `wiki.config`; `Config.fmt` is `FmtConfig | None` with `.options` / `.toml`
4. In `site:` move branding into `manifest:`:
   - `title` → `manifest.name`
   - `theme_color` → `manifest.theme_color`
5. In `link:` rename `style: wikilink` → `style: obsidian` (default remains `markdown`)
6. Page layouts:
   - Rename `site.layout` and `wazoo:layout` paths from `*.html` to `*.html.j2`
   - Replace flat template keys with nested Jinja paths (`{{ page.title }}`, `{{ site.manifest.name }}`, …; see [Template variables](docs/wiki/Wiki_Configuration.md#template-variables))

## 0.1.9 — 2026-06-08

### Added

- `link.style` (`markdown` default, or `wikilink`) controls `wiki link --apply` output format
- `lint.link_style` convention audit flags wikilinks in body prose when `link.style` is `markdown`
- `site.title` drives layout chrome (`{site_title}`) and the logo glyph on build/serve

### Changed (breaking)

- **Nested config blocks only:** settings live under `vault:`, `graph:`, `site:`, and `link:`; unknown top-level keys fail at load (no `wiki config migrate`)
- Remove `check.forbidden_layout_keys`; `template` / `wiki:template` frontmatter are ordinary properties (layout selection uses `wazoo:layout` only)
- Move `check.broken_links` to `lint.broken_links` in `wiki.yaml` (unknown `check` keys fail at load)
- **`wiki build`** preflight runs `lint` then `check` (unless `--no-check`)
- Split audit lanes: **`wiki check`** = integrity (SHACL, routes, collisions, layout); **`wiki lint`** = conventions including `lint.broken_links`
- Move `filename_pattern` and `headings` severities from `check:` to `lint:` in `wiki.yaml` (old keys fail at load)

### Changed

- `lint.headings` applies sentence-case checks to H2+ only; H1 title case is conventional
- `lint.headings` flags Setext underlined headings; vaults should use ATX `#` headings only
- Heading auditor skips thematic `---` inside fenced code and ignores capitalized link text in headings

### Migration

1. Group former top-level keys under blocks (unknown top-level keys fail at load):
   - `input_dirs`, `asset_dirs`, `exclude`, `filename_pattern` → `vault:`
   - `wiki_base`, `content_predicate`, `context` / `@context`, `uri_ext` → `graph:`
   - `site_title`, `wiki_page_layout` / `page_layout`, `base_url`, `url_style` → `site:` (`title`, `layout`, `base_url`, `url_style`)
   - `link_renames`, `link_style` → `link:` (`renames`, `style`)
   - `serve_api` → `sparql_service`
2. Move `check.broken_links` to `lint.broken_links`
3. Move `check.filename_pattern` and `check.headings` to `lint:` if still present
4. Add `\.md` to your `vault.filename_pattern` regex
5. Run `wiki lint` then `wiki check` in CI

## 0.1.8 — 2026-06-05

### Changed
- Require `snake_case` config keys only for top-level `wiki.yaml` settings
- Require `snake_case` nested `check` rule keys: `filename_pattern`, `broken_links`, and `headings`
- Fail fast on invalid config files, unknown keys, removed aliases, and malformed nested config blocks

### Fixed
- Surface config-load errors consistently through the CLI instead of silently falling back to defaults

## 0.1.7 — 2026-06-05

### Added
- `wiki fmt` subcommand for formatting wiki content
- Optional disk-backed graph cache support
- Configurable HTML template scaffolding for generated sites
- Heading and broken-link audits in `wiki check`
- Expanded docs and generated site content for CLI subcommands and wiki concepts

### Changed
- Simplified `wiki init` scaffolding and prompts
- Refined site generation and HTML template extraction

### Fixed
- Markdown link and microdata CURIE scanning in link audits
- Flaky SPARQL query ordering in docs checks

## 0.1.5 — 2026-06-01

### Added
- `wiki view <file>` command for terminal document rendering with Rich
- Rich dependency for ASCII-safe terminal output
- YAML, YML, and JSON document support alongside Markdown
- CURIE expansion for HTML microdata attributes
- Typed HTML rendering with infoboxes and `wiki:template` support
- In-process RDF graph cache so multiple SPARQL operations in one run share a single graph build; `--reload` on `query`, `render`, and `build --render`
- `wiki serve --watch` rebuilds the in-memory graph and SPARQL blocks when vault files change

### Changed
- Replaced on-disk graph cache (`.wiki/cache/`) and incremental render-state with runtime-only caching

### Fixed
- Linkify only known document slugs in SPARQL results
- Regenerate stale SPARQL blocks in docs

### Removed
- Loose blank node resolution keyed on name/givenName+familyName (`build_person_name_map`, `resolve_blank_nodes`)
- `--all`, `--rebuild-cache`, and `--no-cache` flags
