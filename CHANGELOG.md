# Changelog

## Unreleased

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
