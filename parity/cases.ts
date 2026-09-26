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
    status: "known",
    note:
      "The Deno cutover advances the package version to 0.1.24; the pinned Python oracle remains at 0.1.23.",
  },
  {
    id: "usage-unknown-command",
    corpus: "micro",
    argv: ["bogus"],
    status: "parity",
  },
  {
    id: "usage-help",
    corpus: "micro",
    argv: ["--help"],
    status: "known",
    note: "The Deno help names the Deno formatter instead of legacy mdformat.",
  },

  // --- Core behavior and deliberate known differences -----------------------
  {
    id: "usage-no-command",
    corpus: "micro",
    argv: [],
    status: "known",
    note:
      "The empty invocation's root help names the Deno formatter instead of legacy mdformat.",
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
    // not vacuous — both engines walk all 89 pages of this wiki.
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
    id: "fmt-micro",
    corpus: "micro",
    argv: micro("fmt", "-v"),
    status: "parity",
    mutates: true,
  },
  {
    id: "render-check-micro",
    corpus: "micro",
    argv: micro("render", "--check"),
    status: "parity",
    note: "Stale SPARQL blocks and their file list match the oracle.",
  },
  {
    id: "render-micro",
    corpus: "micro",
    argv: micro("render", "-v"),
    status: "parity",
    mutates: true,
  },
  {
    id: "export-micro",
    corpus: "micro",
    argv: micro("export"),
    status: "known",
    note:
      "Same data; Python escapes non-ASCII JSON while TypeScript emits UTF-8.",
  },
  {
    id: "query-micro-rdfxml",
    corpus: "micro",
    argv: micro(
      "query",
      "--no-inference",
      "SELECT ?name WHERE { <https://example.org/rdf-ingestion> <https://schema.org/name> ?name }",
    ),
    status: "parity",
  },
  {
    id: "query-micro-stdin",
    corpus: "micro",
    argv: micro("query"),
    stdin: MICRO_STDIN_QUERY,
    status: "parity",
    note: "The query arrives on stdin; SELECT output matches the oracle.",
  },
  {
    id: "query-micro-named-graph",
    corpus: "micro",
    argv: micro(
      "query",
      "--no-inference",
      "SELECT ?name WHERE { GRAPH ?g { ?p a <https://schema.org/Person> ; <https://schema.org/name> ?name . } } ORDER BY ?name",
    ),
    status: "parity",
    note: "GRAPH queries run over the source-named dataset.",
  },
  {
    id: "graph-list-docs",
    corpus: "docs",
    argv: ["-c", "docs/wiki.yml", "graph", "list"],
    status: "parity",
  },
  {
    id: "build-micro",
    corpus: "micro",
    argv: micro("build", "--no-check", "-v"),
    status: "known",
    note:
      "Fenced-code HTML differs: Python wraps SPARQL in Pygments spans; Deno emits the same escaped code without syntax-highlight markup.",
    mutates: true,
  },
  {
    id: "link-micro",
    corpus: "micro",
    argv: micro("link"),
    status: "parity",
    note:
      "The micro corpus has no link suggestions; link mutation and repair are covered by focused tests.",
  },
  // --- The repository's own wiki: one formatter divergence remains -----------
  {
    // The docs corpus is formatted with the Deno markdown formatter after the
    // cutover. The pinned Python oracle's mdformat check still flags one page,
    // while the Deno formatter reports the full corpus clean; this records the
    // intended formatter transition rather than asking Python to own formatting.
    id: "fmt-check-docs",
    corpus: "docs",
    argv: docs("fmt", "--check", "-v"),
    status: "known",
    note:
      "The Deno-formatted docs corpus is clean to Deno fmt; the pinned mdformat oracle flags Dataview_Integration.md.",
  },
  {
    id: "render-check-docs",
    corpus: "docs",
    argv: docs("render", "--check"),
    status: "parity",
    note: "The docs wiki has no stale SPARQL blocks in either implementation",
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
