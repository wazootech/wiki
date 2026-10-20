# SHACL benchmark

The shared SHACL benchmark from
[#414](https://github.com/wazootech/wiki/issues/414): one seeded graph at
10³–10⁶ quads, one set of shapes, and the cases that tell us where validation
stops scaling, in the Wiki today and in Worlds' planned write-time validation
([worlds-sdk-ts#151](https://github.com/wazootech/worlds-sdk-ts/issues/151)).

It is a measurement tool, not part of the engine: nothing in `src/wiki/` imports
it, and neither `publish.include` nor `package.json` `files` ships it.

## Run it

```bash
deno task bench:shacl                                  # 1e3,1e4,1e5,1e6, every case
deno task bench:shacl --sizes 1e3,1e4 --cases validator-full,wiki-check-full
deno task bench:shacl --timeout 1200 --json results.json --out ./fixtures
```

Each case runs in its own process, so no case inherits another's graph cache or
heap, and one that runs out of memory or exceeds `--timeout` (seconds, default
600) is reported as failed without stopping the run. The table goes to stdout;
progress goes to stderr. `--out` keeps the generated fixtures; otherwise they go
to a temporary directory that is removed afterwards.

## The fixture

`fixture.ts` generates people and organizations (one organization per 20 people,
6 triples per person, 3 per organization) as N-Triples, from a seeded PRNG: the
same size and seed always give byte-identical output. About 1% of people carry a
planted violation: a missing `givenName`, a second `email`, or a `worksFor` that
points at a person.

The shapes (`SHAPES_TURTLE`) use the constraint kinds #414 names as scaling
risks: class targets, `sh:class` (needs the value's type, one hop away), a
two-step sequence path (`worksFor` / `name`), and an inverse path (an
organization needs at least one inbound `worksFor`).

### Using the fixture from Worlds

```bash
deno task bench:shacl --emit ./fixtures --sizes 1e3,1e4,1e5,1e6
```

writes `<size>/data.nt` and `<size>/shapes.ttl` and stops. Import `data.nt` into
a world (SQLite, libSQL, or D1) to measure the Worlds half on the same graph;
the shapes are the same file the Wiki cases use.

## The cases

| Case                   | What it times                                                                                              | Answers                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `validator-full`       | Parse `data.nt`, then `validateShacl` over the whole graph                                                 | Cost of full-graph validation alone, without graph building or inference |
| `validator-delta`      | 200 single-person writes: fetch the neighbourhood from an indexed in-memory store, then validate just that | Whether write-scoped validation stays flat as the graph grows (Worlds)   |
| `wiki-phases`          | `loadGraph` (with OWL-RL inference), `loadShapes`, and `validateShacl`, separately                         | Which phase of a full `wiki check` grows fastest                         |
| `wiki-check-full`      | `runCheck` on a wiki holding `data.nt`, `shapes.ttl`, and 50 Markdown pages                                | End-to-end full `wiki check`                                             |
| `wiki-check-scoped-1`  | `runCheck` scoped to 1 page                                                                                | Scoped check cost (editor, watcher)                                      |
| `wiki-check-scoped-50` | `runCheck` scoped to 50 pages                                                                              | Scoped check cost per extra file (#415)                                  |

Each result reports the total, its named phases, the process's peak resident set
size as the OS records it (`VmHWM` on Linux, `PeakWorkingSet64` on Windows,
`n/a` elsewhere), and the SHACL result count.

### Reading the delta case

A write's neighbourhood holds typed nodes that are not part of the write, such
as the person someone `knows`. Validated with the shapes' class targets, those
nodes are checked without _their_ neighbourhood and report violations that are
not real: in the first run, 542 results over 200 writes with only 5 real ones.
So the delta case swaps `sh:targetClass` for `sh:targetNode` on exactly the
touched nodes. Write-scoped validation needs that retargeting, not only a
smaller data graph, and #151's design should include it.

The fetch is an in-memory `n3` index lookup. It stands in for a D1 query and
says nothing about D1 latency; the Worlds-side harness has to measure that.

Scoped Wiki cases see only the page, so the `sh:class` and path constraints that
reach other documents report violations there. That is scoped mode's documented
behaviour, and it means those cases also time the report path.

## Not covered

- `wiki build` (lint, then check, then HTML output): the check is measured here,
  and the rest is not SHACL.
- The validator's bundle size and CPU time under Workers limits, which #151 asks
  about. They need a Worker build, so they belong to the Worlds-side harness.
