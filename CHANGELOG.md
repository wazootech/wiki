# Changelog

## Unreleased

### Added
- In-process RDF graph cache so multiple SPARQL operations in one run share a single graph build; `--reload` on `query`, `render`, and `build --render`
- `wiki serve --watch` rebuilds the in-memory graph and SPARQL blocks when vault files change

### Changed
- Replaced on-disk graph cache (`.wiki/cache/`) and incremental render-state with runtime-only caching

### Removed
- `--all`, `--rebuild-cache`, and `--no-cache` flags

## 0.1.5 — 2026-05-31

### Added
- `wiki view <file>` command for terminal document rendering with Rich
- Rich dependency for ASCII-safe terminal output
- YAML, YML, and JSON document support alongside Markdown
- CURIE expansion for HTML microdata attributes
- Typed HTML rendering with infoboxes and `wiki:template` support

### Fixed
- Linkify only known document slugs in SPARQL results
- Regenerate stale SPARQL blocks in docs

### Removed
- Loose blank node resolution keyed on name/givenName+familyName (`build_person_name_map`, `resolve_blank_nodes`)
