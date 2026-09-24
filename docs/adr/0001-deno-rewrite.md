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
2. **The npm distribution requirement is now concrete.** The published npm package is not an implementation — it locates Python 3.12+, builds a private venv, pip-installs the matching PyPI distribution, and shells out (`npm/setup.js`, `npm/python.js`, `npm/uninstall.js`). Users who want a JavaScript-native tool get a Python installer. That is the npm-only distribution requirement #44 asked for, unmet.
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

### Oracle and transition discipline

- **The Python CLI stays the oracle for every behaviour until the parity gate passes.** It is compared against, not deleted.
- **The oracle is pinned at `1bfb422`** — the `fmt-bom-tolerance` tip (#312), one commit ahead of `main` at `ffdc1b0`. The rewrite branch is based on it. #312 merges to `main` on its own so that the rewrite eventually rebases onto a true `main` without carrying an unrelated fix inside a 10k-line diff.
- Every milestone is validated against the pinned Python build before the next one starts, and lands as its own commit so the eventual PR is readable by following commit order.

## Consequences

### Where the code lives during the port

Deno modules live in `src/wiki/` **alongside** their Python counterparts (`audit.py` → `audit.ts`), giving a 1:1 module mapping and a diff that reads as a port rather than a parallel universe. Two consequences are load-bearing:

- `eslint.config.mjs` already ignores `src/**`; `tsconfig.json` includes only `npm/src/**/*.ts`. The Deno tree therefore cannot collide with the existing Node toolchain.
- `deno.json` scopes `fmt`/`lint` to `src/**/*.ts` and `tests/**/*.ts` and excludes `docs/`, `npm/`, and `spike-reasoning/`. This is not cosmetic: an unscoped `deno fmt` would reformat the 400+ page docs wiki and break `wiki fmt --check`, which `mdformat` still owns until the formatter milestone.

### Deleted at cutover

`src/wiki/*.py`, `tests/*.py`, `wiki.spec`, `scripts/build_standalone.py` and the PyInstaller path, Sphinx API docs, the npm venv bootstrap (`npm/setup.js`, `npm/python.js`, `npm/uninstall.js`, `npm/src/runner.ts`), the PyPI release path, `uv.lock`, and `pyproject.toml`. Replaced by `deno.json` + `deno.lock`, the JSR package `@wazoo/wiki`, a real TypeScript npm package, typedoc, `deno compile` binaries, and a TypeScript release script.

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
