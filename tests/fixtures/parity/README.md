# Differential transcripts (frozen record)

These are the transcripts from the **final** differential run of the Python oracle
against the Deno CLI, kept as the durable record of that comparison. The harness
that produced them (`parity/`) was scaffolding for the migration and was removed
once the cutover landed: it drove the pinned Python oracle at `1bfb422`, which no
longer exists now that `main` is the Deno engine.

Each file is self-describing and carries the same fields:

| field      | meaning                                                      |
| ---------- | ------------------------------------------------------------ |
| `caseId`   | the case identity from the removed `parity/cases.ts`          |
| `argv`     | the argument list both engines ran with                       |
| `note`     | why the two are expected to differ                            |
| `oracle`   | exit code, stdout and stderr from the pinned Python CLI       |
| `deno`     | the same three fields from the Deno CLI                       |

Every file here is a **known difference**: both sides matched a committed
transcript rather than each other. Seven cases, all of them deliberate — the
version bump, two usage/help differences, three output-format divergences, and
the docs-corpus formatting result. None is an unexplained mismatch.

Nothing reads these files at test time. They are kept because they are the only
surviving evidence that the port was ever compared against the engine it
replaced; without them the ADR's parity claim would rest on assertion alone. The
goldens that the test suite *does* replay live separately, under
`tests/fixtures/rdf/` and `probes/`.