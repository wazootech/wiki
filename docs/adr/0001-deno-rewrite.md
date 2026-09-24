# ADR 0001: Rewrite the wiki engine in Deno/TypeScript

- **Status:** Accepted
- **Date:** 2026-09-23
- **Supersedes:** [#44 — Strategy: keep the Python CLI core; add TypeScript only at the edges](https://github.com/wazootech/wiki/issues/44)
- **Tracking issue:** [#273](https://github.com/wazootech/wiki/issues/273)
- **Evidence:** [`spike-reasoning/DECISION.md`](../../spike-reasoning/DECISION.md) and the goldens beside it

## Context

[#44](https://github.com/wazootech/wiki/issues/44) decided against a full TypeScript rewrite and named the conditions that would make one worth revisiting: a concrete npm-only distribution requirement, a web-first product, or Python maintenance pain that outweighs the RDF ecosystem advantage.

Two of those conditions have now been met, and one supporting fact changed:

1. **The two hardest subsystems already exist in the org as Deno packages.** `@wazoo/sparql-engine` ships SPARQL 1.1/1.2 query and update over RDF/JS quad stores with W3C evaluation-suite parity, plus Turtle/TriG/N-Triples/N-Quads parse and serialize. `@wazoo/linked-markdown` ports the same frontmatter parser the Python core depends on. #44 assumed these would have to be assembled from a fragmented ecosystem; they already exist.
2. **The npm distribution requirement is now concrete — and no longer implies a hand-written npm package.** The published npm package is not an implementation — it locates Python 3.12+, builds a private venv, pip-installs the matching PyPI distribution, and shells out (`npm/setup.js`, `npm/python.js`, `npm/uninstall.js`). Users who want a JavaScript-native tool get a Python installer. That is the npm-only distribution requirement #44 asked for, unmet. It is met by publishing to JSR, not by re-authoring the wrapper in TypeScript: npm projects consume JSR packages through `npx jsr add` (or a native `jsr:` specifier on pnpm 10.9+, Yarn 4.9+, and vlt), which installs the package into `node_modules/@jsr` from `https://npm.jsr.io`. See [Distribution](#distribution) below.
3. **The reasoning engine question is settled empirically.** A spike (`spike-reasoning/`) compared the candidate engine against `owlrl` on both the micro OWL2RL fixture suite and the 402-triple docs wiki. All 10 semantic checks pass; the two apparent failures are representation differences (structured `Inconsistency` reports rather than `owl:Nothing` typing), and every Python-only triple is boilerplate — `owl:sameAs` self-loops, datatype declarations, list-skolem rebnodes. On the docs wiki the candidate is *more* complete than `owlrl`, deriving correct `rdfs:subClassOf` closures that `owlrl` missed. `deno compile` produces a 29 MB self-contained binary that was clean-room verified with no filesystem access.

## Decision

Rewrite the engine in Deno/TypeScript over RDF/JS, mirroring the Python module layout, and cut over hard in a single pull request rather than dual-running two engines.

### Locked decisions

- **In-toolchain site/build/serve.** No Vite or other external build carve-out for `site/`, `build`, and `serve`.
- **Formatter is `deno fmt`, invoked via `Deno.Command`.** This overrides open decision #2 in #273, which recommended porting `mdformat` instead. Recorded here because it is a deliberate reversal of the issue's own recommendation.
- **Validation parity is spec-close, not byte-identical.** The differential harness compares exit code plus *normalised* stdout/stderr; known-difference transcripts are committed as fixtures rather than chased to parity.
- **Hard cutover in one PR.** No dual-publish, no long-lived transition branch on `main`.

### Dependency swaps

| Python | Deno/TypeScript | Notes |
|---|---|---|
| `rdflib` | `@wazoo/sparql-engine` | Spike-verified at `jsr:@wazoo/sparql-engine@0.4.2` |
| `owlrl` | `rdfjs-inference-engine` | `npm:rdfjs-inference-engine@0.2.2`; **#273 named `rdf-reasoner` — the spike replaced it** |
| `pyshacl` | `rdf-validate-shacl` + RDFS closure pass | Emulates `inference="rdfs"` (`audit.py:120,137`); parity bar is spec-close |
| `jsonschema` | `ajv` | Draft 2020-12 |
| `linked-markdown` | `@wazoo/linked-markdown` | Already exists |
| `markdown-it-py` + `pygments` | `markdown-it` + `highlight.js` | |
| `mdformat` | **`deno fmt`** | Reverses #273's recommendation; one-time docs reformat accepted |
| `jinja2` | `nunjucks` | |
| `beautifulsoup4` | `cheerio` | |
| `rich` | `@std/colors` | |
| `click` | `cliffy` | CLI contract and exit codes are preserved |
| `pydantic` | `zod` | Strict, with ported error messages |
| `ruamel.yaml` | `yaml` | Comment-preserving |
| `mcp` | `@modelcontextprotocol/sdk` | |
| `http.server` | `Deno.serve` | |
| `difflib.SequenceMatcher` | ported | `link-fix` parity only |
| `@rdfjs/types` | `npm:@rdfjs/types@1.1.0` | Shared quad typing |

`nodeModulesDir: "auto"` is required once the npm-backed specs above land; it is deliberately absent from `deno.json` today, because the scaffold has no `npm:` dependency yet. The spike's config is the reference.

### Distribution

**JSR is the package; there is no hand-rolled npm package.** Earlier drafts of this plan carried "a real TypeScript npm package" as a Phase 12 deliverable, meaning a Node-shebanged wrapper re-exporting the engine. That artifact is redundant and is dropped. `deno publish` produces `@wazoo/wiki` on JSR, which npm consumers reach directly, so re-publishing the same modules under a second registry would be a second release pipeline to keep in sync for no user-visible gain.

Three consequences fix the shape of the distribution work:

- **The library surface is `@wazoo/wiki`.** An npm project adds it with `npx jsr add @wazoo/wiki`, which writes `.npmrc` with `@jsr:registry=https://npm.jsr.io` (that file is checked in). No `npm/` tree, no `tsup` build step, no `types.generated.ts` bridge.
- **The CLI is reached as a JSR module export, not as a `bin` entry.** `deno x jsr:@wazoo/wiki/cli` runs it, and `deno install -g jsr:@wazoo/wiki/cli` makes it permanent. This works because `src/wiki/cli.ts` already guards top-level execution with `import.meta.main`, so the module is executable and importable from the same file. Neither `deno pack` nor JSR's npm-compat tarball synthesises a `package.json` `bin` field, so there is no `npx wazoo-wiki` path and none is planned.
- **`deno compile` binaries stay supplementary.** They serve users with no Deno runtime at all, which the spike already proved out (29 MB, clean-room verified, no filesystem access). They are an extra artifact, not the primary install path.

### Oracle and transition discipline

- **The Python CLI stays the oracle for every behaviour until the parity gate passes.** It is compared against, not deleted.
- **The oracle is pinned at `1bfb422`** — the `fmt-bom-tolerance` tip (#312), one commit ahead of `main` at `ffdc1b0`. The rewrite branch is based on it. #312 merges to `main` on its own so that the rewrite eventually rebases onto a true `main` without carrying an unrelated fix inside a 10k-line diff.
- Every milestone is validated against the pinned Python build before the next one starts, and lands as its own commit so the eventual PR is readable by following commit order.

### Differential harness

Parity is judged by `deno task parity`, which runs the pinned oracle and the Deno CLI over shared corpora with identical argv, working directory, and inputs, then compares exit code plus normalised stdout/stderr. Three decisions shape it:

- **Normalisation is narrow and evidenced.** Only differences observed to be non-semantic are folded: line endings, ANSI escapes, a leading BOM, the scratch directory's absolute path, and trailing blank lines. A missing final newline is *not* folded, because that is a real difference. Rules that were observed but deliberately left off — Windows path separators in file lists, and `rich` table padding — are recorded in `parity/README.md` rather than guessed at, so they can be switched on when a case actually needs them.
- **Every case declares how its divergence is accounted for.** `parity` cases must match the oracle; `known` cases must match a committed transcript on *both* sides; `pending` cases must **not** match — a command that starts agreeing without being promoted to `parity` fails the run. Silent progress is how a gate rots, and "this command now matches the oracle" is precisely the event worth reading in a diff.
- **Each case runs in a fresh copy of its corpus, re-staged between the two runs.** Both CLIs see byte-identical inputs at an identical absolute path, so mutating commands (`fmt`, `render`, `build`) are safe to compare and case order cannot matter.

Two corpora pull in opposite directions: `micro` is hand-written and deliberately dirty (broken link, wikilink under `link.style: standard`, stale SPARQL blocks, a shape violation, a filename-pattern violation) so that commands must compare non-empty findings; `docs` is this repository's own clean wiki, where the target for four commands is silence and exit 0.

The harness earned its keep on its first run. The scaffold assumed Click printed a two-line usage for an empty argv; the oracle prints the full group help. That divergence is now tracked as the `usage-no-command` case rather than living as a wrong comment in `cli.ts`.

## Consequences

### Where the code lives during the port

Deno modules live in `src/wiki/` **alongside** their Python counterparts (`audit.py` → `audit.ts`), giving a 1:1 module mapping and a diff that reads as a port rather than a parallel universe. Two consequences are load-bearing:

- `eslint.config.mjs` already ignores `src/**`; `tsconfig.json` includes only `npm/src/**/*.ts`. The Deno tree therefore cannot collide with the existing Node toolchain.
- `deno.json` scopes `fmt`/`lint` to `src/**/*.ts` and `tests/**/*.ts` and excludes `docs/`, `npm/`, and `spike-reasoning/`. This is not cosmetic: an unscoped `deno fmt` would reformat the 400+ page docs wiki and break `wiki fmt --check`, which `mdformat` still owns until the formatter milestone.

### Deleted at cutover

`src/wiki/*.py`, `tests/*.py`, `wiki.spec`, `scripts/build_standalone.py` and the PyInstaller path, Sphinx API docs, the npm venv bootstrap (`npm/setup.js`, `npm/python.js`, `npm/uninstall.js`, `npm/src/runner.ts`), the PyPI release path, `uv.lock`, and `pyproject.toml`. Replaced by `deno.json` + `deno.lock`, the JSR package `@wazoo/wiki` (npm consumers reach it via `npx jsr add`; the CLI via `deno x jsr:@wazoo/wiki/cli`), typedoc, `deno compile` binaries, and a TypeScript release script. No TypeScript npm package is authored — see [Distribution](#distribution).

### Risks and known differences

- **Formatter semantics differ from `mdformat`** (prose wrapping, table alignment, frontmatter). Mitigated by accepting a one-time docs reformat plus a shielding layer, with `test_fmt` ported to `deno fmt` goldens.
- **SHACL report text differs from `pyshacl`.** Mitigated by the spec-close bar and committed transcripts.
- **`.githooks/pre-commit` runs `prettier --check` on staged `.ts`/`.md`.** The hook is dormant today (`core.hooksPath` is unset), but anyone who enables it would find it rejects `deno fmt` styling. It needs scoping to `npm/` at cutover.
- **`deno.lock` versus the legacy `package.json`.** Deno adopts the repo-root `package.json` as workspace dependencies, so `deno install` resolves the npm wrapper's devDependencies (eslint, esbuild, tsup, typedoc) into `deno.lock` and downloads them into `node_modules/`. The committed lockfile therefore pins only what the engine actually resolves (`@std`), and `deno install --frozen` is not a usable gate until `package.json` becomes the engine's own manifest at cutover.
- **Windows line endings.** Python's Click writes CRLF to a redirected stdout; `console.log` writes LF. This is exactly why the harness normalises rather than comparing bytes.
- **Committed goldens are LF-normalised.** `.gitattributes` sets `* text=auto eol=lf`, so the `.nt` goldens under `spike-reasoning/goldens/` — written with CRLF by `rdflib` on Windows — are stored as LF. The harness must normalise line endings when *reading goldens*, not only when comparing CLI output, or a fresh clone will disagree with the machine that produced them.

### Deferred

Whether the formatter drives `deno fmt - --ext md` over stdin or a temp file per page, and how `.editorconfig` interacts with it. Neither changes the shape of the plan; both are settled by the formatter probe.

## References

- [#44](https://github.com/wazootech/wiki/issues/44) — superseded decision
- [#273](https://github.com/wazootech/wiki/issues/273) — tracking proposal
- [`CONTEXT.md`](../../CONTEXT.md) — domain language
- [`spike-reasoning/DECISION.md`](../../spike-reasoning/DECISION.md) — engine spike, fallback reasoner, and goldens
