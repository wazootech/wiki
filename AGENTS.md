# Agent Guidelines

Welcome! This document outlines the style, hygiene, and design guidelines for managing and contributing to this wiki. These guidelines are enforced by the Deno/TypeScript Wiki CLI: `fmt` (mechanical Markdown), `check` (integrity), and `lint` (conventions). Canonical wiki-authoring detail lives in the wiki [Style Guide](docs/wiki/Style_Guide.md).

This repository dogfoods the docs wiki at `docs/wiki.yml` (`docs/wiki/`). Use **`-c docs/wiki.yml`** on wiki commands here so local runs match CI.

### Product naming

- **Wiki** — overall product name in prose (docs, skills, CHANGELOG).
- **Wiki CLI** — specifically for the command-line interface (`wiki` command).
- **Deno API** — the in-process TypeScript API exported from `src/wiki/mod.ts` and published as `@wazoo/wiki`.
- **`wiki`** — the command and subcommands (`wiki fmt`, `wiki check`, …). Use for PATH checks, install verification, and shell examples.
- **`wazootech-wiki`** — the npm package name. It preserves the `wiki` executable and CommonJS, ESM, and TypeScript SDK entry points; its bundled Deno runtime means consumers need neither system Python nor a separately installed Deno.
- **Do not** write `wiki-cli` in user-facing text. Keep hyphenated forms only where they are literal identifiers (repo slugs, URL paths, test fixtures, `wiki:` CURIEs).

## Wiki rules

### Clean filenames

- **Rule:** Default user-facing examples should prefer **Wikipedia-style** filenames for ordinary pages (e.g., `Opal_Security.md`, `Gregory_Davidson.md`) — preserved capitalization and underscores. Do not default to lowercase kebab-case (`opal-security.md`). Reserve `index.md` only for folder index routes. Avoid spaces and other unsafe route characters.
- **Enforcer:** `lint.filename_pattern` in `wiki.yaml` (warning by default). Route safety (spaces, unsafe URL characters) always fails as an error in `wiki check`.

### Placeholder names

- **Rule:** When writing example wiki pages or fixtures that need placeholder
  people, default to **"Ethan"**, **"Gregory"**, and **"Sandra"** — not
  "Alice", "Ben", "Chad", or similar generic names.
- **Enforcer:** none — naming convention only, mirroring the workspace root
  AGENTS.md.

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

- **Rule:** After editing any wiki page under `docs/wiki/` (including reference docs such as [Wiki Configuration](docs/wiki/Wiki_Configuration.md)), run `wiki fmt` on the changed files before commit. Do not hand-align Markdown tables or list spacing — the Deno formatter owns mechanical layout; CI fails on drift.
- **Enforcer:** `wiki fmt --check` in CI (same order as [wiki lint](docs/wiki/wiki_lint.md): fmt → lint → check).

## Developer notes

### Scope boundaries

Wiki CLI aims to be a one-stop semantic Markdown wiki toolchain, similar in spirit to Go/Deno-style batteries-included tooling for its domain. Keep core scope focused on trust (`check`, `lint`, `fmt`), intelligence (`query`, `render`, `export`), and publish/preview (`build`, `serve`) workflows: graph construction, SHACL and JSON Schema validation, RDF/JSON-LD export, SPARQL query/render workflows, static HTML build, local preview, and CI-friendly checks.

Before adding a subcommand, ask whether it strengthens the semantic Markdown wiki toolchain. If it belongs to validation, graph construction, RDF/JSON-LD/SPARQL interoperability, static publishing, local preview, or CI-friendly checks, it may belong in Wiki CLI. If it is generic authoring, Obsidian app control, vault search, daily notes, task/tag dashboards, sync, history, PDF/print conversion, or generic file/process automation, use or document existing primitives instead.

Do not add Wiki CLI features that duplicate existing primitives unless there is a clear semantic-wiki reason:

- Use Obsidian CLI or Obsidian plugins for app/vault authoring workflows: daily notes, append/read current note, templates, task lists, tags, tag dashboards, vault search, plugin reload, DevTools, screenshots, DOM/CSS inspection, and sync.
- Use shell tools for generic file operations, printing, process composition, text filtering, and one-off automation.
- Use Git for history, diff, branching, sync, and collaboration workflows.
- Use Pandoc or dedicated document tools for PDF/print/export formats outside Wiki CLI's semantic RDF/static HTML outputs.
- Use static-site templates or downstream apps for custom publish surfaces; Wiki CLI owns the artifact contract, not every frontend.

Compatibility is allowed at the edges. Wiki CLI may parse, validate, preserve, and render Obsidian-authored Markdown, including wikilinks, but should not become an Obsidian automation layer. Prefer standard Markdown links in this docs wiki.

### TypeScript bindings

The npm package preserves the `wazootech-wiki` name, the `wiki` executable, and the CommonJS/ESM/TypeScript SDK. Its SDK and CLI run the same Deno/TypeScript engine; do not introduce a Python subprocess or require users to install Deno separately. When changing `src/wiki/cli.ts` subcommands, flags, choices, or positional arguments, update the SDK mappings in `npm/src/wiki.ts` and its types/tests in the same change. Run `npm run test:npm` before landing those changes.

The npm runtime is delivered through the `deno` npm dependency and the TypeScript engine files included in the package. Verify the packed tarball's `wiki --help` path in CI with system Python blocked; keep the runtime invocation in `npm/src/runtime.ts` and `npm/bin/wiki.js` aligned.

### Running validations

Before submitting commits, format the wiki and verify against the active schema and guidelines. In this repo, mirror CI:

```bash
deno task check
deno task lint
deno task fmt:check
deno task test

deno run -A src/wiki/cli.ts -c docs/wiki.yml fmt --check
deno run -A src/wiki/cli.ts -c docs/wiki.yml lint --strict
deno run -A src/wiki/cli.ts -c docs/wiki.yml check --strict
deno run -A src/wiki/cli.ts -c docs/wiki.yml render --check
deno run -A docs/build.ts --output-dir _site
npm run test:npm
```

`wiki link` is **report-only by default** — it lists missing wikilink opportunities but does not write files or fail the build. `wiki link --fix-broken` supports link hygiene for publishable wikis. `wiki link --apply` is optional wiki-gardening: useful when desired, but not required for validation, publishing, or Obsidian compatibility. CI gates link hygiene only if `wiki link --check` is wired in.

The Deno `Wiki` API is the in-process library surface; the npm SDK is the stable Node.js API and CLI binding. Unit tests target the Deno engine under `tests/`, and the npm package/API checks are in `npm/`.

### Deploy configuration

- Platform: GitHub Pages
- Production URL: https://wiki.wazoo.dev
- Deploy workflow: `.github/workflows/deploy.yml`
- Verification: after landing docs/site changes, wait for the **Deploy Wiki to Pages** workflow and verify the production URL loads.

### Release workflow

A release is cut by pushing a `v<VERSION>` tag after updating the shared version surfaces: `package.json`, `package-lock.json`, `deno.json`, `src/wiki/version.ts`, and `docs/wiki/wiki.md`. `tests/version_test.ts` checks their agreement. Update `CHANGELOG.md`, regenerate docs SPARQL blocks with `deno run -A src/wiki/cli.ts -c docs/wiki.yml render`, format and validate the docs wiki, then tag the version.

Before the first release, create `@wazoo/wiki` on JSR and link it to `wazootech/wiki` in JSR package settings; the release workflow uses GitHub OIDC and cannot publish until that link exists. `.github/workflows/release.yml` verifies versions, dry-runs the JSR package contents, builds Deno standalone binaries, then publishes JSR, GitHub Release assets, and `wazootech-wiki` to npm with provenance. The workflow no longer publishes a Python package to PyPI. Do not publish packages by hand.

### Config schema changes

When changing `wiki.yaml` schema or rejecting invalid keys:

- **Fail fast** with allowlist validation (`unknown top-level keys`, `Invalid wiki keys`, etc.).
- **Do not** add per-key rename hints in error messages (e.g. "`input_dirs` → use `wiki.input_dirs`"). These tables are bloat, drift from the schema, and often suggest wrong mappings.
- **Do not** add `wiki config migrate`, batched alias tables, or other backwards-compat loaders unless the user explicitly requests migration support.
- **Do** document breaking moves in `CHANGELOG.md` (Migration section) and [Wiki Configuration](docs/wiki/Wiki_Configuration.md).

Upgrade narrative belongs in docs and release notes, not in runtime error strings. **After editing `Wiki_Configuration.md`, run `wiki -c docs/wiki.yml fmt` on that file** (tables and long sections drift easily).

### Architecture

See [CONTEXT.md](CONTEXT.md) for domain language and [Wiki Configuration](docs/wiki/Wiki_Configuration.md) for config semantics (`check` vs `lint` vs `fmt`).