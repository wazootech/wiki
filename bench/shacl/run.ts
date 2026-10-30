/**
 * The shared SHACL benchmark (#414): generate a fixture per size, run every
 * case against it in its own process, and print a Markdown table.
 *
 * Usage:
 *   deno task bench:shacl [--sizes 1e3,1e4,1e5,1e6] [--cases a,b]
 *                         [--timeout 600] [--json results.json] [--out DIR]
 *   deno task bench:shacl --emit DIR [--sizes ...]   # fixture files only
 *
 * `--emit` writes `data.nt` and `shapes.ttl` per size and stops, which is how a
 * Worlds-side harness gets the identical graph. See `bench/shacl/README.md`.
 */

import { fromFileUrl, join } from "@std/path";
import type { CaseName, CaseResult } from "./case.ts";
import { generateFixture } from "./fixture.ts";
import { type CaseFailure, parseArgs, type SizeResult } from "./run/options.ts";
import { megabytes, phaseText, seconds, writeFixture } from "./run/runner.ts";

/** The per-case entry point, spawned once per case. */
const CASE_SCRIPT = fromFileUrl(new URL("./case.ts", import.meta.url));

async function runOne(
  name: CaseName,
  dir: string,
  timeoutSeconds: number,
): Promise<CaseResult | CaseFailure> {
  const start = performance.now();
  const elapsed = () => Math.round(performance.now() - start);
  const signal = AbortSignal.timeout(timeoutSeconds * 1000);
  const timeout = (): CaseFailure => ({
    case: name,
    ok: false,
    reason: `timeout after ${timeoutSeconds} s`,
    totalMs: elapsed(),
  });
  try {
    const output = await new Deno.Command(Deno.execPath(), {
      args: ["run", "-A", CASE_SCRIPT, name, dir],
      stdout: "piped",
      stderr: "piped",
      signal,
    }).output();
    // On Windows the killed child resolves as a plain exit 1 with no output
    // instead of rejecting, so the signal, not the exit code, says it timed out.
    if (signal.aborted) return timeout();
    const stdout = new TextDecoder().decode(output.stdout).trim();
    if (!output.success) {
      const stderr = new TextDecoder().decode(output.stderr);
      const oom = /heap out of memory|Allocation failed/i.test(stderr);
      const last = stderr.split("\n").map((line) => line.trim())
        .filter((line) => line !== "").at(-1) ?? "(no stderr)";
      return {
        case: name,
        ok: false,
        reason: oom ? "out of memory" : `exit ${output.code}: ${last}`,
        totalMs: elapsed(),
      };
    }
    return JSON.parse(stdout.split("\n").at(-1) ?? "") as CaseResult;
  } catch (error) {
    if (signal.aborted) return timeout();
    return { case: name, ok: false, reason: String(error), totalMs: elapsed() };
  }
}

function table(results: readonly SizeResult[]): string {
  const rows = [
    "| Quads | Case | Total | Phases | Peak RSS | Violations |",
    "|---:|---|---:|---|---:|---:|",
  ];
  for (const size of results) {
    for (const result of size.cases) {
      rows.push(
        result.ok
          ? `| ${size.quads} | ${result.case} | ${seconds(result.totalMs)} | ${
            phaseText(result.phases)
          } | ${megabytes(result.peakRss)} | ${result.violations ?? ""} |`
          : `| ${size.quads} | ${result.case} | ${
            seconds(result.totalMs)
          } | **failed: ${result.reason}** | | |`,
      );
    }
  }
  return rows.join("\n");
}

if (import.meta.main) {
  const options = parseArgs(Deno.args);

  if (options.emit !== null) {
    for (const size of options.sizes) {
      const fixture = generateFixture(size);
      const dir = join(options.emit, String(size));
      writeFixture(dir, fixture.ntriples, false);
      console.log(`${dir}: ${fixture.quads} quads`);
    }
    Deno.exit(0);
  }

  const root = options.out ??
    Deno.makeTempDirSync({ prefix: "wiki-shacl-bench-" });
  const results: SizeResult[] = [];
  for (const size of options.sizes) {
    const fixture = generateFixture(size);
    const dir = join(root, String(size));
    writeFixture(dir, fixture.ntriples, true);
    const cases: (CaseResult | CaseFailure)[] = [];
    for (const name of options.cases) {
      const result = await runOne(name, dir, options.timeoutSeconds);
      console.error(
        `${fixture.quads} quads  ${name}: ${
          result.ok ? seconds(result.totalMs) : `failed (${result.reason})`
        }`,
      );
      cases.push(result);
    }
    results.push({
      targetQuads: size,
      quads: fixture.quads,
      people: fixture.people,
      orgs: fixture.orgs,
      violatingPeople: fixture.violatingPeople,
      cases,
    });
  }

  if (options.json !== null) {
    Deno.writeTextFileSync(
      options.json,
      JSON.stringify(
        {
          version: 1,
          deno: Deno.version.deno,
          os: Deno.build.os,
          arch: Deno.build.arch,
          results,
        },
        null,
        2,
      ) + "\n",
    );
  }
  console.log(table(results));
  if (options.out === null) Deno.removeSync(root, { recursive: true });
}
