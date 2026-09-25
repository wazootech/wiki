/**
 * The differential harness case table (issue #273, Phase 2).
 *
 * Cases are added as commands are ported, and they move from `pending` to
 * `parity` in the same commit as the port that earns it. The `micro` corpus is
 * deliberately dirty so every case compares real findings; the `docs` corpus is
 * this repository's own clean wiki, where the target is silence and exit 0.
 *
 * `argv` is the full argument vector after the program name, including the
 * `-c <config>` the oracle needs to find the staged corpus.
 */

import type { ParityCase } from "./harness.ts";

const MICRO_CONFIG = "-c";
const MICRO_CONFIG_PATH = "wiki.yml";
const DOCS_CONFIG_PATH = "docs/wiki.yml";

/** A `docs`-corpus argument vector. */
function docs(...args: readonly string[]): readonly string[] {
  return [MICRO_CONFIG, DOCS_CONFIG_PATH, ...args];
}

/** A `micro`-corpus argument vector. */
function micro(...args: readonly string[]): readonly string[] {
  return [MICRO_CONFIG, MICRO_CONFIG_PATH, ...args];
}

/** The query the `query-micro-stdin` case pipes in. */
export const MICRO_STDIN_QUERY = [
  "PREFIX schema: <https://schema.org/>",
  "SELECT ?name WHERE { ?p a schema:Person ; schema:name ?name . }",
  "ORDER BY ?name",
].join("\n");

export const CASES: readonly ParityCase[] = [
  // --- Ported surface: gated against the oracle ------------------------------
  {
    id: "version",
    corpus: "micro",
    argv: ["--version"],
    status: "parity",
  },
  {
    id: "usage-unknown-command",
    corpus: "micro",
    argv: ["bogus"],
    status: "parity",
  },

  // --- Awaiting port ---------------------------------------------------------
  {
    // The first divergence the harness found, on its first run. Click's group is
    // declared `no_args_is_help`, so an empty argv prints the *full* help to
    // stderr with exit code 2 — not the short usage the scaffold assumed. Only
    // the exit code is verified today; the help body arrives with the CLI port.
    id: "usage-no-command",
    corpus: "micro",
    argv: [],
    status: "pending",
    note: "full group help is ported in phase 9 (cliffy)",
  },
  {
    // Ported, and deliberately *not* a gate: the only finding on this corpus is
    // a SHACL violation, and `results_text` is `pyshacl`'s rendering of the
    // report — `sh:Violation` prefix-compacted, the source shape as an expanded
    // blank-node description carrying pyshacl's `owl:sameAs <self>` marker. The
    // port reproduces the skeleton and renders terms as N-Triples (see
    // `shacl.ts`), so the divergence is confined to term syntax and recorded as
    // a transcript rather than chased. What the transcript does gate is that
    // both sides still *find* the violation, report one result, and exit 1.
    id: "check-micro",
    corpus: "micro",
    argv: micro("check", "--strict", "-v"),
    status: "known",
    note: "SHACL report text: skeleton identical, terms rendered as N-Triples",
  },
  {
    id: "lint-micro",
    corpus: "micro",
    argv: micro("lint", "--strict", "-v"),
    status: "parity",
  },
  {
    // The same two commands over the *clean* corpus, where the target is the
    // opposite: no findings and exit 0. Promoted in phase 6, and the match is
    // not vacuous — both engines walk all 87 pages of this wiki.
    id: "check-docs",
    corpus: "docs",
    argv: docs("check", "--strict", "-v"),
    status: "parity",
  },
  {
    id: "lint-docs",
    corpus: "docs",
    argv: docs("lint", "--strict", "-v"),
    status: "parity",
  },
  {
    id: "fmt-check-micro",
    corpus: "micro",
    argv: micro("fmt", "--check", "-v"),
    status: "parity",
  },
  {
    // Mutating, so the harness re-stages the corpus between the two runs. Note
    // what this case does *not* prove: it compares the messages and the exit
    // code, not the bytes written, because the harness has no tree digest yet.
    // Agreement on "4 files reformatted" is agreement that both formatters
    // consider the same four pages dirty — the ranking of the dirty pages, not
    // the formatting itself.
    id: "fmt-micro",
    corpus: "micro",
    argv: micro("fmt", "-v"),
    status: "parity",
  },
  {
    id: "render-check-micro",
    corpus: "micro",
    argv: micro("render", "--check"),
    status: "pending",
    note: "render is ported in phase 7",
  },
  {
    id: "render-micro",
    corpus: "micro",
    argv: micro("render", "-v"),
    status: "pending",
    note: "mutating render; the harness re-stages the corpus between runs",
  },
  {
    id: "export-micro",
    corpus: "micro",
    argv: micro("export"),
    status: "pending",
    note: "export is ported in phase 7",
  },
  {
    id: "query-micro-stdin",
    corpus: "micro",
    argv: micro("query"),
    stdin: MICRO_STDIN_QUERY,
    status: "pending",
    note: "query is ported in phase 7; the query arrives on stdin",
  },
  {
    id: "build-micro",
    corpus: "micro",
    argv: micro("build", "--no-check", "-v"),
    status: "pending",
    note: "build is ported in phase 8 (site/publish/serve)",
  },
  {
    id: "link-micro",
    corpus: "micro",
    argv: micro("link"),
    status: "pending",
    note: "link is ported in phase 8",
  },
  // --- The repository's own wiki: formatting and rendering still owed --------
  {
    // The divergence is a *difference of opinion*, not a bug, and the probe
    // enumerated it before the port existed: `mdformat` considers this wiki
    // clean (exit 0, 87 files already formatted) while the dprint markdown
    // plugin restyles nine pages — emphasis markers, hard-break syntax, fence
    // style, list spacing, and mdformat's `______…______` thematic break. The
    // port names the same nine the probe measured independently, which is the
    // check worth having: the engine's own `--check` agrees with the reference
    // formatter run by hand. Those nine pages are the cutover's one-time
    // reformat, so this case is `known` until phase 11 pays it.
    id: "fmt-check-docs",
    corpus: "docs",
    argv: docs("fmt", "--check", "-v"),
    status: "known",
    note:
      "formatter semantics: mdformat calls 87 pages clean, the dprint markdown plugin restyles 9",
  },
  {
    id: "render-check-docs",
    corpus: "docs",
    argv: docs("render", "--check"),
    status: "pending",
    note: "docs wiki has no stale SPARQL blocks",
  },
];

/** Case ids in table order. */
export const CASE_IDS: readonly string[] = CASES.map((testCase) => testCase.id);

export interface CaseSelection {
  readonly corpora: readonly string[];
  readonly ids: readonly string[];
}

/** Filter the table, failing loudly on a name that matches nothing. */
export function selectCases(selection: CaseSelection): readonly ParityCase[] {
  const selected = CASES.filter((testCase) => {
    if (
      selection.corpora.length > 0 &&
      !selection.corpora.includes(testCase.corpus)
    ) {
      return false;
    }
    if (selection.ids.length > 0 && !selection.ids.includes(testCase.id)) {
      return false;
    }
    return true;
  });

  if (selected.length === 0) {
    throw new Error(
      `no case matched corpora=[${selection.corpora.join(", ")}] ` +
        `ids=[${selection.ids.join(", ")}]`,
    );
  }
  return selected;
}
