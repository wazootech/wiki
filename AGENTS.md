# Agent Guidelines

Welcome! This document outlines the style, hygiene, and design guidelines for managing and contributing to this wiki. These guidelines are enforced by the Deno/TypeScript Wiki CLI: `fmt` (mechanical Markdown), `check` (integrity), and `lint` (conventions). Canonical wiki-authoring detail lives in the wiki [Style Guide](docs/wiki/Style_Guide.md).

This repository dogfoods the docs wiki at `docs/wiki.yml` (`docs/wiki/`). Use **`-c docs/wiki.yml`** on wiki commands here so local runs match CI.

### Product naming

- **Wiki** — overall product name in prose (docs, skills, CHANGELOG).
- **Wiki CLI** — specifically for the command-line interface (`wiki` command).
- **Deno API** — the in-process TypeScript API exported from `src/wiki/mod.ts` and published as `@wazoo/wiki`.
- **`wiki`** — the command and subcommands (`wiki fmt`, `wiki check`, …). Use for PATH checks, install verification, and shell examples.
- **`wazootech-wiki`** — the npm and PyPI package name. Both preserve the `wiki` executable and need no separately installed Deno: npm bundles a Deno runtime plus the engine source (and needs no Python), and PyPI embeds the `deno compile` standalone binary in per-platform wheels. The npm package ships the command only; see [TypeScript bindings](#typescript-bindings) for why there is no library API. The PyPI package adds a thin subprocess API; see [Python binding](#python-binding).
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

- **Rule:** After editing any wiki page under `docs/wiki/` (including reference docs such as [Wiki Configuration](docs/wiki/Wiki_Configuration.md)), run `wiki fmt` on the changed files before commit. Do not hand-align Markdown tables or list spacing — the Deno formatter owns mechanical layout; CI fails on drift.
- **Enforcer:** `wiki fmt --check` in CI (same order as [wiki lint](docs/wiki/wiki_lint.md): fmt → lint → check).

## Developer notes

### Scope boundaries

Wiki CLI aims to be a one-stop semantic Markdown wiki toolchain, similar in spirit to Go/Deno-style batteries-included tooling for its domain. Keep core scope focused on trust (`check`, `lint`, `fmt`), intelligence (`query`, `render`, `export`), and publish/preview (`build`, `serve`) workflows: graph construction, SHACL and JSON Schema validation, RDF/JSON-LD export, SPARQL query/render workflows, static HTML build, local preview, and CI-friendly checks.

Before adding a subcommand, ask whether it strengthens the semantic Markdown wiki toolchain. If it belongs to validation, graph construction, RDF/JSON-LD/SPARQL interoperability, static publishing, local preview, or CI-friendly checks, it may belong in Wiki CLI. If it is generic authoring, Obsidian app control, vault search, daily notes, task/tag dashboards, sync, history, PDF/print conversion, or generic file/process automation, use or document existing primitives instead.

Guarded semantic writes are in scope (#353): operations whose meaning depends on the wiki's semantics — creating a page of a known type, setting a typed frontmatter field, patching a heading section, moving or deleting a page with its inbound links — validated against shapes, routes, and the link graph before anything is written. They share one core (`Wiki.edit()`, #355) that the CLI verbs, `wiki mcp` (#356), and any later adapter wrap. Blind file writes, app-control verbs, and Git commits stay out: the CLI never commits.

Do not add Wiki CLI features that duplicate existing primitives unless there is a clear semantic-wiki reason:

- Use Obsidian CLI or Obsidian plugins for app/vault authoring workflows: daily notes, append/read current note, templates, task lists, tags, tag dashboards, vault search, plugin reload, DevTools, screenshots, DOM/CSS inspection, and sync.
- Use shell tools for generic file operations, printing, process composition, text filtering, and one-off automation.
- Use Git for history, diff, branching, sync, and collaboration workflows.
- Use Pandoc or dedicated document tools for PDF/print/export formats outside Wiki CLI's semantic RDF/static HTML outputs.
- Use static-site templates or downstream apps for custom publish surfaces; Wiki CLI owns the artifact contract, not every frontend.

Compatibility is allowed at the edges. Wiki CLI may parse, validate, preserve, and render Obsidian-authored Markdown, including wikilinks, but should not become an Obsidian automation layer. Prefer standard Markdown links in this docs wiki.

### TypeScript bindings

The npm package preserves the `wazootech-wiki` name and the `wiki` executable, and ships **no library API** — the CLI is its only interface. TypeScript callers embed `src/wiki/mod.ts` in process instead. Do not reintroduce a `Wiki` wrapper class: the engine is Deno-only, so any npm wrapper can do no more than spawn the CLI and return an exit code plus captured text, which is strictly weaker than the typed in-process results. Do not introduce a Python subprocess or require users to install Deno separately.

The npm runtime is delivered through the `deno` npm dependency and the TypeScript engine files included in the package. When changing `src/runtime.ts` or `bin/wiki.js`, keep them aligned and run `npm run test:npm`. Verify the packed tarball's CLI path in CI with system Python blocked.

Python is served by the binding below. Other languages that cannot embed JavaScript would be served by generated clients over the command, derived from the JSON Schema it already emits; that codegen is not built yet, so do not assume such a package exists.

### Python binding

`wazootech-wiki` on PyPI (from 0.2.0) ships the Wiki CLI as a native binary, the way ruff and uv do, not an engine port. `scripts/build_wheel.py` wraps each `deno compile` target's standalone binary in a `py3-none-<platform>` wheel, under `.data/scripts/`, so pip installs it as `wiki` with no Python in the hot path; it refuses a binary whose architecture or platform floor (glibc symbol versions, macOS `LC_BUILD_VERSION`) does not match the tag. Its `TARGETS` must match the `build-standalone` matrix in `release.yml`. `python/wiki/` is the typed API that finds and runs that binary, plus a `py3-none-any` fallback wheel (`--pure`) whose `wiki` console script runs a standalone `wazootech-wiki` from `PATH`, never `wiki` itself. The launcher's process handling mirrors `bin/wiki.js`: when changing signal forwarding or exit codes in one, change `python/wiki/__main__.py` or `bin/wiki.js` to match. `wiki upgrade` recognizes a pip-installed binary through the dist-info `RECORD` (`isPypiInstall` in `src/wiki/upgrade.ts`) and defers to pip, as it does to npm. CPython cannot embed Deno, so the Python API is subprocess-only; do not port engine logic to Python. `python/tests/` runs only against an installed wheel (build it with `scripts/build_wheel.py`, install it into a clean venv, then `python -m unittest discover -s python/tests`), because the failures it guards against (#316) cannot be seen from the source tree.

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

The Deno `Wiki` API is the in-process library surface; the npm package exposes the runtime/bootstrap API (src/runtime.ts) that bundles and runs the Deno-based CLI; the previous class-based Node.js SDK was removed. Unit tests target the Deno engine under `tests/`, and the npm package/API checks are under `tests/npm/`.

### Deploy configuration

- Platform: GitHub Pages
- Production URL: https://wiki.wazoo.dev
- Deploy workflow: `.github/workflows/deploy.yml`
- Verification: after landing docs/site changes, wait for the **Deploy Wiki to Pages** workflow and verify the production URL loads.

### Release workflow

A release is cut by pushing a `v<VERSION>` tag after updating the shared version surfaces: `package.json`, `package-lock.json`, `deno.json`, `pyproject.toml`, `src/wiki/version.ts`, and `docs/wiki/wiki.md`. `tests/version_test.ts` checks their agreement. Update `CHANGELOG.md`, regenerate docs SPARQL blocks with `deno run -A src/wiki/cli.ts -c docs/wiki.yml render`, format and validate the docs wiki, then tag the version.

`@wazoo/wiki` is registered on JSR and linked to `wazootech/wiki`, so the GitHub OIDC publish works. `.github/workflows/publish-jsr.yml` publishes the version that reaches `main`, after the `CI` workflow succeeds on that commit; a tag is not required, and a `main` push whose version is already on JSR is a no-op. It is gated on the repository variable `JSR_PUBLISH_ENABLED=true`. `.github/workflows/release.yml` runs on a `v<VERSION>` tag and verifies versions, builds the Deno standalone binaries for all six `deno compile` targets, then publishes the GitHub Release assets and `wazootech-wiki` to npm with provenance and to PyPI through Trusted Publishing. The PyPI wheels are built from the published release assets after `SHA256SUMS` verifies them, so a wheel never ships before, or differently from, its release binary. The platform wheels upload before the binary-less fallback, so an index caught mid-upload never lists the fallback alone (#347). The PyPI job is gated on the repository variable `PYPI_PUBLISH_ENABLED=true` and on a `pypi` environment trusted by the PyPI project. Do not publish packages by hand.

### Config schema changes

When changing `wiki.yaml` schema or rejecting invalid keys:

- **Fail fast** with allowlist validation (`unknown top-level keys`, `Invalid wiki keys`, etc.).
- **Do not** add per-key rename hints in error messages (e.g. "`input_dirs` → use `wiki.input_dirs`"). These tables are bloat, drift from the schema, and often suggest wrong mappings.
- **Do not** add `wiki config migrate`, batched alias tables, or other backwards-compat loaders unless the user explicitly requests migration support.
- **Do** document breaking moves in `CHANGELOG.md` (Migration section) and [Wiki Configuration](docs/wiki/Wiki_Configuration.md).

Upgrade narrative belongs in docs and release notes, not in runtime error strings. **After editing `Wiki_Configuration.md`, run `wiki -c docs/wiki.yml fmt` on that file** (tables and long sections drift easily).

### Architecture

See [CONTEXT.md](CONTEXT.md) for domain language and [Wiki Configuration](docs/wiki/Wiki_Configuration.md) for config semantics (`check` vs `lint` vs `fmt`).
