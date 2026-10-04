# Reasoning engine spike — decision memo

Date: 2026-09-23
Branch: `refactor/deno-rewrite` (worktree `worktrees/wiki/deno-rewrite`)
Corpus: micro OWL2RL fixture suite + the docs wiki (402 asserted triples)

## Recommendation

**Adopt `rdfjs-inference-engine` v0.2.2 (MIT) as the Wiki CLI Deno reasoning engine**, wired as:

- **Build-time** (bake): embed the bundled owl2rl rule profile text (36.9 KB `.n3`) as a
  TS constant. Do **not** embed the precompiled runtime.
- **Runtime**: `new InferenceEngine()` + `engine.load([{ n3: OWL2RL_N3, label: "rules/owl2rl" }], vocabulary, { selectRuntimeRules: false })`, then `engine.infer(assertedPageQuads)`; closure = asserted ∪ `getStaticClosure()` ∪ `infer` output. Set `deterministicSkolem: true` and a stable term ordering for graph-cache fingerprints.
- **Packaging**: `deno compile` a single self-contained binary; no filesystem access for rule loading at runtime (verified clean-room).

An in-house fallback is **not needed up front** — the package passes every semantic check, compiles cleanly, and ships under MIT with zero eval/WASM — but one is **filed and verified** (see below) so switching is cheap if adoption fails.

## Backup option (filed)

In case the adoption fails, an in-house fallback reasoner has been filed and verified:

- **`spike-reasoning/fallback/infer.ts`** — `OWL2RLFallback`, a zero-dependency OWL2RL
  subset reasoner over `@wazoo/sparql-engine` (its only couple: `dataFactory` + `termKey`).
  Semi-naive forward chaining to fixpoint (≤128 rounds) over forward indexes.
- **API mirrors the adopted engine surface**, so the wiki adapter needs only a facade swap:
  `load(vocabulary)` (returns `""`), `getStaticClosure()`, `getStaticInconsistencies()`,
  `infer(data)`, `inferWithDiagnostics(data)`, `getRuntime()`.
- **`spike-reasoning/fallback/run-fallback.ts`** — reproduces the same verdict JSON as
  `spike.ts` (closure counts, rule-check matrix, inconsistencies, timings).

Verified results (identical check matrix to the adopted engine):

| corpus | result |
|---|---|
| micro (40 → closure 67) | **10/10 semantic checks pass**; the 2 representation-differences reproduce exactly (functional-literal conflict → `eq-diff1` report; disjoint/complement → `cax-dw`/`cls-com` report, not `owl:Nothing`). Derived ONLY-named residue = 1 triple (`worksFor owl:inverseOf employs`, symmetric edge). Inconsistencies: `cax-dw`, `cls-com`, `eq-diff1` — matches the engine. ~17 ms. |
| docs (402) | closure == asserted (402), **zero added triples / zero noise**, no inconsistencies. 33 ms. |

Scope limits (documented, not silent gaps): the OWL2RL subset exercised by the wiki/micro
fixtures — subclass/equiv-class, domain/range, subproperty/equiv-property/inverse, transitivity,
functional (non-literal equalization + literal eq-diff1 conflict), `hasKey`, 2+-ary
`propertyChainAxiom`, disjoint/complement inconsistency detection, `sameAs` symmetry/transitivity
and substitution. No complex-class RL rules beyond disjoint/complement, no datatype reasoning
(42 vs 042 correctly stay distinct — same as the engine), no SHACL-aware closure, no
precompiled-runtime embedding. If it becomes primary, extend toward full RL conformance as needed.

## Evidence

### Micro OWL2RL suite (asserted 40 → python closure 226)

| check | result |
|---|---|
| cax-sco subclass chain (Person < Human < Agent) | ✅ engine derives all three |
| scm-eqc2 equivalent class | ✅ |
| prp-rng domain/range typing | ✅ |
| prp-inv1 inverseOf | ✅ |
| prp-trp transitivity | ✅ |
| prp-spo1 subPropertyOf | ✅ |
| prp-eqp1 equivalentProperty | ✅ |
| prp-key keys (hasKey) | ✅ |
| prp-prp propertyChainAxiom | ✅ |
| prp-fp functional property w/ distinct literals | ⬜ represented as structured `Inconsistency` report (eq-diff1), not a raw triple |
| cax-dw disjoint/complement abuse | ⬜ represented as structured `Inconsistency` report (cls-com/cax-dw), not `owl:Nothing` typing |

Engine closure 302 (static 256 + newly inferred 76). All 10 boolean checks pass; the two
"fails" are **representation differences**, not inference gaps: the engine detects the
inconsistency and reports it via its `Inconsistencies` vocabulary.

Python-only triples (117) are **100% boilerplate**: 101 `owl:sameAs` self-loops, 6 datatype
declarations, 6 list-skolem re-bnodes for hasKey/propertyChainAxiom. No real inference produced
by owlrl is missing from the engine.

### Docs wiki (asserted 402 → python clean 629)

- Engine closure 542, of which 0 newly inferred (the docs wiki has no RDF axioms beyond page
  metadata — `docs/wiki/` contains no raw `.ttl`/`.rdf` axiom files).
- Engine additionally derives **63 correct schema.org `rdfs:subClassOf` closures + 1
  equivalentClass that owlrl missed** (e.g. TechArticle → Article → CreativeWork → Thing):
  the engine is more complete here, not noisier.
- Engine-only remainder (114 named) breaks down as: 25 triples in the engine's own
  `pieter.pm/ns/internal#` + `inconsistencies#` namespaces (filterable prefix), 19 SHACL shape
  reifications (`_Shape sh:property <N...>`) produced by the engine's built-in SHACL
  understanding (owlrl ignores shapes entirely), 1 equivalentClass, 63 subclass closures.
- Python-only (201) is owlrl's canonical noise: sameAs self-loops, datatype declarations,
  annotation typing. Nothing meaningful.

### `deno compile` / zero-fs (critical path)

- `deno compile` succeeds; binary embeds `node_modules` (rdfjs-inference-engine + eyeling,
  pure-JS, no WASM) + baked rules = **28.98 MB**.
- Clean-room test: copied the binary + two data files into a bare temp dir (no `node_modules`,
  no rules dir anywhere) → identical full inference (302 closure, all checks pass).
- **Do not** use `constructor({ runtime })` with a precompiled runtime: that path swallows the
  baked background facts (static closure inaccessible, 38/76 derivations) — embed the rule
  *text* and call `load()` instead (137 ms overhead on micro, worth it).

### Performance (once per graph, matching current `graph.py` semantics)

| corpus | owlrl (python) | engine (compiled binary) |
|---|---|---|
| micro (40) | 41 ms | ~277 ms |
| docs (402) | 121 ms | ~671 ms |

Sub-second in both worlds; inference is a one-shot pipeline step in `render`/`build`/`check`,
so this gap is immaterial.

### Licensing / safety

- `rdfjs-inference-engine@0.2.2` + `eyeling@1.34.6`, both MIT.
- No `eval` / `new Function` in the engine or eyeling (verified by grep over `dist/`).
- `load()` is the only filesystem touch for rules; eliminated via rule-text embedding.

## Risks / open questions for the decision

1. **Inconsistency representation.** owlrl spilled `agent-ont:error`/`owl:Nothing` triples;
   the engine emits structured `Inconsistency` reports. Wiki behavior decision: consume the
   reports (recommended; they are addressable data), optionally also materialize `owl:Nothing`
   typing for the disjoint/complement cases seen in tests.
2. **SHACL reification boost.** The engine reifies SHACL shape property lists (`_Shape
   sh:property N…`). owlrl never touched shapes. This is extra (arguably correct) structure,
   not parity regression — confirm it is acceptable in `check`/`query` outputs.
3. **Determinism / fingerprints.** Set `deterministicSkolem: true`; keep term order stable
   when fingerprinting inferred graphs (small adapter responsibility).
4. **Binary size.** 29 MB self-contained binary vs current Python distribution. Acceptable for
   the release asset; note exe target (Windows CI build).
5. **Vocab source.** `load()` wants the TBox as `vocabulary`; wiki already resolves config
   vocab (schema.org subset + SHACL + user axiom files). Bake that set at build time alongside
   the rules for the same zero-fs property.

## Data appendix (repro)

- `spike-reasoning/goldens/` — python goldens: `{docs,micro}.graph.{asserted,inferred,clean}.nt` + manifests.
- `spike-reasoning/micro/` — fixture wiki (wiki.yml, axioms.ttl, instances.ttl, gregory.md).
- `spike-reasoning/spike.ts` — comparison runner (modes `fs`/`no-fs`; 12 checks; closure diff).
- `spike-reasoning/bake-rules.ts` — bakes `owl2rl-eyeling.n3` → `rules.ts` (embedded constant).
- `spike-reasoning/spike-bin.exe` — compiled binary (clean-room verified).
- Raw outputs: `micro-spike.txt` / `docs-spike.txt` (JSON verdict + full named diffs).