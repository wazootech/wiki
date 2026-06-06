# Changelog

## Unreleased

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
