# Probes

One directory per investigation the cutover needed, each holding the question,
the `FINDINGS.md` recording what was decided, and the oracle data that decision
rests on.

These are **not** part of the engine. Nothing in `src/wiki/` imports them, and
neither `files` in `package.json` nor `publish.include` in `deno.json` lists
them — a `npm pack` ships zero bytes of this tree.

## The harnesses are gone; the evidence is not

This tree originally held a TypeScript harness per investigation. All of that
scaffolding was deleted once the port landed, and with it the `exclude` entries
this tree needed in `deno.json`. Two reasons:

- The harnesses were throwaway by construction — they printed to stdout and
  wrote scratch output, never modules with contracts. They carried 37 type
  errors between them and were excluded from `check`, `lint`, and `fmt` for
  exactly that reason.
- Every check they performed outlived them in a stronger form. The oracle
  comparisons the harnesses ran by hand are now assertions in `tests/`
  (`fnmatch_test.ts` replays `fnmatch/golden.json`; `json_schema_test.ts`
  replays `json-schema/corpus.json` against `json-schema/oracle/golden.json`;
  `shacl_test.ts` embeds the `shacl-rdfs` fixture), and the version pins in
  `FINDINGS.md` are what `deno.json` now depends on.

What remains is the part with value: the recorded findings, and the golden data
the tests replay. The deleted harnesses are in the history of this directory
(revision `8cfc9fe`) if a question needs re-running.

## Why three Python files live here

`probes/fnmatch/generate-golden.py`, `probes/json-schema/oracle/generate.py`,
and `probes/rdf-io/oracle/generate.py` are Python, in a repository whose
premise is that the engine is no longer Python. That is deliberate, and the
reason is the same reason the now-removed `parity/` differential harness existed at all.

The cutover replaces an implementation with a *reimplementation*. The only way
to know the reimplementation is correct is to run both and compare. The Python
engine is therefore still a **tool**, pinned to revision `1bfb422` and installed
in a local checkout — never a runtime dependency, never part of the package.
These generators run it to produce golden data, then exit.

So the no-Python premise holds where it matters: `src/wiki/` imports no Python,
the published package contains no Python, and `deno publish` never sees this
tree. Deleting these files would delete the ability to *regenerate* the goldens
that justify the port, which is the one artifact worth keeping from the old
implementation.

They are kept until the first TypeScript release. The
retained-value question for the golden files themselves is tracked separately;
the generators outlive them.

## What each probe decided

| probe | question | outcome |
| --- | --- | --- |
| `fmt-shielding` | does `deno fmt` survive the wiki's markdown contract? | the three shielding concerns (frontmatter, SPARQL blocks, wikilinks) survive verbatim; the load-bearing finding is `--prose-wrap never`, without which the cutover rewrites 70 pages instead of 9 |
| `fmt-dprint` | can the dprint markdown plugin run in-process? | yes, byte-for-byte on 87/87 docs pages — replacing a `deno fmt` subprocess that cannot work under `deno compile` |
| `json-schema` | what replaces `jsonschema`? | `ajv`, kept as the engine: it agreed with `jsonschema`'s verdict on 60/60 cases but is a poor *reporter*, so the port replaces the reporting layer |
| `rdf-io` | what replaces `rdflib` for IO? | `@zazuko/env-node` for parsing/serialising; base `@zazuko/env` registers nothing and fails silently, and its Turtle writer is really an N-Triples writer — hence the explicit writers |
| `shacl-rdfs` | does `rdf-validate-shacl` need an RDFS closure pass to match `pyshacl`? | no — `raw == closed`, because `sh:targetClass` resolution already applies the subclass relation |

`spike-reasoning/` is the same kind of artifact for the reasoning engine. Its
scaffolding is gone for the same reason; its `DECISION.md` is the whole of what
remains, recording the engine choice and the verification behind it.