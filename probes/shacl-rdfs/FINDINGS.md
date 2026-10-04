# Probe: does `rdf-validate-shacl` need an RDFS closure pass to match `pyshacl`?

**Question.** The plan swaps `pyshacl` for `rdf-validate-shacl` **plus an RDFS
closure pass**, on the reasoning that the Python engine validates against a graph
already closed under RDFS (`audit.py:120,137`) and `rdf-validate-shacl` performs
no inference of its own. Is that closure pass actually load-bearing?

**Answer.** No — not for `sh:targetClass`, which is what the engine's shapes use.
`rdf-validate-shacl` already applies subclass semantics when it resolves a target
class, and its findings match the oracle exactly without any closure. The pass is
dropped from the plan; the one place it might still be needed is recorded below
as unverified.

## Method

- [`data.ttl`](data.ttl) — three instances: `ex:alice` (Person, named),
  `ex:bob` (Person, **unnamed**), `ex:dave` (Agent, unnamed).
- [`shapes.ttl`](shapes.ttl) — the axiom `schema:Person rdfs:subClassOf
  micro:Agent`, a shape targeting the **superclass** `micro:Agent`, and a shape
  targeting `schema:Person` directly.
- [`probe.ts`](probe.ts) — parses with `@wazoo/sparql-engine/parser` (the
  spike-verified `rdflib` replacement, so the probe exercises the real stack),
  validates the corpus raw, closes it with a hand-rolled RDFS fixed point, and
  validates again. → [`deno-report.json`](deno-report.json)
- `oracle/` — the same two Turtle files staged as a wiki corpus, validated by the
  pinned Python engine. → [`oracle-report.txt`](oracle-report.txt)

The design is adversarial: `ex:bob` is **never** explicitly typed as an Agent, so
the superclass shape can only fire for it if something performs the subclass
inference. If the closure were load-bearing, the raw run would miss it.

## Result 1: the findings match the oracle exactly

| | Focus node | Constraint | Message |
|---|---|---|---|
| Oracle | `micro:bob` | `MinCountConstraintComponent` | Agent requires schema:name |
| Oracle | `micro:dave` | `MinCountConstraintComponent` | Agent requires schema:name |
| Oracle | `micro:bob` | `MinCountConstraintComponent` | Person requires schema:name |
| Deno | `probe/bob` | `MinCountConstraintComponent` | Agent requires schema:name |
| Deno | `probe/dave` | `MinCountConstraintComponent` | Agent requires schema:name |
| Deno | `probe/bob` | `MinCountConstraintComponent` | Person requires schema:name |

Three results either way, same focus nodes, same component, same severity
(`sh:Violation`), same messages. The only difference is the IRI base, which is
corpus configuration rather than validator behaviour.

## Result 2: `raw == closed`

```
raw findings: 3     closed findings: 3     raw == closed: True
corpusTriples: 17   closedTriples: 19
```

The closure does derive two triples (`ex:alice` and `ex:bob` gain
`rdf:type micro:Agent`) and the closed run confirms it — `agentTypedAfterClosure`
lists all three nodes. It simply changes **no finding**, because
`rdf-validate-shacl` had already applied the subclass relation when resolving
`sh:targetClass`. That is correct per the SHACL specification, which defines a
target class over `rdfs:subClassOf*`.

So the pass is redundant for the engine's shapes, all of which target classes.
Removing it also removes the risk it carried: a hand-rolled closure that is
wrong in one direction silences real violations, and wrong in the other reports
phantom ones.

**Still unverified:** constraint types whose semantics can turn on inferred
triples rather than targeting — `sh:class`, `sh:path` over an
`rdfs:subPropertyOf`, and `sh:or`/`sh:and` over an inferred type. None appear in
the engine's shapes today; each must be probed if one is added.

## Result 3: the report *text* cannot be matched, and that is expected

The oracle prints pyshacl's report through `rdflib`, complete with term
rendering:

```
Constraint Violation in MinCountConstraintComponent (http://www.w3.org/ns/shacl#MinCountConstraintComponent):
	Severity: sh:Violation
	Source Shape: [ owl:sameAs <self> ; sh:message Literal("Agent requires schema:name") ; sh:minCount Literal("1", datatype=xsd:integer) ; sh:path schema:name ]
	Focus Node: micro:bob
	Result Path: schema:name
	Message: Agent requires schema:name
```

`owl:sameAs <self>`, the blank-node structure rendering, and
`Literal("1", datatype=xsd:integer)` are `rdflib` artifacts. Reproducing them
byte-for-byte would mean porting `rdflib`'s `__str__`. This confirms ADR 0001's
spec-close decision was the right one, and it is precisely what the harness's
`known` transcripts exist for: `check-micro` becomes a `known` case with the
oracle's rendering committed beside the port's.

## Result 4: map the report from its graph, not from its accessors

`rdf-validate-shacl@0.6.5` returns clownface pointer results, and `resultPath`
does **not** resolve through the accessor — it came back `undefined` while the
oracle prints a `Result Path` line. The report *dataset* has it:

```
sh:focusNode                = https://example.org/probe/bob
sh:resultMessage            = Agent requires schema:name
sh:resultPath               = https://schema.org/name
sh:resultSeverity           = http://www.w3.org/ns/shacl#Violation
sh:sourceConstraintComponent= http://www.w3.org/ns/shacl#MinCountConstraintComponent
sh:sourceShape              = b1
```

Phase 6's report mapper must therefore read `sh:*` predicates off the report
graph. Trusting accessors would silently drop the result path for every
violation.

## Result 5: a dependency conflict to settle in phase 6

Verified versions: `rdf-validate-shacl@0.6.5`, `@zazuko/env@3.0.1`,
`@wazoo/sparql-engine@0.4.2`, parsed via `@zazuko/env`. Deno warns:

```
@zazuko/env@3.0.1 peer @rdfjs/types@^2: resolved to 1.1.0
```

`@zazuko/env` wants `@rdfjs/types@^2` while the ADR pins `1.1.0`. It runs, but
phase 6 should either move the pin to v2 or record the override deliberately
rather than shipping a warning nobody read.

## Consequences

1. **Drop the RDFS closure pass** from the plan and from ADR 0001's dependency
   table. It buys nothing for class-targeted shapes, and it is one fewer
   hand-rolled piece of reasoning to get wrong.
2. **Phase 6 keeps `audit.py:120,137`'s behaviour but not its mechanism.** The
   oracle's *decision* — which nodes a shape applies to — comes out identical
   without a closure; only the plumbing differs.
3. **`check` and `lint` are `known`-divergence cases by construction**, not
   parity cases. The message text is `rdflib`'s, and chasing it would be porting
   the library we are deleting.
