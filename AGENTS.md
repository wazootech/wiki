# Agent guidelines

Welcome! This document outlines the style, hygiene, and design guidelines for managing and contributing to this wiki. These guidelines are enforced by the `wiki check` subcommand of the Wiki CLI (`wazootech-wiki` on PyPI). Canonical vault-authoring detail lives in the vault [Style_Guide](docs/wiki/Style_Guide.md).

## Vault rules

### Clean filenames
- **Rule:** Default user-facing examples should prefer **Wikipedia-style** filenames for ordinary pages (e.g., `Opal_Security.md`, `Gregory_House.md`) — preserved capitalization and underscores. Do not default to lowercase kebab-case (`opal-security.md`). Reserve `index.md` only for folder index routes. Avoid spaces and other unsafe route characters.
- **Enforcer:** `check.filenamePattern` in `wiki.yaml` (warning by default). Route safety (spaces, unsafe URL characters) always fails as an error.

### Internal links
- **Rule:** Prefer standard Markdown links to other vault pages (`Page_Name.md`). GFM relative links and Obsidian-style `[[slug]]` wikilinks also resolve when valid. Ensure internal links point at existing documents.
- **Enforcer:** `check.brokenLinks` (warning by default) — wikilinks, markdown page links, heading fragments, assets, and `wiki:` CURIEs in frontmatter and microdata.

### Style guidelines
- **Rule:** Use sentence-case headings (capitalize only the first word and proper nouns). Avoid numbered headings; keep headings concise and clear.
- **Rule:** Avoid using horizontal rules (`---`) for thematic breaks within page bodies.
- **Enforcer:** `check.headings` (off by default; set to `warning` or `error` in `wiki.yaml`).

### Markdown flavor
- **Rule:** When `markdownFlavor: gfm`, use Markdown links instead of `[[wikilinks]]`. Use `markdownFlavor: obsidian` if the vault is authored for Obsidian wikilinks.
- **Enforcer:** `check.markdownFlavor` (off by default).

---

## Developer notes

### Running validations
Before submitting commits, verify your changes against the active schema and guidelines:
```bash
# Run unified check (SHACL + hygiene; strict elevates warnings)
wiki check

# Run with verbose output to see warnings
wiki check -v

# Run with strict mode (warnings become errors and fail CI)
wiki check --strict
```

CI also runs `wiki fmt --check` (formatting) and `wiki render --check` (stale SPARQL blocks); those are separate from `wiki check`.
