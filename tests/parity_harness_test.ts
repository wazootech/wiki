/**
 * Unit tests for the differential harness's case machinery.
 *
 * These cover the decision logic only — no Python, no subprocesses — so they
 * belong to the default `deno task test` gate even though the harness as a
 * whole needs the pinned oracle. The corpus staging and process execution are
 * exercised by `deno task parity` itself.
 */
import { assertEquals, assertThrows } from "@std/assert";
import { join } from "@std/path";
import {
  type CliResult,
  corpusSpec,
  denoInvocation,
  describeDifference,
  diffTreeSnapshots,
  evaluateCase,
  firstDifferingLine,
  REPO_ROOT,
  resultsMatch,
  snapshotTree,
  type Transcript,
} from "../parity/harness.ts";
import { CASE_IDS, selectCases } from "../parity/cases.ts";
import type { ParityCase } from "../parity/harness.ts";
import { normalizeOutput } from "../parity/normalize.ts";

function result(
  exitCode: number,
  stdout = "",
  stderr = "",
): CliResult {
  return { exitCode, stdout, stderr };
}

function testCase(status: ParityCase["status"]): ParityCase {
  return { id: "sample", corpus: "micro", argv: [], status };
}

function transcript(oracle: CliResult, deno: CliResult): Transcript {
  return { caseId: "sample", argv: [], oracle, deno };
}

Deno.test("resultsMatch requires exit code, stdout, and stderr", () => {
  assertEquals(resultsMatch(result(0, "a", ""), result(0, "a", "")), true);
  assertEquals(resultsMatch(result(0, "a", ""), result(1, "a", "")), false);
  assertEquals(resultsMatch(result(0, "a", ""), result(0, "b", "")), false);
  assertEquals(resultsMatch(result(0, "a", ""), result(0, "a", "w")), false);
});

Deno.test("firstDifferingLine reports the line number and both texts", () => {
  assertEquals(firstDifferingLine("a\nb", "a\nc"), {
    line: 2,
    left: "b",
    right: "c",
  });
  assertEquals(firstDifferingLine("a", "a"), undefined);
});

Deno.test("firstDifferingLine reports an absent line rather than crashing", () => {
  assertEquals(firstDifferingLine("a\nb", "a"), {
    line: 2,
    left: "b",
    right: "<no line>",
  });
});

Deno.test("describeDifference names the exit code and the stream", () => {
  const described = describeDifference(
    "oracle",
    result(1, "same", "left"),
    "deno",
    result(2, "same", "right"),
  );
  assertEquals(described.includes("exit oracle=1 deno=2"), true);
  assertEquals(described.includes("stderr line 1"), true);
  assertEquals(described.includes("stdout"), false);
});

Deno.test("a parity case passes only on an exact match", () => {
  const match = evaluateCase(
    testCase("parity"),
    result(0, "x"),
    result(0, "x"),
    undefined,
  );
  assertEquals(match.ok, true);
  assertEquals(match.verdict, "match");

  const diverge = evaluateCase(
    testCase("parity"),
    result(0, "x"),
    result(2, ""),
    undefined,
  );
  assertEquals(diverge.ok, false);
  assertEquals(diverge.verdict, "diverge");
});

Deno.test("a pending case passes while it diverges", () => {
  const evaluation = evaluateCase(
    testCase("pending"),
    result(1, "findings"),
    result(2, "usage"),
    undefined,
  );
  assertEquals(evaluation.ok, true);
  assertEquals(evaluation.verdict, "diverge");
});

Deno.test("a pending case fails once it starts matching, demanding promotion", () => {
  // Silent progress is how a gate rots: matching without being promoted to
  // `parity` has to be visible.
  const evaluation = evaluateCase(
    testCase("pending"),
    result(0, "same"),
    result(0, "same"),
    undefined,
  );
  assertEquals(evaluation.ok, false);
  assertEquals(evaluation.verdict, "unexpected-match");
  assertEquals(evaluation.detail.includes("parity"), true);
});

Deno.test("a known case without a transcript fails", () => {
  const evaluation = evaluateCase(
    testCase("known"),
    result(0, "oracle"),
    result(2, "deno"),
    undefined,
  );
  assertEquals(evaluation.ok, false);
  assertEquals(evaluation.verdict, "missing-transcript");
});

Deno.test("a known case passes against its committed divergence", () => {
  // Transcripts are stored normalised, so a CRLF run has to fold to the LF
  // fixture before the comparison — the same order `runCase` applies.
  const oracle = result(0, normalizeOutput("\r\n orACLe \u001b[0m\r\n"));
  const deno = result(2, "deno");
  const evaluation = evaluateCase(
    testCase("known"),
    oracle,
    deno,
    transcript(result(0, "\n orACLe \n"), deno),
  );
  assertEquals(evaluation.ok, true);
  assertEquals(evaluation.verdict, "diverge");
});

Deno.test("a known case fails when the port drifts from the transcript", () => {
  const evaluation = evaluateCase(
    testCase("known"),
    result(0, "oracle"),
    result(0, "now matches!"),
    transcript(result(0, "oracle"), result(2, "usage")),
  );
  assertEquals(evaluation.ok, false);
  assertEquals(evaluation.verdict, "stale-transcript");
  assertEquals(evaluation.detail.includes("deno drifted"), true);
});

Deno.test("a known case fails when the oracle drifts from the transcript", () => {
  const evaluation = evaluateCase(
    testCase("known"),
    result(0, "changed oracle"),
    result(2, "usage"),
    transcript(result(0, "old oracle"), result(2, "usage")),
  );
  assertEquals(evaluation.ok, false);
  assertEquals(evaluation.verdict, "stale-transcript");
  assertEquals(evaluation.detail.includes("oracle drifted"), true);
});

Deno.test("the micro corpus is its own config root", () => {
  const spec = corpusSpec("micro");
  assertEquals(spec.sourceRoot, join(REPO_ROOT, "parity", "corpus", "micro"));
  assertEquals(spec.entries, ["."]);
  assertEquals(spec.configPath, "wiki.yml");
});

Deno.test("the docs corpus is staged from the repository root", () => {
  const spec = corpusSpec("docs");
  assertEquals(spec.sourceRoot, REPO_ROOT);
  assertEquals(spec.entries, ["docs"]);
  assertEquals(spec.configPath, join("docs", "wiki.yml"));
});

Deno.test("the CLI under test is invoked with the project config", () => {
  const invocation = denoInvocation(["--version"]);
  assertEquals(invocation.includes("--config"), true);
  assertEquals(invocation.includes(join(REPO_ROOT, "deno.json")), true);
  assertEquals(invocation.at(-1), "--version");
});

Deno.test("selectCases filters by corpus and id", () => {
  assertEquals(
    selectCases({ corpora: ["docs"], ids: [] }).every((c) =>
      c.corpus === "docs"
    ),
    true,
  );
  assertEquals(
    selectCases({ corpora: [], ids: ["version"] }).map((c) => c.id),
    ["version"],
  );
  assertEquals(
    selectCases({ corpora: [], ids: [] }).length,
    CASE_IDS.length,
  );
});

Deno.test("selectCases refuses a selection that matches nothing", () => {
  assertThrows(() => selectCases({ corpora: ["nope"], ids: [] }));
});

Deno.test("tree snapshots digest created, changed, and deleted files", async () => {
  const root = await Deno.makeTempDir({ prefix: "wiki-parity-tree-" });
  try {
    Deno.writeTextFileSync(join(root, "changed.md"), "before\r\n");
    Deno.writeTextFileSync(join(root, "deleted.md"), "removed\n");
    Deno.mkdirSync(join(root, ".wiki", "cache"), { recursive: true });
    Deno.writeTextFileSync(
      join(root, ".wiki", "cache", "warm.nt"),
      "old cache",
    );
    const before = await snapshotTree(root);

    Deno.writeTextFileSync(join(root, "changed.md"), "after\n");
    Deno.removeSync(join(root, "deleted.md"));
    Deno.writeTextFileSync(join(root, "created.md"), "added\n");
    Deno.writeTextFileSync(
      join(root, ".wiki", "cache", "warm.nt"),
      "new cache",
    );
    const after = await snapshotTree(root);
    const diff = await diffTreeSnapshots(before, after);

    assertEquals(
      diff.changes.map(({ path, kind }) => [path, kind]),
      [
        ["changed.md", "changed"],
        ["created.md", "created"],
        ["deleted.md", "deleted"],
      ],
    );
    assertEquals(diff.digest.length, 64);
    assertEquals(diff.digest, (await diffTreeSnapshots(before, after)).digest);
    assertEquals(
      diff.digest,
      (await diffTreeSnapshots(before, new Map([...after].reverse()))).digest,
    );
    const retainedFile = await diffTreeSnapshots(
      new Map([...before, ["untouched.md", "before"]]),
      new Map([...after, ["untouched.md", "before"]]),
    );
    assertEquals(retainedFile.changes, diff.changes);
    assertEquals(retainedFile.digest === diff.digest, false);
  } finally {
    Deno.removeSync(root, { recursive: true });
  }
});

Deno.test("render and build parity cases compare resulting trees", () => {
  const mutatingCases = selectCases({
    corpora: ["micro"],
    ids: ["render-micro", "build-micro"],
  });
  assertEquals(mutatingCases.length, 2);
  assertEquals(
    mutatingCases.every((testCase) => testCase.mutates === true),
    true,
  );
});

Deno.test("tree digest participates in parity results", () => {
  const left = {
    ...result(0, "same"),
    tree: { digest: "left", changes: [] },
  };
  const right = {
    ...result(0, "same"),
    tree: { digest: "right", changes: [] },
  };
  assertEquals(resultsMatch(left, right), false);
  const evaluation = evaluateCase(testCase("parity"), left, right, undefined);
  assertEquals(evaluation.ok, false);
  assertEquals(evaluation.detail.includes("tree digest"), true);
});
Deno.test("tree snapshots ignore cache files and normalize text contents", async () => {
  const root = await Deno.makeTempDir({ prefix: "wiki-parity-tree-" });
  const sourcePath = join(root, "page.txt");
  const cachePath = join(root, ".wiki", "cache", "graph.nt");
  try {
    await Deno.mkdir(join(root, ".wiki", "cache"), { recursive: true });
    await Deno.writeTextFile(sourcePath, "\uFEFFsame\r\n");
    await Deno.writeTextFile(cachePath, "first");
    const before = await snapshotTree(root);

    await Deno.writeTextFile(sourcePath, "same\n");
    await Deno.writeTextFile(cachePath, "nondeterministic");
    const after = await snapshotTree(root);
    const diff = await diffTreeSnapshots(before, after);

    assertEquals([...before.keys()], ["page.txt"]);
    assertEquals(diff.changes, []);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
