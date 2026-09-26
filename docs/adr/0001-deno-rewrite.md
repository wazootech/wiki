# ADR 0001: Rewrite the wiki engine in Deno/TypeScript

- **Status:** Accepted
- **Date:** 2026-09-23
- **Supersedes:** [#44 — Strategy: keep the Python CLI core; add TypeScript only at the edges](https://github.com/wazootech/wiki/issues/44)
- **Tracking issue:** [#273](https://github.com/wazootech/wiki/issues/273)
- **Evidence:** [`spike-reasoning/DECISION.md`](../../spike-reasoning/DECISION.md) and the goldens beside it

## Context

[#44](https://github.com/wazootech/wiki/issues/44) decided against a full TypeScript rewrite and named the conditions that would make one worth revisiting: a concrete npm-only distribution requirement, a web-first product, or Python maintenance pain that outweighs the RDF ecosystem advantage.

Two of those conditions have now been met, and one supporting fact changed:

1. **The two hardest subsystems already exist in the org as Deno packages.** `@wazoo/sparql-engine` ships SPARQL 1.1/1.2 query and update over RDF/JS quad stores with W3C evaluation-suite parity, plus Turtle parse. `@wazoo/linked-markdown` ports the same frontmatter parser the Python core depends on. #44 assumed these would have to be assembled from a fragmented ecosystem; they already exist. (The RDF *IO* surface beyond Turtle is thinner than this paragraph originally claimed — see the phase-5 probe in the dependency table below.)
2. **The npm distribution requirement remains concrete.** The original npm package required Python 3.12, a private virtual environment, and the PyPI distribution; it did not provide an independent JavaScript-native toolchain. The Deno cutover therefore retains the existing npm name, `wiki` executable, CJS/ESM/type exports, and TypeScript SDK while replacing the Python bootstrap with the bundled Deno runtime and the packaged TypeScript engine. See [Distribution](#distribution) below.
3. **The reasoning engine question is settled empirically.** A spike (`spike-reasoning/`) compared the candidate engine against `owlrl` on both the micro OWL2RL fixture suite and the 402-triple docs wiki. All 10 semantic checks pass; the two apparent failures are representation differences (structured `Inconsistency` reports rather than `owl:Nothing` typing), and every Python-only triple is boilerplate — `owl:sameAs` self-loops, datatype declarations, list-skolem rebnodes. On the docs wiki the candidate is *more* complete than `owlrl`, deriving correct `rdfs:subClassOf` closures that `owlrl` missed. A Linux x64 binary compiled with Deno 2.9.6 and `--node-modules-dir=none` measured about 158 MiB and passed `--help` plus the docs wiki's strict integrity check.

## Decision

Rewrite the engine in Deno/TypeScript over RDF/JS, mirroring the Python module layout, and cut over hard in a single pull request rather than dual-running two engines.

### Locked decisions

- **In-toolchain site/build/serve.** No Vite or other external build carve-out for `site/`, `build`, and `serve`.
- **Formatter is `dprint-plugin-markdown`, run in process.** This overrides open decision #2 in #273, which recommended porting `mdformat` instead, and it supersedes the `deno fmt` subprocess recorded in earlier drafts of this ADR. `deno fmt` *was* this plugin — but only under `deno run`: that route needs `Deno.execPath()` to be a Deno interpreter, and inside a `deno compile` standalone it is the binary itself, with `denort` carrying none of the tooling subcommands. Compiled binaries being a supported install path, the plugin is loaded directly through `@dprint/formatter` instead.
- **Validation parity is spec-close, not byte-identical.** The differential harness compares exit code plus *normalised* stdout/stderr, and compares normalized output-tree digests for mutating commands. Known-difference transcripts are committed as fixtures rather than chased to byte parity.
- **Hard cutover in one PR.** No dual-publish, no long-lived transition branch on `main`.

### Compatibility boundary

The Python implementation is an oracle for supported core behavior, not a requirement to recreate every Python capability or byte-level output. Keep the wiki data model, configuration semantics, and core workflows correct; an optional capability may be deferred when the TypeScript stack does not support it, provided the omission is listed here, rejected with a clear error, and never silently substituted with another format. For RDF exports that are supported, compare graph meaning rather than requiring identical serializer bytes.

### Dependency swaps

| Python | Deno/TypeScript | Notes |
|---|---|---|
| `rdflib` — store, terms, SPARQL | `@wazoo/sparql-engine` | Spike-verified at `jsr:@wazoo/sparql-engine@0.4.2` |
| `rdflib` — RDF *IO* | `@zazuko/env-node` + `n3.js` + `jsonld` (+ `@wazoo/sparql-engine/parser`) | **Split during the port**, because the store's IO coverage is one format deep: it parses Turtle only, and `@zazuko/env-node`'s Turtle serializer emits N-Triples. `@zazuko/env-node` supplies N-Triples/N-Quads/JSON-LD parse+write and all seven parse formats; `n3.js` supplies real Turtle/N3/TriG output; `jsonld@9.0.0` supplies JSON-LD flattening/compaction. RDF/XML parsing remains supported; RDF/XML serialization is deliberately deferred from the initial TypeScript cutover and fails explicitly until its follow-up ([evidence](../../probes/rdf-io/FINDINGS.md)). Parity is semantic; non-ASCII JSON escaping is an accepted textual difference.
| `owlrl` | `rdfjs-inference-engine` | `npm:rdfjs-inference-engine@0.2.2`; **#273 named `rdf-reasoner` — the spike replaced it**. Ported in phase 5 as a *materializer* rather than an in-place expander: the closure of a graph is `asserted ∪ getStaticClosure() ∪ infer(asserted)`, and the OWL 2 RL ruleset is baked into `src/wiki/owl2rl_rules.ts` by `scripts/bake_owl2rl_rules.ts` so `deno compile` needs no filesystem at run time. Two parity-relevant differences, both from the spike: the engine reports inconsistencies as `inconsistencies:` resources instead of typing `owl:Nothing`, and it reifies SHACL shape property lists that `owlrl` ignored (the port filters the first and keeps the second) |
| `pyshacl` | `rdf-validate-shacl@0.6.5` + `@zazuko/env` | **#273's plan added an RDFS closure pass; the phase-3 probe dropped it** — the library already resolves `sh:targetClass` over `rdfs:subClassOf*` and matches the oracle exactly without one ([evidence](../../probes/shacl-rdfs/FINDINGS.md)). Parity bar is spec-close |
| `jsonschema` | `ajv` | Draft 2020-12. **The swap is not message-compatible and `wiki check` prints these messages**, so the port keeps ajv as the engine and replaces the reporting layer: `src/wiki/json_schema.ts` renders jsonschema 4.26's wording from ajv's `keyword`/`params`/`schema`, and reconstructs jsonschema's error *order* (ajv emits `required` before `additionalProperties` regardless of key order). Compiled with `validateSchema: false`, `strict: false`, `validateFormats: false`. 63-case corpus, verdict agrees on all 63, messages byte-identical after the layer ([evidence](../../probes/json-schema/FINDINGS.md)) |
| `linked-markdown` | `@wazoo/linked-markdown` | Already exists |
| `markdown-it-py` + `pygments` | `markdown-it` | Fenced-code HTML is not syntax-highlighted in the Deno renderer; the output-tree parity case records this visible difference. |
| `mdformat` | **`dprint-plugin-markdown`** via `@dprint/formatter` | Reverses #273's recommendation; one-time docs reformat accepted. Every plugin is pinned to the exact version Deno 2.9.6 bundles, and the port's output is `deno fmt`'s output byte for byte on all 89 docs pages ([evidence](../../probes/fmt-dprint/FINDINGS.md)) |
| `jinja2` | `nunjucks` | |
| `beautifulsoup4` | `cheerio` | |
| `rich` | `@std/colors` | |
| `click` | `cliffy` | Core command behavior and exit codes are preserved; documented optional omissions are allowed |
| `pydantic` | `zod` | Strict, with ported error messages |
| `ruamel.yaml` | `yaml` | Comment-preserving |
| `mcp` | `@modelcontextprotocol/sdk` | |
| `http.server` | `Deno.serve` | |
| `difflib.SequenceMatcher` | ported | `link-fix` parity only |
| `@rdfjs/types` | `npm:@rdfjs/types@1.1.0` | Shared quad typing |

`nodeModulesDir: "auto"` became required in phase 5, when the first `npm:` dependencies landed (`@zazuko/env-node` for RDF IO, `n3` for Turtle output, `rdfjs-inference-engine` for OWL 2 RL); it is set in `deno.json` as the spike's config anticipated. It is what makes `node_modules/` appear locally — gitignored, and not a build input. `ajv` and `jsonld` are direct dependencies for validation and JSON-LD export; like the others they are plain npm packages with no Deno build step.

### Distribution

**One TypeScript engine, three delivery paths.** `@wazoo/wiki` remains the native Deno/JSR library. The existing `wazootech-wiki` npm package is retained as a compatibility contract: preserve its `wiki` executable, CommonJS/ESM/type exports, and documented TypeScript SDK methods, but replace the Python bootstrap and runner with a Deno-backed implementation. npm consumers must not need system Python or a separate Deno installation; the package provisions the official Deno runtime and runs the packaged engine source. Deno-native users can use the JSR package. Users who need no package manager can download a `deno compile` binary.

The npm package is not a second engine: `src/wiki/` remains the single implementation, included with the npm package's Deno manifest and lockfile. The npm JavaScript/TypeScript layer translates its established API calls into Deno CLI invocations and preserves the current result/error/process behavior. Release versions are synchronized across `deno.json`, the npm package/lockfile, the CLI version constant, and the docs metadata; PyPI is retired.

The Python oracle is pinned at `1bfb422` and kept only in a detached local worktree while the cutover is validated. The cutover PR removes Python engine, tests, packaging, CI/release paths, and the Python docs builder only after the pinned differential suite and mutating-output checks pass. The authored Markdown wiki and its custom Wikipedia theme remain; the site builder is replaced with Deno/TypeScript rather than dropping those behaviors.

- **The library surface is `@wazoo/wiki`.** Deno users can import the package from JSR. The existing `wazootech-wiki` npm name remains installable and keeps its Node-facing SDK and `wiki` binary.
- **The npm `wiki` command is Deno-backed.** It uses the Deno runtime distributed through npm and the Deno engine files packaged with the npm package. Python and a separately installed Deno runtime are not prerequisites.
- **`deno compile` binaries remain a supported install path.** Self-contained executables for Linux x64/arm64, Windows x64/arm64, and macOS x64/arm64 are published on GitHub Releases with `SHA256SUMS`. The release build uses `--node-modules-dir=none --exclude-unused-npm` to embed engine dependencies without the local development tree.
- **Release publication is one versioned cutover.** JSR, npm, and GitHub Release artifacts use the same `vX.Y.Z`; PyPI publishing and PyInstaller are removed. The release workflow keeps its canonical `.github/workflows/release.yml` path for npm trusted publishing.

### Oracle and transition discipline

- The Python CLI was the oracle until the parity gate. The verified pinned differential suite has 21 cases: 14 pass, 7 documented known differences, 0 pending, and 0 failures. Mutating commands compare normalized output-tree digests.
- The oracle is pinned at `1bfb422` — the `fmt-bom-tolerance` tip (#312), one commit ahead of `main` at `ffdc1b0`. The rewrite branch is based on it. #312 merges to `main` on its own so that the rewrite eventually rebases onto a true `main` without carrying an unrelated fix inside a 10k-line diff.
- The pinned Python checkout stays outside the PR branch as a local oracle; no Python runtime is shipped after cutover.
- Each cutover milestone is validated against the pinned Python build before the next one starts, and lands as its own commit so the eventual PR is readable by following commit order.

### Differential harness

Parity is judged by `deno task parity`, which runs the pinned oracle and the Deno CLI over shared corpora with identical argv, working directory, and inputs, then compares exit code plus normalised stdout/stderr and compares normalized tree digests for mutating cases. Three decisions shape it:

- **Normalisation is narrow and evidenced.** Only differences observed to be non-semantic are folded: line endings, ANSI escapes, a leading BOM, the scratch directory's absolute path, and trailing blank lines. A missing final newline is *not* folded, because that is a real difference. Rules that were observed but deliberately left off — Windows path separators in file lists, and `rich` table padding — are recorded in `parity/README.md` rather than guessed at, so they can be switched on when a case actually needs them.
- **Every case declares how its divergence is accounted for.** `parity` cases must match the oracle; `known` cases must match a committed transcript on *both* sides; `pending` cases must **not** match — a command that starts agreeing without being promoted to `parity` fails the run. Silent progress is how a gate rots, and "this command now matches the oracle" is precisely the event worth reading in a diff.
- **Each case runs in a fresh copy of its corpus, re-staged between the two runs.** Both CLIs see byte-identical inputs at an identical absolute path, so mutating commands (`fmt`, `render`, `build`) are safe to compare and case order cannot matter.

Two corpora pull in opposite directions: `micro` is hand-written and deliberately dirty (broken link, wikilink under `link.style: standard`, stale SPARQL blocks, a shape violation, a filename-pattern violation) so that commands must compare non-empty findings; `docs` is this repository's own clean wiki, where the target for four commands is silence and exit 0.

The harness earned its keep on its first run. The scaffold assumed Click printed a two-line usage for an empty argv; the oracle prints the full group help. That divergence is now tracked as the `usage-no-command` case rather than living as a wrong comment in `cli.ts`.

## Consequences

### Runtime and tooling layout after cutover

The rewrite is complete. `src/wiki/` is the sole engine; the Python source, tests, packaging, and docs builder were removed from the repository. A detached Python checkout exists only as a local differential oracle while the cutover is reviewed. Deno users run the JSR package, npm users keep the `wazootech-wiki` package and `wiki` executable, and standalone users get self-contained `deno compile` binaries. The npm adapter invokes the same TypeScript engine rather than maintaining a second implementation.

- `eslint.config.mjs` ignores `src/**`; `tsconfig.json` includes only `npm/src/**/*.ts`, keeping Node SDK tooling separate from the Deno engine.
- `deno.json` scopes source formatting and linting to TypeScript source, tests, and tooling. The authored `docs/wiki/` corpus uses the Wiki formatter and is validated through the CLI in CI.
- `docs/build.ts` preserves the repository's Wikipedia-themed Pages site, while the generic CLI owns `build` and `serve` for user wikis.

### Deleted at cutover

`src/wiki/*.py`, `tests/*.py`, `pyproject.toml`, `uv.lock`, `wiki.spec`, the PyInstaller scripts, Sphinx and Python API docs, the Python docs builder, and Python-only CLI/type-generation helpers are deleted or replaced with Deno/TypeScript equivalents. The npm package itself is **not** deleted: its public name, `wiki` binary, CJS/ESM/type exports, and TypeScript SDK remain, but the venv setup, PyPI install, Python subprocess, and Python-specific drift pipeline are removed. Replacements are `deno.json` + `deno.lock`, the JSR package `@wazoo/wiki`, the Deno-backed `wazootech-wiki` npm package, TypeDoc/Deno API docs, per-platform `deno compile` binaries, and TypeScript release/build tooling. Authored docs under `docs/wiki/` and the Wikipedia theme are retained and updated to the new runtime.

### Risks and known differences

- **Formatter semantics differ from `mdformat`.** The docs were reformatted once with the Deno formatter and that formatting is now the CI contract. The pinned oracle's `mdformat` check still flags `Dataview_Integration.md`, while Deno reports the 89-page docs corpus clean; `fmt-check-docs` records that deliberate formatter transition. The shielding layer this entry originally promised was probed away in phase 7: frontmatter, `<!-- sparql:start -->` blocks, wikilinks, `%wiki.*%` tokens, and GFM alignment survive the Deno formatter without shielding.
- **Three fence tags are unreachable from the WASM plugin, one in each direction.** `deno fmt` calls the plugin's *library* and chooses which fence tags reach a host formatter; the WASM build filters tags itself in `wasm_plugin.rs`'s `tag_to_extension` before any callback runs, and the two tables disagree. `cjs`, `cts`, `mjs` and `mts` are in deno's list and not in the plugin's, so fences tagged with them are no longer reformatted as TypeScript — no page in either wiki tree uses one. `html` is in deno's list and not in the plugin's, so deno's `lax-markup` arm is unreachable; `src/wiki/formatter.ts` formats those four fences in a post-pass instead. The reverse direction matters more: `xml`, `toml`, `py` and friends *are* reachable through the plugin, so the dispatcher refuses them explicitly rather than letting a registered formatter restyle fences `deno fmt` left alone. Both directions are asserted in `tests/formatter_test.ts`.
- **SHACL report text differs from `pyshacl`.** Mitigated by the spec-close bar and committed transcripts. What the port reproduces is the *skeleton* — same header, same labels, same tab indentation, and the same rule that a line is printed only when it has a value — while terms render as N-Triples instead of `rdflib`'s `__str__` (`owl:sameAs <self>`, `Literal("1", datatype=xsd:integer)`). A diff between the two is therefore confined to term syntax, and the parity harness carries `check` as a `known` case.
- **The pre-commit hook checks only staged TypeScript under `npm/` with Prettier.** The Deno engine and authored docs follow their own formatters.
- **Two dependency manifests serve different consumers.** `deno.json` and `deno.lock` pin the Deno engine's imports; `package.json` and `package-lock.json` preserve the npm SDK and deliver Deno to npm users. Local development uses `node_modules/auto`, but standalone builds use `--node-modules-dir=none --exclude-unused-npm` so the repository's development dependencies are not embedded in release binaries.
- **OWL 2 RL closure is not triple-identical to `owlrl`'s.** Known and accepted at phase 5: inconsistency *reports* are not materialized as `owl:Nothing` typing, and the engine's extra SHACL reifications are kept (dropping them would be a silent semantic edit to `check`). Both are filtered-or-kept explicitly in one module (`infer.ts`) so the parity gate can flip either decision without touching a caller.
- **Paths compare by component, not by string.** `pathlib`'s `PurePath.__lt__` compares `_parts_normcase`, so `notes/inner.md` sorts before `notes.md` — a string comparison disagrees, and the difference reaches the fingerprint's SHA-256 through the manifest order. Fixed in phase 5 (`sortPaths`) after an oracle probe showed the port ordering a fixture differently from CPython 3.12; the fixture's digest is now pinned in `tests/graph_cache_test.ts`.
- **Windows line endings.** Python's Click writes CRLF to a redirected stdout; `console.log` writes LF. This is exactly why the harness normalises rather than comparing bytes.
- **Committed goldens are LF-normalised.** `.gitattributes` sets `* text=auto eol=lf`, so the `.nt` goldens under `spike-reasoning/goldens/` — written with CRLF by `rdflib` on Windows — are stored as LF. The harness must normalise line endings when *reading goldens*, not only when comparing CLI output, or a fresh clone will disagree with the machine that produced them.

### Deferred

- **RDF/XML serialization.** The initial TypeScript cutover keeps RDF/XML parsing but does not write RDF/XML from `export` or serve an RDF/XML metadata view. If those surfaces receive an XML request, they must return a clear unsupported-format error rather than substitute N-Quads or another serialization. A later RDF/XML writer can be tested for graph equivalence without requiring byte-for-byte rdflib output.


## References

- [#44](https://github.com/wazootech/wiki/issues/44) — superseded decision
- [#273](https://github.com/wazootech/wiki/issues/273) — tracking proposal
- [`CONTEXT.md`](../../CONTEXT.md) — domain language
- [`spike-reasoning/DECISION.md`](../../spike-reasoning/DECISION.md) — engine spike, fallback reasoner, and goldens
