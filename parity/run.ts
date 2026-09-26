#!/usr/bin/env -S deno run -A
/**
 * Differential harness runner (issue #273, Phase 2).
 *
 * Runs the pinned Python oracle and the Deno CLI over the same corpora with the
 * same argv and compares exit code plus normalised stdout/stderr. See
 * `parity/README.md` for the contract and `parity/harness.ts` for the rules.
 *
 *   deno task parity                              # everything
 *   deno task parity --corpus micro               # one corpus
 *   deno task parity --case check-micro           # one case
 *   deno task parity --case check-micro --keep    # inspect the scratch tree
 *   deno task parity --update                     # re-record `known` cases
 *
 * Configuration comes from the environment, never from a committed path:
 * `WIKI_ORACLE_ROOT` points at the pinned Python checkout and `WIKI_ORACLE`
 * overrides the executable. See `parity/oracle.ts`.
 */

import {
  type CorpusName,
  evaluateCase,
  type Evaluation,
  type ParityCase,
  readTranscript,
  runCase,
  type RunCaseOptions,
  writeTranscript,
} from "./harness.ts";
import {
  ORACLE_PIN,
  ORACLE_PIN_SUBJECT,
  readRevision,
  resolveOracle,
  revisionMatchesPin,
} from "./oracle.ts";
import { CASE_IDS, selectCases } from "./cases.ts";

const CORPUS_NAMES: readonly CorpusName[] = ["micro", "docs"];
const MAX_DUMP_LINES = 40;
const ID_WIDTH = 24;
const TAG_WIDTH = 8;

interface Options {
  readonly help: boolean;
  readonly verbose: boolean;
  readonly json: boolean;
  readonly update: boolean;
  readonly keep: boolean;
  readonly allowOracleDrift: boolean;
  readonly corpora: readonly CorpusName[];
  readonly ids: readonly string[];
}

const USAGE = `Usage: deno task parity [OPTIONS]

Run the pinned Python oracle and the Deno CLI over shared corpora and diff
exit code plus normalised stdout/stderr.

Options:
  --corpus NAME            Restrict to a corpus (micro, docs); repeatable
  --case ID                Restrict to a case id; repeatable
  --update                 Re-record transcripts for \`known\` divergences
  --keep                   Keep each case's scratch directory
  --allow-oracle-drift     Compare even if the oracle is not at the pin
  --json                   Emit a machine-readable report
  -v, --verbose            Show each case's result and note
  -h, --help               Show this message

Environment:
  WIKI_ORACLE_ROOT         Pinned Python checkout (${ORACLE_PIN}, ${ORACLE_PIN_SUBJECT})
  WIKI_ORACLE              Executable override, when the venv is elsewhere

Cases: ${CASE_IDS.join(", ")}`;

class UsageError extends Error {}

function splitList(value: string): readonly string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * Parse the flag surface by hand.
 *
 * The project's declarative CLI parser (cliffy) arrives with the CLI port in
 * phase 9. The harness deliberately does not adopt it early: it has to keep
 * running against the *Python* CLI, so it should not be the thing that pins the
 * port's CLI conventions.
 */
export function parseArgs(argv: readonly string[]): Options {
  const corpora: string[] = [];
  const ids: string[] = [];
  let help = false;
  let verbose = false;
  let json = false;
  let update = false;
  let keep = false;
  let allowOracleDrift = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    const separator = arg.indexOf("=");
    const flag = separator === -1 ? arg : arg.slice(0, separator);
    const inlineValue = separator === -1 ? undefined : arg.slice(separator + 1);

    const takeValue = (): string => {
      if (inlineValue !== undefined) return inlineValue;
      index += 1;
      const next = argv[index];
      if (next === undefined) throw new UsageError(`${flag} needs a value`);
      return next;
    };

    switch (flag) {
      case "--corpus":
        corpora.push(...splitList(takeValue()));
        break;
      case "--case":
        ids.push(...splitList(takeValue()));
        break;
      case "--update":
        update = true;
        break;
      case "--keep":
        keep = true;
        break;
      case "--allow-oracle-drift":
        allowOracleDrift = true;
        break;
      case "--json":
        json = true;
        break;
      case "-v":
      case "--verbose":
        verbose = true;
        break;
      case "-h":
      case "--help":
        help = true;
        break;
      default:
        throw new UsageError(`unknown option: ${arg}`);
    }
  }

  for (const corpus of corpora) {
    if (!CORPUS_NAMES.includes(corpus as CorpusName)) {
      throw new UsageError(
        `unknown corpus "${corpus}"; expected one of ${
          CORPUS_NAMES.join(", ")
        }`,
      );
    }
  }
  for (const id of ids) {
    if (!CASE_IDS.includes(id)) throw new UsageError(`unknown case "${id}"`);
  }

  return {
    help,
    verbose,
    json,
    update,
    keep,
    allowOracleDrift,
    corpora: corpora as readonly CorpusName[],
    ids,
  };
}

/** Tag shown at the start of a case's report line. */
function tagOf(testCase: ParityCase, evaluation: Evaluation): string {
  if (!evaluation.ok) return "FAIL";
  return testCase.status === "pending" ? "pending" : "ok";
}

function preview(text: string): string {
  const lines = text.split("\n");
  if (lines.length <= MAX_DUMP_LINES) return text;
  return [
    ...lines.slice(0, MAX_DUMP_LINES),
    `… ${lines.length - MAX_DUMP_LINES} more lines`,
  ].join("\n");
}

function dump(label: string, text: string): void {
  const body = text === "" ? "<empty>" : preview(text);
  for (const line of body.split("\n")) {
    console.log(`        ${label} | ${line}`);
  }
}

function reportLine(
  testCase: ParityCase,
  evaluation: Evaluation,
  options: Options,
): void {
  const tag = tagOf(testCase, evaluation).padEnd(TAG_WIDTH);
  const id = testCase.id.padEnd(ID_WIDTH);
  let suffix = "";
  if (!evaluation.ok) {
    suffix = `  ${evaluation.verdict}`;
  } else if (options.verbose) {
    suffix = `  ${evaluation.detail}`;
    if (testCase.note !== undefined) suffix += ` — ${testCase.note}`;
  }
  console.log(`${tag}${id}${suffix}`);
}

async function main(): Promise<number> {
  let options: Options;
  try {
    options = parseArgs(Deno.args);
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(`Error: ${error.message}`);
      console.error("");
      console.error(USAGE);
      return 2;
    }
    throw error;
  }

  if (options.help) {
    console.log(USAGE);
    return 0;
  }

  const oracle = resolveOracle((name) => Deno.env.get(name));
  const revision = oracle.root === undefined
    ? undefined
    : await readRevision(oracle.root);

  if (revision !== undefined && !revisionMatchesPin(revision)) {
    const message = `oracle at ${oracle.root} is at ${revision}, not the ` +
      `pinned ${ORACLE_PIN} (${ORACLE_PIN_SUBJECT})`;
    if (!options.allowOracleDrift) {
      console.error(`Error: ${message}.`);
      console.error(
        "Every comparison would be against a different engine. " +
          "Pass --allow-oracle-drift to compare anyway.",
      );
      return 1;
    }
    console.warn(`warning: ${message}.`);
  }

  const selected = selectCases({
    corpora: options.corpora,
    ids: options.ids,
  });

  if (!options.json) {
    console.log(`oracle  ${revision ?? "<unknown revision>"} (${oracle.bin})`);
    console.log(`deno    ${Deno.version.deno} (${Deno.execPath()})`);
    console.log(`${selected.length} cases`);
    console.log("");
  }

  const runOptions: RunCaseOptions = {
    oracle,
    ...(options.keep ? { keep: true } : {}),
  };

  const reported: unknown[] = [];
  let passed = 0;
  let pending = 0;
  let known = 0;
  const failures: string[] = [];

  for (const testCase of selected) {
    const run = await runCase(testCase, runOptions);
    let evaluation = run.evaluation;

    if (options.update && testCase.status === "known") {
      // Re-evaluate against the transcript just written, so `--update` exits on
      // the strength of the new fixture rather than the stale one it replaced.
      await writeTranscript(testCase, run.oracle, run.deno);
      evaluation = evaluateCase(
        testCase,
        run.oracle,
        run.deno,
        await readTranscript(testCase.id),
      );
    }

    if (!options.json) {
      reportLine(testCase, evaluation, options);
      if (!evaluation.ok) {
        console.log(`        verdict: ${evaluation.verdict}`);
        console.log(`        detail:  ${evaluation.detail}`);
        dump("oracle.out", run.oracle.stdout);
        dump("deno.out  ", run.deno.stdout);
        dump("oracle.err", run.oracle.stderr);
        dump("deno.err  ", run.deno.stderr);
        if (options.keep) console.log(`        scratch:  ${run.scratchRoot}`);
      }
    }

    reported.push({
      id: testCase.id,
      corpus: testCase.corpus,
      status: testCase.status,
      ok: evaluation.ok,
      verdict: evaluation.verdict,
      detail: evaluation.detail,
      oracleExitCode: run.oracle.exitCode,
      denoExitCode: run.deno.exitCode,
      oracleTreeDigest: run.oracle.tree?.digest ?? null,
      oracleChangedPaths: run.oracle.tree?.changes.map((change) => ({
        path: change.path,
        kind: change.kind,
      })) ?? null,
      denoTreeDigest: run.deno.tree?.digest ?? null,
      denoChangedPaths: run.deno.tree?.changes.map((change) => ({
        path: change.path,
        kind: change.kind,
      })) ?? null,
    });

    if (!evaluation.ok) failures.push(testCase.id);
    else if (testCase.status === "known") known += 1;
    else if (testCase.status === "pending") pending += 1;
    else passed += 1;
  }

  const summary = {
    total: selected.length,
    passed,
    pending,
    known,
    failed: failures.length,
    failures,
  };

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          oracle: {
            bin: oracle.bin,
            root: oracle.root ?? null,
            revision: revision ?? null,
            pin: ORACLE_PIN,
          },
          cases: reported,
          summary,
        },
        null,
        2,
      ),
    );
  } else {
    console.log("");
    console.log(
      `${summary.total} cases: ${passed} pass · ${pending} pending · ` +
        `${known} known · ${failures.length} failed`,
    );
    if (failures.length > 0) console.log(`failed: ${failures.join(", ")}`);
  }

  return failures.length === 0 ? 0 : 1;
}

if (import.meta.main) {
  Deno.exit(await main());
}
