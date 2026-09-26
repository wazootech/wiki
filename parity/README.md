# Differential harness

The spine of the Deno rewrite ([#273](https://github.com/wazootech/wiki/issues/273)).
It runs the pinned Python oracle and the Deno CLI over the same corpus, in the
same scratch directory, with the same `argv`, and compares exit code plus *normalised* stdout/stderr.
Mutating cases also compare a stable digest of the output-tree changes. Every
milestone is validated against it before the next one starts.

Migrated here from nothing — the Python project has no equivalent, because it
never had a second implementation to disagree with.

```bash
# Point at the pinned Python checkout, then run everything.
WIKI_ORACLE_ROOT=/path/to/wiki deno task parity

# Narrow the run while working on one command.
deno task parity --corpus micro
deno task parity --case check-micro --keep
deno task parity --json
```

## Configuration

The harness takes no committed paths — the pinned checkout is a sibling worktree
on a developer machine and a separate clone in CI, and guessing would silently
compare the wrong engine.

| Variable | Meaning |
|---|---|
| `WIKI_ORACLE_ROOT` | The pinned Python checkout. Used to find `.venv/Scripts/wiki.exe` (Windows) or `.venv/bin/wiki`, and to confirm the pin. |
| `WIKI_ORACLE` | Overrides the executable only, when the venv lives elsewhere. |

Both CLIs run with `NO_COLOR=1`, and the Deno CLI runs from `src/wiki/cli.ts`
with the project's own `deno.json` passed explicitly, because each case executes
with the scratch corpus as its working directory.

## Case statuses

| Status | Meaning |
|---|---|
| `parity` | The two CLIs must agree exactly. This is a gate. |
| `pending` | The command is not ported yet, so disagreement is expected. **Passing is a failure** — a `pending` case that starts matching must be promoted to `parity` in the same commit. |
| `known` | The divergence is accepted and committed. The case must still match its transcript in `transcripts/`, on **both** sides, so neither the port nor the oracle can drift unnoticed. |

The `pending` rule is deliberate. A gate that quietly turns green stops being a
gate, and "this command now matches the oracle" is exactly the event worth
reading in a diff.

Re-record a `known` divergence with `--update`, and review the transcript diff
before committing it.

The first recorded divergence is **`check-micro`**, and it is irreducible rather
than pending: both sides find the same one violation of the same constraint on
the same focus node and exit 1, but `pyshacl`'s `results_text` renders terms the
way `rdflib` does — `sh:Violation` prefix-compacted, the source shape expanded
into a blank-node description carrying pyshacl's own `owl:sameAs <self>` marker
— while the port renders N-Triples. What the transcript gates is everything
*around* that: the header, the result count, the constraint component, the
message, and the exit code all still have to match. `check-docs` stays a gate
because the clean corpus has no report text to render.

The second known case is **`export-micro`**. Both sides export the same data, but
Python escapes non-ASCII characters in JSON while TypeScript emits UTF-8. The
transcript records the representation difference on both sides.

The third is **`fmt-check-docs`**, and it records the formatter transition.
The docs corpus is now formatted with Deno's dprint-based formatter. The pinned
Python `mdformat` oracle flags `Dataview_Integration.md`; the Deno formatter
reports all 89 pages clean. The committed transcript keeps both results fixed
so neither formatter can drift unnoticed.

The engine moved from a `deno fmt` subprocess to the dprint plugin in process
without touching this case: the plugin is pinned to the version Deno 2.9.6
bundles and the port reproduces `deno fmt`'s bytes on every page in the corpus
(`probes/fmt-dprint/verify-production.ts`), so the recorded transcript is the
same transcript either way.

The fourth known case is **`build-micro`**. Both engines build the same four pages
at the same routes and report identical output, but fenced SPARQL blocks differ:
Python wraps code with Pygments highlight spans; Deno emits the same escaped code
without syntax-highlight markup. The tree digest and transcript preserve that
visible difference explicitly.

The fifth and sixth known cases are **`usage-help`** and
**`usage-no-command`**. The root catalog is otherwise aligned, but the Deno CLI
correctly describes its own formatter rather than naming the retired Python
`mdformat` implementation. The empty invocation prints that same catalog to
stderr, so its transcript records the same single-line difference.

Two `fmt` cases are gates rather than divergences. `fmt-check-micro` compares the
stale-file list and exit code. `fmt-micro` also compares the changed-file tree
digest, not just formatter messages.

## Corpora

| Corpus | What it is | Why |
|---|---|---|
| `micro` | Hand-written, deliberately dirty: a broken link, a wikilink under `link.style: standard`, stale SPARQL blocks, a shape violation, a filename-pattern violation. | Commands must compare *non-empty* output and non-zero exit codes, or a port that silently does nothing would pass. |
| `docs` | This repository's own 89-page wiki, clean. | The opposite pressure: a port that invents findings where the oracle is silent fails here. |

Each case is staged into a fresh copy under `.parity-tmp/`, and the copy is
re-made between the two runs — so both CLIs see byte-identical inputs, an
identical absolute path, and no state left behind by the other. For mutating
commands (`fmt`, `render`, `build`), the harness snapshots created, changed, and
deleted files, normalizes text paths/line endings, and compares the resulting
tree digest.

## Normalisation

Rules live in `normalize.ts`, each with its rationale, and each is unit-tested
in `tests/parity_normalize_test.ts`. Currently enabled:

- leading UTF-8 BOM removal (the engine strips BOMs on read — #312);
- CRLF and lone CR folded to LF (Click writes CRLF on Windows; `--version`
  proves it);
- ANSI escape removal (`rich` colours output; `@std/colors` decides
  independently);
- the scratch directory's absolute path replaced with `<CORPUS>` (observed in
  `lint --strict -v`, which prints the absolute path of a missing asset
  directory);
- trailing blank lines collapsed to one — but a *missing* final newline is left
  alone, because that is a real difference.

Observed but deliberately **not** enabled, pending a case that needs them:

- **Windows path separators in file lists.** `render --check` prints
  `wiki\Alice.md` on Windows, and a port using `@std/path` would print the same,
  so folding `\` to `/` would hide a real regression rather than noise.
- **`rich` table padding.** `query` pads every cell to its column width, so a
  port with a different table renderer diverges on trailing spaces that carry no
  meaning. Fold it in when the `query` case starts being compared.

## Differential cases not covered

- **`serve` and `mcp`.** Both are long-lived servers; the unit tests cover their
  request and transport behavior, but this argv-based harness does not compare
  them with the Python oracle.
- **Network-oriented source and upgrade commands.** Focused tests exercise
  `install`, `update`, `remove`, and `upgrade` with injected dependencies; the
  differential harness avoids live network operations.

## Adding a case

1. Add the fixture to `corpus/micro/` (dirty) or rely on `docs/` (clean).
2. Add an entry to `cases.ts` with `status: "pending"` and a `note` naming the
   milestone that will port it.
3. When the port lands, flip it to `parity` in the same commit.
