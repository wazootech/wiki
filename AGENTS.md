# Agent guidelines

Welcome! This document outlines the style, hygiene, and design guidelines for managing and contributing to this wiki. These guidelines are enforced by `wiki check` (integrity) and `wiki lint` (conventions) in the Wiki CLI (`wazootech-wiki` on PyPI). Canonical vault-authoring detail lives in the vault [Style_Guide](docs/wiki/Style_Guide.md).

## Vault rules

### Clean filenames
- **Rule:** Default user-facing examples should prefer **Wikipedia-style** filenames for ordinary pages (e.g., `Opal_Security.md`, `Gregory_Davidson.md`) — preserved capitalization and underscores. Do not default to lowercase kebab-case (`opal-security.md`). Reserve `index.md` only for folder index routes. Avoid spaces and other unsafe route characters.
- **Enforcer:** `lint.filename_pattern` in `wiki.yaml` (warning by default). Route safety (spaces, unsafe URL characters) always fails as an error in `wiki check`.

### Internal links
- **Rule:** Prefer standard Markdown links to other vault pages (`Page_Name.md`). GFM relative links and Obsidian-style `[[slug]]` wikilinks also resolve when valid. Ensure internal links point at existing documents.
- **Enforcer:** `check.broken_links` (warning by default) — wikilinks, markdown page links, heading fragments, assets, and `wiki:` CURIEs in frontmatter and microdata.

### Style guidelines
- **Rule:** Use sentence-case headings (capitalize only the first word and proper nouns). Avoid numbered headings; keep headings concise and clear.
- **Rule:** Avoid using horizontal rules (`---`) for thematic breaks within page bodies.
- **Enforcer:** `lint.headings` (off by default; set to `warning` or `error` in `wiki.yaml`).

### Markdown flavor
Wikilinks (`[[Page]]`) are always supported. Use Markdown links for external URLs.

---

## Developer notes

### Running validations
Before submitting commits, verify your changes against the active schema and guidelines:
```bash
# Integrity: SHACL + broken links
wiki check

# Conventions: filename pattern + headings
wiki lint

# Verbose output
wiki check -v
wiki lint -v

# CI: elevate warnings to errors
wiki check --strict
wiki lint --strict
```

CI also runs `wiki fmt --check` (formatting) and `wiki render --check` (stale SPARQL blocks); those are separate lanes.

### Architecture
See [CONTEXT.md](CONTEXT.md) for domain language and [docs/wiki/Wiki_Configuration.md](docs/wiki/Wiki_Configuration.md) for config semantics (`check` vs `lint` vs `fmt`).
