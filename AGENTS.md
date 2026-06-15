# Agent Guidelines

Welcome! This document outlines the style, hygiene, and design guidelines for managing and contributing to this wiki. These guidelines are enforced by `wiki fmt` (mechanical markdown), `wiki check` (integrity), and `wiki lint` (conventions) in the Wiki CLI (`wazootech-wiki` on PyPI). Canonical wiki-authoring detail lives in the wiki [Style Guide](docs/wiki/Style_Guide.md).

This repository dogfoods the docs wiki at `docs/wiki.yml` (`docs/wiki/`). Use **`-c docs/wiki.yml`** on wiki commands here so local runs match CI.

### Product naming
- **Wiki CLI** — product name in prose (docs, skills, CHANGELOG, user-facing CLI strings).
- **`wiki`** — the command and subcommands (`wiki fmt`, `wiki check`, …). Use for PATH checks, install verification, and shell examples.
- **`wazootech-wiki`** — Package name on PyPI and NPM.
- **Do not** write `wiki-cli` in user-facing text. Keep hyphenated forms only where they are literal identifiers (repo slugs, URL paths, test fixtures, `wiki:` CURIEs).

## Wiki rules

### Clean filenames
- **Rule:** Default user-facing examples should prefer **Wikipedia-style** filenames for ordinary pages (e.g., `Opal_Security.md`, `Gregory_Davidson.md`) — preserved capitalization and underscores. Do not default to lowercase kebab-case (`opal-security.md`). Reserve `index.md` only for folder index routes. Avoid spaces and other unsafe route characters.
- **Enforcer:** `lint.filename_pattern` in `wiki.yaml` (warning by default). Route safety (spaces, unsafe URL characters) always fails as an error in `wiki check`.

### Internal links
- **Rule:** Use standard Markdown links to other wiki pages (`Page_Name.md`). GFM relative links are also accepted. Do not use Obsidian-style `[[slug]]` wikilinks in this wiki. Ensure internal links point at existing documents.
- **Enforcer:** `lint.broken_links` (warning by default) — wikilinks, markdown page links, heading fragments, assets, and `wiki:` CURIEs in frontmatter and microdata. `lint.link_style` (warning by default) flags wikilinks in body prose when `link.style` is `standard`. Repair with `wiki link --fix-broken`; suggest missing links with `wiki link` / `wiki link --apply` (separate from check/lint — see [Design Philosophies](docs/wiki/Design_Philosophies.md)).

### Style guidelines
- **Rule:** Use ATX `#` headings only (no Setext underlines); wiki tooling does not index underlined headings for title, TOC, or fragment links.
- **Rule:** Use title-case H1 headings (page title; align with `headline` frontmatter). Use sentence-case H2+ headings (capitalize only the first word and proper nouns). Avoid numbered headings; keep headings concise and clear.
- **Rule:** Avoid using horizontal rules (`---`) for thematic breaks within page bodies.
- **Enforcer:** `wiki fmt` converts Setext underlines to ATX `#` headings. `lint.headings` (off by default; set to `warning` or `error` in `wiki.yaml`) flags sentence-case H2+ and numbered headings — not ATX syntax.

### Markdown flavor
Use Markdown links for all internal and external URLs.

### Formatting (`wiki fmt`)
- **Rule:** After editing any wiki page under `docs/wiki/` (including reference docs such as [Wiki Configuration](docs/wiki/Wiki_Configuration.md)), run `wiki fmt` on the changed files before commit. Do not hand-align markdown tables or list spacing — mdformat owns mechanical layout; CI fails on drift.
- **Enforcer:** `wiki fmt --check` in CI (same order as [Wiki Subcommand lint](docs/wiki/Wiki_Subcommand_lint.md): fmt → lint → check).

---

## Developer notes

### Running validations
Before submitting commits, format the wiki and verify against the active schema and guidelines. In this repo, mirror CI:

```bash
# 0. Python static analysis (requires dev deps)
uv sync --group dev
uv run ruff check .

# 1. Format (apply, then verify)
wiki -c docs/wiki.yml fmt
wiki -c docs/wiki.yml fmt --check

# 2. Conventions: broken links, filename pattern, headings, link style
wiki -c docs/wiki.yml lint --strict

# 3. Integrity: SHACL, JSON Schema frontmatter, route safety, layout frontmatter
wiki -c docs/wiki.yml check --strict

# 4. Stale inline SPARQL result blocks
wiki -c docs/wiki.yml render --check

# Verbose output
wiki -c docs/wiki.yml check -v
wiki -c docs/wiki.yml lint -v
```

`wiki link` is **report-only by default** — it lists missing wikilink opportunities but does not write files or fail the build. Run it manually before commit (`wiki link --apply` to insert suggestions); CI gates link hygiene only if `wiki link --check` is wired in.

For library-level validation and build in Python (without subprocess), see [Wiki Programmatic API](docs/wiki/Wiki_Programmatic_API.md). Unit tests target `Workspace`, `AuditReport`, and `build_workspace` directly under `tests/`.

### Config schema changes

When changing `wiki.yaml` schema or rejecting invalid keys:

- **Fail fast** with allowlist validation (`unknown top-level keys`, `Invalid wiki keys`, etc.).
- **Do not** add per-key rename hints in error messages (e.g. "`input_dirs` → use `wiki.input_dirs`"). These tables are bloat, drift from the schema, and often suggest wrong mappings.
- **Do not** add `wiki config migrate`, batched alias tables, or other backwards-compat loaders unless the user explicitly requests migration support.
- **Do** document breaking moves in `CHANGELOG.md` (Migration section) and [Wiki Configuration](docs/wiki/Wiki_Configuration.md).

Upgrade narrative belongs in docs and release notes, not in runtime error strings. **After editing `Wiki_Configuration.md`, run `wiki -c docs/wiki.yml fmt` on that file** (tables and long sections drift easily).

### Architecture
See [CONTEXT.md](CONTEXT.md) for domain language and [Wiki Configuration](docs/wiki/Wiki_Configuration.md) for config semantics (`check` vs `lint` vs `fmt`).
