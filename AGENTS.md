# Agent guidelines

Welcome! This document outlines the style, hygiene, and design guidelines for managing and contributing to this wiki. These guidelines are enforced by `wiki check` (integrity) and `wiki lint` (conventions) in the Wiki CLI (`wazootech-wiki` on PyPI). Canonical vault-authoring detail lives in the vault [Style_Guide](docs/wiki/Style_Guide.md).

## Vault rules

### Clean filenames
- **Rule:** Default user-facing examples should prefer **Wikipedia-style** filenames for ordinary pages (e.g., `Opal_Security.md`, `Gregory_Davidson.md`) — preserved capitalization and underscores. Do not default to lowercase kebab-case (`opal-security.md`). Reserve `index.md` only for folder index routes. Avoid spaces and other unsafe route characters.
- **Enforcer:** `lint.filename_pattern` in `wiki.yaml` (warning by default). Route safety (spaces, unsafe URL characters) always fails as an error in `wiki check`.

### Internal links
- **Rule:** Use standard Markdown links to other vault pages (`Page_Name.md`). GFM relative links are also accepted. Do not use Obsidian-style `[[slug]]` wikilinks in this vault. Ensure internal links point at existing documents.
- **Enforcer:** `lint.broken_links` (warning by default) — wikilinks, markdown page links, heading fragments, assets, and `wiki:` CURIEs in frontmatter and microdata. `lint.link_style` (warning by default) flags wikilinks in body prose when `link_style` is `markdown`. Repair with `wiki link --fix-broken`; suggest missing links with `wiki link` / `wiki link --apply` (separate from check/lint — see [Design_Philosophies](docs/wiki/Design_Philosophies.md)).

### Style guidelines
- **Rule:** Use ATX `#` headings only (no Setext underlines); wiki tooling does not index underlined headings for title, TOC, or fragment links.
- **Rule:** Use title-case H1 headings (page title; align with `headline` frontmatter). Use sentence-case H2+ headings (capitalize only the first word and proper nouns). Avoid numbered headings; keep headings concise and clear.
- **Rule:** Avoid using horizontal rules (`---`) for thematic breaks within page bodies.
- **Enforcer:** `wiki fmt` converts Setext underlines to ATX `#` headings. `lint.headings` (off by default; set to `warning` or `error` in `wiki.yaml`) flags sentence-case H2+ and numbered headings — not ATX syntax.

### Markdown flavor
Use Markdown links for all internal and external URLs.

---

## Developer notes

### Running validations
Before submitting commits, verify your changes against the active schema and guidelines:
```bash
# Integrity: SHACL, route safety, layout frontmatter
wiki check

# Conventions: broken links, filename pattern, headings, link style
wiki lint

# Formatting (wiki.yaml fmt: or optional .mdformat.toml)
wiki fmt --check

# Verbose output
wiki check -v
wiki lint -v

# CI: elevate warnings to errors
wiki check --strict
wiki lint --strict
```

CI also runs `wiki fmt --check` (formatting) and `wiki render --check` (stale SPARQL blocks); those are separate lanes. `wiki link` is **report-only by default** — it lists missing wikilink opportunities but does not write files or fail the build. Run it manually before commit (`wiki link --apply` to insert suggestions); CI gates link hygiene only if `wiki link --check` is wired in.

### Architecture
See [CONTEXT.md](CONTEXT.md) for domain language and [docs/wiki/Wiki_Configuration.md](docs/wiki/Wiki_Configuration.md) for config semantics (`check` vs `lint` vs `fmt`).
