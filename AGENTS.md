# Agent guidelines

Welcome! This document outlines the style, hygiene, and design guidelines for managing and contributing to this wiki. These guidelines are enforced by the `wiki check` subcommand of the Wiki CLI.

## Vault rules

### Clean filenames
- **Rule:** Use lowercase kebab-case for all filenames (e.g., `opal-security.md`). Do not use spaces, uppercase letters, or underscores.
- **Enforcer:** `check:filenames` (Warning by default)

### Internal links
- **Rule:** Use standard WikiLinks `[[slug]]` (or `[[slug|display name]]`) for internal linking. Ensure all internal links are valid and resolve to existing documents in the wiki.
- **Enforcer:** `check:links` (Warning by default)

### Style guidelines
- **Rule:** Use sentence-case headings (capitalize only the first word and proper nouns). Please avoid numbered headings, keep headings concise and clear.
- **Rule:** Avoid using horizontal rules (`---`) for thematic breaks within the content bodies.
- **Enforcer:** `check:headings` (Disabled/Optional by default)

---

## Developer notes

### Running validations
Before submitting commits, verify your changes against the active schema and guidelines:
```bash
# Run unified check (strict validations + warnings)
wiki check

# Run with verbose output to see warnings
wiki check -v

# Run with strict mode (warnings become errors and fail CI)
wiki check --strict
```
