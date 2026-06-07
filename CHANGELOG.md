# Changelog

## Unreleased

### Added

- Top-level `link_style` (`markdown` default, or `wikilink`) controls `wiki link --apply` output format
- `lint.link_style` convention audit flags wikilinks in body prose when `link_style` is `markdown`

### Changed

- `lint.headings` applies sentence-case checks to H2+ only; H1 title case is conventional
- `lint.headings` flags Setext underlined headings; vaults should use ATX `#` headings only
- Heading auditor skips thematic `---` inside fenced code and ignores capitalized link text in headings

### Changed (breaking)

- Split audit lanes: **`wiki check`** = integrity only (`check.broken_links` + always-on SHACL/routes/collisions); **`wiki lint`** = conventions (`lint.filename_pattern`, `lint.headings`)
- Move `filename_pattern` and `headings` severities from `check:` to `lint:` in `wiki.yaml` (old keys fail at load)
- **`filename_pattern`** regex now matches the **full** `.md` filename — include `\.md` in the pattern (for example `[A-Za-z0-9_()-]+\.md`)
- Relative **`--input-dir`** paths resolve against the config file directory, not the shell cwd
- **`wiki build`** preflight runs `check` then `lint` (unless `--no-check`)

### Migration

1. In `wiki.yaml`, move `check.filename_pattern` and `check.headings` to a new `lint:` block
2. Add `\.md` to your top-level `filename_pattern` regex
3. Run `wiki lint` in CI alongside `wiki check`

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
