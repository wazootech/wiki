# Probe: what replaces `rdflib` as an IO library?

**Question.** ADR 0001 swaps `rdflib` for `@wazoo/sparql-engine`, which the
reasoning spike verified for stores, term semantics, and SPARQL evaluation. But
the Python engine also uses rdflib as an *input/output* library, and a SPARQL
engine need not offer that:

| direction | formats the engine uses | where |
|---|---|---|
| parse | Turtle, TriG | `.ttl`/`.trig` files, ` ```turtle ` blocks |
| parse | N-Triples, N-Quads | the disk cache it writes and reads |
| parse | RDF/XML, JSON-LD | `.rdf`/`.xml`/`.jsonld` files in a wiki tree |
| serialize | N-Triples, N-Quads | that same cache — a **contract**, reused across processes |
| serialize | Turtle, N3, TriG, RDF/XML, JSON-LD (expanded + compacted) | `export`, serve metadata views, SPARQL service |

**Answer.** The store supplies a *Turtle parser* and nothing else. Everything
else comes from two libraries, and **one format has no writer at all**.

## Method

- [`graph.json`](graph.json) — ten triples built term-by-term on both sides, so a
  difference in output is a serializer difference and never a parser difference.
  Deliberately awkward: non-ASCII text, a language tag, an empty literal, a
  literal with a newline, quotes, a backslash and a tab, three datatypes, and two
  blank nodes.
- [`probe.ts`](probe.ts) — registry inventory, parse coverage, serialize
  coverage, and the round-trip of the cache dialect. → `deno/`
- [`n3-probe.ts`](n3-probe.ts) — `n3.js` as the candidate writer for the
  formats the registry is missing.
- [`oracle/generate.py`](oracle/generate.py) — the same fixture through `rdflib`,
  including a reverse-direction check: rdflib re-parsing what the port wrote.
  → [`oracle/`](oracle)

Run `probe.ts` first, then `oracle/generate.py` from the rdflib checkout;
`n3-probe.ts` reads the generated oracle Turtle. Captures under `deno/` and
`oracle/` are generated locally and intentionally not committed; the findings
below quote the relevant outputs.

`deno run --allow-read --allow-write --allow-run --allow-env --config deno.json probe.ts`

## Result 1: `@zazuko/env` registers nothing, and failure is silent

```
@zazuko/env        parsers: []                serializers: []
@zazuko/env-node   parsers: 7 (all formats)   serializers: 5
```

The **base** `@zazuko/env` package registers no parsers and no serializers. That
matters more than it looks, because the failure mode is silent:

```ts
await dataset.serialize({ format: "text/turtle" })  // → canonical N-Quads
```

`DatasetExt.serialize` documents it — *"If it is not found, canonical n-quads are
returned"* — and every one of my first seven calls returned identical 911-byte
canonical N-Quads while reporting success. A port built on the base package would
ship `export --format xml` emitting N-Quads and never raise. **Use
`@zazuko/env-node`**, and treat "the output is canonical N-Quads" as a
test-worthy failure condition rather than trusting the call to throw.

Second trap: `format` is a **media type**, not a short name. `{ format: "turtle" }`
falls back silently too; `{ format: "text/turtle" }` is the working spelling.

## Result 2: the registry's Turtle writer is an N-Triples writer

```
serialize nt       905 bytes   (fallback: false)
serialize nquads   905 bytes   (fallback: false)
serialize turtle   905 bytes   (fallback: false)   ← identical to nt
serialize n3       905 bytes   (fallback: false)   ← identical to nt
serialize trig     911 bytes   (fallback: true)    ← no serializer
serialize xml      911 bytes   (fallback: true)    ← no serializer
serialize json-ld 1066 bytes   (fallback: false)
```

Diffing the four 905-byte outputs shows they are the same bytes. Resolving the
registry entry directly confirms why: `rdf.formats.serializers.get("text/turtle")`
and `get("application/n-triples")` return the **same N-Triples serializer**. So:

- `N-Triples` and `N-Quads` writers: **present** (and correct — see Result 4).
- `Turtle` / `N3`: present by name, N-Triples in substance. Valid RDF, wrong shape:
  no prefixes, no predicate grouping, one triple per line.
- `TriG`, `RDF/XML`: **absent**. These fall back to canonical N-Quads silently.

`n3.js` fills the gap ([`n3-probe.ts`](n3-probe.ts)) and reads the oracle's
output back (`n3.Parser` → 10 quads):

```
@prefix schema: <https://schema.org/>.
<https://example.org/Alice> schema:knows <https://example.org/Bob>;
    schema:name "café ☕"@fr;
    schema:active true;
    schema:age 42;
```

The rdflib Turtle output groups the same predicates, abbreviates
`"true"^^xsd:boolean` to `true` as well, but writes
` ;` where n3.js writes `;`, uses `[ ]` for a blank object, escapes a newline as
`\n` where rdflib switches to a triple-quoted literal, and orders predicates
alphabetically where n3.js keeps insertion order. Same shape, different bytes.
RDF/XML remains **unassigned** — no candidate has a writer yet.

## Result 3: §N-Triples matches, except for blank node labels

`rdflib`'s N-Triples output and the RDF/JS serializer's are identical on all ten
triples — same IRI rendering, same `\"quoted\"` / `\\ backslash` / `\ttab`
escaping, same `@fr` and `^^<...datatype>` suffixes, same `""` for the empty
literal, and no escaping of `<`, `>` or `&` inside literals. Two differences:

1. **Blank node labels.** rdflib: `_:N80df498b4de4458197ea9b23232f12ca` (32 hex
   digits from a uuid4). RDF/JS: `_:b1`. rdflib's label is random per run, so the
   oracle cannot match *itself* on this — the differential harness needs a
   normalization rule (`_:N[0-9a-f]{32}` and `_:b\d+` → a stable ordinal) before
   any blank-node case can be compared at all.
2. **Line endings.** The oracle's file is CRLF here because CPython's
   `Path.write_text` translates newlines on Windows. Already folded by the
   harness's existing line-ending normalization.

## Result 4: the hand-rolled N-Quads writer needs rdflib's `n3()`, not a generic one

`format.py::_serialize_nquads_graph` builds N-Quads lines as
`f"{s.n3()} {p.n3()} {o.n3()} ."`, so the *cache and export format* is rdflib's
term rendering, not N-Quads-toolkit rendering. The fixture caught the one place
that differs in rdflib's N-Quads output:

```
<https://example.org/Alice> <https://schema.org/description> """line1
line2 \"quoted\" \\ backslash	tab""" .
```

A literal containing a newline is written **triple-quoted with the newline left
raw**, while backslashes and quotes are still escaped. Reproducing N-Triples with
`\n` escapes instead is one line off — which
would have been a diff on every cached graph containing a multi-line literal,
since page bodies are stored as literals. The port's `n3()` must therefore
reproduce rdflib's rule: use `"""…"""` when the value contains a newline, and keep
the raw newline.

## Consequences

1. **The IO stack is three pieces, not one.** `@wazoo/sparql-engine/parser` for
   ` ```turtle ` blocks and `.ttl` (already proven in phase 3b), `@zazuko/env-node`
   for N-Triples / N-Quads / JSON-LD parse and the cache writers, and `n3.js` for
   Turtle / N3 / TriG output. RDF/XML output is unresolved and must be decided
   when `export --format xml` and the serve XML view are ported.
2. **A serializer that silently substitutes canonical N-Quads is a hazard worth
   a unit test.** Phase 5 should assert that the Turtle writer emits a prefix
   line, so a future registry change cannot quietly turn every export into
   N-Triples.
3. **The harness needs a blank-node normalization rule** before any case with
   blank nodes can be compared, and phase 7 needs a port of rdflib's `n3()`
   triple-quote rule for N-Quads output.
4. **Turtle / N3 / TriG / XML / JSON-LD export are `known` divergences by
   construction.** They are pretty-printer choices in a library being deleted,
   exactly like the SHACL report text in phase 3b. The parse side has no such
   excuse: all seven formats parse.
