/**
 * Differential harness for the Deno rewrite (issue #273, Phase 2).
 *
 * The spine of the migration: run the pinned Python oracle and the Deno CLI
 * over the same corpus, in the same scratch directory, with the same argv, then
 * compare exit code, normalised stdout/stderr, and mutating-command tree digests.
 *
 * Each case declares how its divergence is accounted for:
 *
 * - `parity` — the two CLIs must agree exactly. This is a gate.
 * - `pending` — the command is not ported yet, so disagreement is expected.
 *   When a `pending` case starts agreeing, the harness *fails*: silent progress
 *   is how a gate rots, so promotion to `parity` has to be deliberate.
 * - `known` — the divergence is accepted and recorded. The case must still
 *   match its committed transcript in `parity/transcripts/`, on both sides, so
 *   neither the port nor the oracle can drift unnoticed.
 *
 * Every case runs in a fresh copy of its corpus under `.parity-tmp/`, and the
 * copy is re-made between the two runs. That gives both CLIs byte-identical
 * inputs, an identical absolute path, and no ordering effects between mutating
 * commands.
 */

import { copy, ensureDir, exists } from "@std/fs";
import { dirname, fromFileUrl, join, relative } from "@std/path";
import {
  normalizeOutput,
  normalizeTreePath,
  normalizeTreeText,
} from "./normalize.ts";
import type { OracleCommand } from "./oracle.ts";

/** Repository root of the Deno rewrite worktree. */
export const REPO_ROOT = dirname(dirname(fromFileUrl(import.meta.url)));

/** Scratch directory for per-case corpus copies; gitignored. */
export const SCRATCH_ROOT = join(REPO_ROOT, ".parity-tmp");

/** The CLI under test. */
export const DENO_CLI_ENTRY = join(REPO_ROOT, "src", "wiki", "cli.ts");

/** Committed divergence transcripts. */
export const TRANSCRIPT_DIR = join(REPO_ROOT, "parity", "transcripts");

/** Corpora the harness knows how to stage. */
export type CorpusName = "micro" | "docs";

/**
 * `micro` is a small hand-written corpus that is deliberately dirty, so each
 * command compares non-empty output and non-zero exit codes. `docs` is this
 * repository's own 87-page wiki, which is clean — its value is the opposite:
 * a port that invents warnings where the oracle is silent fails there.
 */
export interface CorpusSpec {
  readonly name: CorpusName;
  /** Directory the entries are copied from. */
  readonly sourceRoot: string;
  /** Paths relative to `sourceRoot`; `"."` copies the whole directory. */
  readonly entries: readonly string[];
  /** Config path relative to a case's scratch directory. */
  readonly configPath: string;
}

export function corpusSpec(name: CorpusName): CorpusSpec {
  switch (name) {
    case "micro":
      return {
        name,
        sourceRoot: join(REPO_ROOT, "parity", "corpus", "micro"),
        entries: ["."],
        configPath: "wiki.yml",
      };
    case "docs":
      return {
        name,
        sourceRoot: REPO_ROOT,
        entries: ["docs"],
        configPath: join("docs", "wiki.yml"),
      };
  }
}

/** How far a case has moved towards parity. */
export type CaseStatus = "parity" | "pending" | "known";

export interface ParityCase {
  /** Stable identifier; also the transcript filename and scratch directory. */
  readonly id: string;
  readonly corpus: CorpusName;
  readonly argv: readonly string[];
  readonly status: CaseStatus;
  /** Fed to stdin when the command reads its query from a pipe. */
  readonly stdin?: string;
  /** Compare the corpus/output tree after the command as well as its streams. */
  readonly mutates?: boolean;
  /** Why the divergence exists. Expected on `known` cases. */
  readonly note?: string;
}

/** One CLI's captured process contract. */
export interface TreeChange {
  readonly path: string;
  readonly kind: "created" | "changed" | "deleted";
  readonly beforeHash?: string;
  readonly afterHash?: string;
}

export interface TreeDiff {
  readonly digest: string;
  readonly changes: readonly TreeChange[];
}

export interface CliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly tree?: TreeDiff;
}

/** A committed `known` divergence. */
export interface Transcript {
  readonly caseId: string;
  readonly argv: readonly string[];
  readonly note?: string;
  readonly oracle: CliResult;
  readonly deno: CliResult;
}

export type Verdict =
  | "match"
  | "diverge"
  | "unexpected-match"
  | "missing-transcript"
  | "stale-transcript";

export interface Evaluation {
  readonly ok: boolean;
  readonly verdict: Verdict;
  readonly detail: string;
}

const DECODER = new TextDecoder();
const ENCODER = new TextEncoder();

/** Environment shared by both CLIs, so rendering differences cannot hide. */
function childEnv(): Record<string, string> {
  return {
    ...Deno.env.toObject(),
    NO_COLOR: "1",
    DENO_NO_UPDATE_CHECK: "1",
  };
}

/** Compare two normalised results. */
export function resultsMatch(left: CliResult, right: CliResult): boolean {
  return left.exitCode === right.exitCode &&
    left.stdout === right.stdout &&
    left.stderr === right.stderr &&
    left.tree?.digest === right.tree?.digest;
}

/** First line where two streams differ, or `undefined` when they agree. */
export function firstDifferingLine(
  left: string,
  right: string,
): { line: number; left: string; right: string } | undefined {
  const leftLines = left.split("\n");
  const rightLines = right.split("\n");
  const length = Math.max(leftLines.length, rightLines.length);
  for (let index = 0; index < length; index += 1) {
    const leftLine = leftLines[index];
    const rightLine = rightLines[index];
    if (leftLine !== rightLine) {
      return {
        line: index + 1,
        left: leftLine ?? "<no line>",
        right: rightLine ?? "<no line>",
      };
    }
  }
  return undefined;
}

/**
 * One-line summary of where two results part ways.
 *
 * The first differing line of each stream is enough to identify a case; the
 * full outputs are printed by the runner when a case fails, so the harness
 * never has to guess how much context to carry.
 */
export function describeDifference(
  leftLabel: string,
  left: CliResult,
  rightLabel: string,
  right: CliResult,
): string {
  const parts: string[] = [];
  if (left.exitCode !== right.exitCode) {
    parts.push(
      `exit ${leftLabel}=${left.exitCode} ${rightLabel}=${right.exitCode}`,
    );
  }
  for (const stream of ["stdout", "stderr"] as const) {
    const difference = firstDifferingLine(left[stream], right[stream]);
    if (difference !== undefined) {
      parts.push(
        `${stream} line ${difference.line}: ` +
          `${leftLabel}=${JSON.stringify(difference.left)} ` +
          `${rightLabel}=${JSON.stringify(difference.right)}`,
      );
    }
  }
  if (left.tree?.digest !== right.tree?.digest) {
    parts.push(
      describeTreeDifference(leftLabel, left.tree, rightLabel, right.tree),
    );
  }
  return parts.length > 0 ? parts.join("; ") : "results differ";
}

function describeTreeChange(change: TreeChange | undefined): string {
  if (change === undefined) return "unchanged";
  const before = change.beforeHash?.slice(0, 12) ?? "-";
  const after = change.afterHash?.slice(0, 12) ?? "-";
  return `${change.kind} (${before} -> ${after})`;
}

function describeTreeDifference(
  leftLabel: string,
  left: TreeDiff | undefined,
  rightLabel: string,
  right: TreeDiff | undefined,
): string {
  const leftChanges = new Map(
    left?.changes.map((change) => [change.path, change]),
  );
  const rightChanges = new Map(
    right?.changes.map((change) => [change.path, change]),
  );
  const paths = [...new Set([...leftChanges.keys(), ...rightChanges.keys()])]
    .sort();
  for (const path of paths) {
    const leftChange = leftChanges.get(path);
    const rightChange = rightChanges.get(path);
    if (JSON.stringify(leftChange) !== JSON.stringify(rightChange)) {
      return `tree ${path}: ${leftLabel}=${describeTreeChange(leftChange)} ` +
        `${rightLabel}=${describeTreeChange(rightChange)}`;
    }
  }
  return `tree digest ${leftLabel}=${left?.digest.slice(0, 12) ?? "none"} ` +
    `${rightLabel}=${right?.digest.slice(0, 12) ?? "none"}`;
}

/** Decide whether a case passes, from already-normalised results. */
export function evaluateCase(
  testCase: ParityCase,
  oracle: CliResult,
  deno: CliResult,
  transcript: Transcript | undefined,
): Evaluation {
  switch (testCase.status) {
    case "parity":
      return resultsMatch(oracle, deno)
        ? { ok: true, verdict: "match", detail: "matches the oracle" }
        : {
          ok: false,
          verdict: "diverge",
          detail: describeDifference("oracle", oracle, "deno", deno),
        };
    case "pending":
      return resultsMatch(oracle, deno)
        ? {
          ok: false,
          verdict: "unexpected-match",
          detail: 'now matches the oracle — promote this case to "parity"',
        }
        : { ok: true, verdict: "diverge", detail: "not yet ported" };
    case "known": {
      if (transcript === undefined) {
        return {
          ok: false,
          verdict: "missing-transcript",
          detail: `no transcript recorded — rerun with --update`,
        };
      }
      if (!resultsMatch(deno, transcript.deno)) {
        return {
          ok: false,
          verdict: "stale-transcript",
          detail: `deno drifted from the transcript: ${
            describeDifference("transcript", transcript.deno, "deno", deno)
          }`,
        };
      }
      if (!resultsMatch(oracle, transcript.oracle)) {
        return {
          ok: false,
          verdict: "stale-transcript",
          detail: `oracle drifted from the transcript: ${
            describeDifference(
              "transcript",
              transcript.oracle,
              "oracle",
              oracle,
            )
          }`,
        };
      }
      return {
        ok: true,
        verdict: "diverge",
        detail: testCase.note ?? "recorded divergence",
      };
    }
  }
}

async function removeDir(path: string): Promise<void> {
  try {
    await Deno.remove(path, { recursive: true });
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
}

const TREE_CACHE_DIRS = new Set([
  ".cache",
  ".mypy_cache",
  ".pytest_cache",
  ".ruff_cache",
  "__pycache__",
]);

function isNondeterministicCachePath(path: string): boolean {
  const normalized = normalizeTreePath(path);
  return normalized === ".wiki/cache" ||
    normalized.startsWith(".wiki/cache/") ||
    normalized.split("/").some((part) => TREE_CACHE_DIRS.has(part));
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const input = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(input).set(bytes);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", input));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function digestTreeFile(path: string, root: string): Promise<string> {
  let bytes: Uint8Array;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(
      await Deno.readFile(path),
    );
    bytes = ENCODER.encode(normalizeTreeText(text, root));
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    bytes = await Deno.readFile(path);
  }
  return await sha256(bytes);
}

/** Snapshot regular files by stable relative path, omitting known cache trees. */
export async function snapshotTree(root: string): Promise<Map<string, string>> {
  const snapshot = new Map<string, string>();
  async function visit(directory: string): Promise<void> {
    for await (const entry of Deno.readDir(directory)) {
      const absolutePath = join(directory, entry.name);
      const path = normalizeTreePath(relative(root, absolutePath));
      if (isNondeterministicCachePath(path)) continue;
      if (entry.isDirectory) {
        await visit(absolutePath);
      } else if (entry.isFile) {
        snapshot.set(path, await digestTreeFile(absolutePath, root));
      } else if (entry.isSymlink) {
        const target = await Deno.readLink(absolutePath);
        snapshot.set(
          path,
          await sha256(ENCODER.encode(normalizeTreeText(target, root))),
        );
      }
    }
  }
  await visit(root);
  return snapshot;
}

/** Digest the normalized result tree and describe its created/changed/deleted files. */
export async function diffTreeSnapshots(
  before: ReadonlyMap<string, string>,
  after: ReadonlyMap<string, string>,
): Promise<TreeDiff> {
  const paths = [...new Set([...before.keys(), ...after.keys()])].sort();
  const changes: TreeChange[] = [];
  for (const path of paths) {
    const beforeHash = before.get(path);
    const afterHash = after.get(path);
    if (beforeHash === undefined && afterHash !== undefined) {
      changes.push({ path, kind: "created", afterHash });
    } else if (beforeHash !== undefined && afterHash === undefined) {
      changes.push({ path, kind: "deleted", beforeHash });
    } else if (
      beforeHash !== undefined && afterHash !== undefined &&
      beforeHash !== afterHash
    ) {
      changes.push({ path, kind: "changed", beforeHash, afterHash });
    }
  }
  const files = [...after].sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0
  );
  const digestInput = JSON.stringify({
    files,
    changes: changes.map((change) => [
      change.path,
      change.kind,
      change.beforeHash ?? null,
      change.afterHash ?? null,
    ]),
  });
  return { digest: await sha256(ENCODER.encode(digestInput)), changes };
}

/** Stage a pristine copy of a case's corpus and return its absolute path. */
export async function provisionCaseDir(
  testCase: ParityCase,
  scratchRoot: string = SCRATCH_ROOT,
): Promise<string> {
  const spec = corpusSpec(testCase.corpus);
  const destination = join(scratchRoot, testCase.id);
  await removeDir(destination);
  await ensureDir(destination);
  for (const entry of spec.entries) {
    const source = entry === "."
      ? spec.sourceRoot
      : join(spec.sourceRoot, entry);
    const target = entry === "." ? destination : join(destination, entry);
    await copy(source, target, { overwrite: true });
  }
  const config = join(destination, spec.configPath);
  if (!(await exists(config))) {
    throw new Error(
      `case ${testCase.id}: corpus "${spec.name}" staged without a config at ` +
        `${spec.configPath}; the case would silently run against defaults`,
    );
  }
  return destination;
}

export interface SpawnOptions {
  readonly bin: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly stdin?: string;
}

/**
 * Run one CLI and capture its process contract.
 *
 * `stdin` is only piped when a case supplies one, because a null stdin is part
 * of the contract too: `wiki query` with no argument reads the query from the
 * pipe, and an interactive fallback would hang the harness.
 */
export async function spawnCli(options: SpawnOptions): Promise<CliResult> {
  const command = new Deno.Command(options.bin, {
    args: [...options.args],
    cwd: options.cwd,
    stdin: options.stdin === undefined ? "null" : "piped",
    stdout: "piped",
    stderr: "piped",
    env: childEnv(),
  });

  if (options.stdin === undefined) {
    const { code, stdout, stderr } = await command.output();
    return {
      exitCode: code,
      stdout: DECODER.decode(stdout),
      stderr: DECODER.decode(stderr),
    };
  }

  // The payloads here are a single short query, well under the pipe buffer, so
  // writing before draining stdout cannot deadlock.
  const child = command.spawn();
  const writer = child.stdin.getWriter();
  await writer.write(ENCODER.encode(options.stdin));
  await writer.close();
  const { code, stdout, stderr } = await child.output();
  return {
    exitCode: code,
    stdout: DECODER.decode(stdout),
    stderr: DECODER.decode(stderr),
  };
}

/** argv that runs the CLI under test. */
export function denoInvocation(argv: readonly string[]): readonly string[] {
  return [
    "run",
    "--quiet",
    "--allow-all",
    "--config",
    join(REPO_ROOT, "deno.json"),
    DENO_CLI_ENTRY,
    ...argv,
  ];
}

export interface CaseRun {
  readonly testCase: ParityCase;
  readonly oracle: CliResult;
  readonly deno: CliResult;
  readonly evaluation: Evaluation;
  readonly scratchRoot: string;
}

export interface RunCaseOptions {
  readonly oracle: OracleCommand;
  readonly scratchRoot?: string;
  /** Keep the scratch copy after the run, for inspection. */
  readonly keep?: boolean;
}

/** Run one case against both CLIs and evaluate the outcome. */
export async function runCase(
  testCase: ParityCase,
  options: RunCaseOptions,
): Promise<CaseRun> {
  const scratchRoot = options.scratchRoot ?? SCRATCH_ROOT;
  const cwd = await provisionCaseDir(testCase, scratchRoot);
  const oracleBefore = testCase.mutates === true
    ? await snapshotTree(cwd)
    : undefined;

  const oracleRaw = await spawnCli({
    bin: options.oracle.bin,
    args: testCase.argv,
    cwd,
    ...(testCase.stdin === undefined ? {} : { stdin: testCase.stdin }),
  });
  const oracleTree = oracleBefore === undefined
    ? undefined
    : await diffTreeSnapshots(oracleBefore, await snapshotTree(cwd));

  // Re-stage so the Deno run sees the same tree the oracle saw, not the tree
  // the oracle left behind.
  await provisionCaseDir(testCase, scratchRoot);
  const denoBefore = testCase.mutates === true
    ? await snapshotTree(cwd)
    : undefined;

  const denoRaw = await spawnCli({
    bin: Deno.execPath(),
    args: denoInvocation(testCase.argv),
    cwd,
    ...(testCase.stdin === undefined ? {} : { stdin: testCase.stdin }),
  });
  const denoTree = denoBefore === undefined
    ? undefined
    : await diffTreeSnapshots(denoBefore, await snapshotTree(cwd));

  const oracle: CliResult = {
    exitCode: oracleRaw.exitCode,
    stdout: normalizeOutput(oracleRaw.stdout, { scratchRoot: cwd }),
    stderr: normalizeOutput(oracleRaw.stderr, { scratchRoot: cwd }),
    ...(oracleTree === undefined ? {} : { tree: oracleTree }),
  };
  const deno: CliResult = {
    exitCode: denoRaw.exitCode,
    stdout: normalizeOutput(denoRaw.stdout, { scratchRoot: cwd }),
    stderr: normalizeOutput(denoRaw.stderr, { scratchRoot: cwd }),
    ...(denoTree === undefined ? {} : { tree: denoTree }),
  };

  const transcript = testCase.status === "known"
    ? await readTranscript(testCase.id)
    : undefined;

  const evaluation = evaluateCase(testCase, oracle, deno, transcript);

  if (options.keep !== true) {
    await removeDir(cwd);
  }

  return { testCase, oracle, deno, evaluation, scratchRoot: cwd };
}

/** Read a committed transcript, or `undefined` when the case has none. */
export async function readTranscript(
  caseId: string,
): Promise<Transcript | undefined> {
  const path = join(TRANSCRIPT_DIR, `${caseId}.json`);
  let text: string;
  try {
    text = await Deno.readTextFile(path);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return undefined;
    throw error;
  }
  // Transcripts are stored normalised, so reading them through the same fold
  // keeps a fresh clone comparable with the machine that recorded them.
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`transcript ${caseId} is not an object`);
  }
  return parsed as Transcript;
}

/** Record (or refresh) a `known` divergence. Returns the path written. */
export async function writeTranscript(
  testCase: ParityCase,
  oracle: CliResult,
  deno: CliResult,
): Promise<string> {
  await ensureDir(TRANSCRIPT_DIR);
  const path = join(TRANSCRIPT_DIR, `${testCase.id}.json`);
  const transcript: Transcript = {
    caseId: testCase.id,
    argv: testCase.argv,
    ...(testCase.note === undefined ? {} : { note: testCase.note }),
    oracle,
    deno,
  };
  await Deno.writeTextFile(path, `${JSON.stringify(transcript, null, 2)}\n`);
  return path;
}
