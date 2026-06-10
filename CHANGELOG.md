# Changelog

## 0.1.13 — 2026-06-10

### Added

- `install-wiki` and `create-wiki` agent skills under `skills/` — install the CLI and scaffold a workspace with `wiki init` plus a light preferences wizard

### Fixed

- setuptools package discovery includes `wiki.schemas`, `wiki.site`, and `wiki.mdit_py_plugins` subpackages
- Default page layout spacing and copy-button click dead band
- Compacted JSON-LD output prunes `@context` to prefixes used in the document

### Changed

- Release workflow uses Node 24 for npm OIDC trusted publishing

## 0.1.11 — 2026-06-09

### Added

- `site.manifest` — Web App Manifest-shaped block (`name`, `short_name`, `theme_color`, `background_color`, `start_url`, `display`, `icons`) drives layout chrome, `{manifest_json}` / `{manifest_url}` placeholders, and `manifest.webmanifest` on `wiki build` / `wiki serve`
- `graph.implicit_types` and `graph.implicit_types_policy` (`fallback` | `append`) — vault-wide default `rdf:type` CURIEs for documents missing `type` / `@type`, or merged with explicit types when policy is `append` (SHACL shape documents skip append)

## Unreleased

### Changed (breaking)

- Remove `site.title` and `site.theme_color`; use `site.manifest.name` and `site.manifest.theme_color` instead
- Remove `graph.wiki_base`; auto-generated document IRIs default from `graph.context.wiki` with optional `graph.base_iri` override
- Rename init flag `--graph-wiki-base` → `--graph-context-wiki` (sets `graph.context.wiki` in the scaffold)
- Rename `graph.uri_ext` → `graph.include_file_extension`, `graph.default_types` → `graph.implicit_types`, and `graph.default_types_policy` → `graph.implicit_types_policy`

- **CLI flags** align with `wiki.yaml` block paths: `--vault-inputs` (was `--input-dir`), `--site-base-url` (was `--base-url`), `--site-url-style` (was `--url-style` / serve `--style`), `--graph-context-wiki` (was `--wiki-base` / `--graph-wiki-base`), `--graph-content-predicate` (was `--content-predicate`); `--link-style` unchanged. Remove `--wazoo` / `--graph-wazoo`; `graph.context.wazoo` stays fixed in the init scaffold like other built-in prefixes.
- Rename `vault.input_dirs` → `vault.inputs` and `vault.asset_dirs` → `vault.assets`
- Load `wiki.yaml` / `wiki.json` through strict Pydantic schema validation (`extra='forbid'` on every block)
- **Unified Config:** remove the flat runtime `Config` and `WikiFileConfig` / `from_file_config()` bridge; the loaded model matches yaml blocks (`config.vault.inputs`, `config.site.base_url`, etc.). Programmatic callers must use nested construction or `Config.for_root()`.
- Rename root loader type `WikiConfig` → `Config` (`from wiki.config import Config`); **`WikiConfig`** reserved for a future `wiki:` yaml section
- Rename exported section types: `VaultBlock` → `VaultConfig`, …; add `FmtConfig` for `Config.fmt` (`.options` / `.toml`)
- Rename `DEFAULT_CHECK_RULES` / `DEFAULT_LINT_RULES` → `DEFAULT_CHECK_CONFIG` / `DEFAULT_LINT_CONFIG`

### Changed

- Packaged init templates renamed to `layout_default.html.j2` and `layout_default.css.j2` (vault path `layouts/default.html` unchanged); default page CSS moved out of `site.py` into the template bundle
- Internal domain types (`PageRoute`, `BrokenLink`, `VirtualPage`, `InitOptions`, etc.) live under `wiki.schemas` as Pydantic models; `Config.check` and `Config.lint` are `CheckConfig` / `LintConfig` instances (not plain dicts)
- `Context` (RDF prefix bindings) lives in `wiki.context`; `Config.context` is a computed property from `graph.context`

### Migration

1. In `vault:` rename path keys:
   - `input_dirs` → `inputs`
   - `asset_dirs` → `assets`
2. In `graph:` rename keys:
   - `uri_ext` → `include_file_extension`
   - `default_types` → `implicit_types`
   - `default_types_policy` → `implicit_types_policy`
   - `wiki_base` → remove; set `context.wiki` instead (optional `base_iri` when document IRIs must differ from the `wiki:` namespace)
3. Programmatic imports: root loader is `Config` from `wiki.config` (was `WikiConfig`); section types from `wiki.schemas` (`VaultConfig`, `CheckConfig`, `FmtConfig`, etc.); `DEFAULT_CHECK_CONFIG` / `DEFAULT_LINT_CONFIG` from `wiki.config`; `Config.fmt` is `FmtConfig | None` with `.options` / `.toml`
4. In `site:` move branding into `manifest:`:
   - `title` → `manifest.name`
   - `theme_color` → `manifest.theme_color`

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
