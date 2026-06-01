# Changelog

## Unreleased

### Added
- On-disk RDF graph cache (`.wiki/cache/`) keyed on vault fingerprint; `--no-cache` and `--rebuild-cache` flags on `query`, `render`, and `build --render`
- Incremental `wiki render` (stale files only by default); `wiki render --all` for a full pass

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
