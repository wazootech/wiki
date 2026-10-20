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
import { type CaseName, type CaseResult, CASES } from "./case.ts";
import {
  generateFixture,
  orgIri,
  personIri,
  SHAPES_TURTLE,
} from "./fixture.ts";

/** The per-case entry point, spawned once per case. */
const CASE_SCRIPT = fromFileUrl(new URL("./case.ts", import.meta.url));

/** Markdown pages added to every Wiki fixture, for the scoped cases. */
const PAGES = 50;

interface Options {
  sizes: number[];
  cases: CaseName[];
  timeoutSeconds: number;
  json: string | null;
  out: string | null;
  emit: string | null;
}

/** A case that did not produce a result: it timed out, crashed, or ran out of memory. */
interface CaseFailure {
  readonly case: CaseName;
  readonly ok: false;
  readonly reason: string;
  readonly totalMs: number;
}

interface SizeResult {
  readonly targetQuads: number;
  readonly quads: number;
  readonly people: number;
  readonly orgs: number;
  readonly violatingPeople: number;
  readonly cases: readonly (CaseResult | CaseFailure)[];
}

function parseArgs(args: readonly string[]): Options {
  const options: Options = {
    sizes: [1e3, 1e4, 1e5, 1e6],
    cases: [...CASES],
    timeoutSeconds: 600,
    json: null,
    out: null,
    emit: null,
  };
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    const value = args[i + 1];
    if (value === undefined) throw new Error(`${flag} needs a value`);
    i++;
    if (flag === "--sizes") {
      options.sizes = value.split(",").map(Number);
      if (options.sizes.some((n) => !Number.isFinite(n) || n <= 0)) {
        throw new Error(`--sizes must be positive numbers: ${value}`);
      }
    } else if (flag === "--cases") {
      const cases = value.split(",");
      const unknown = cases.filter((c) => !CASES.includes(c as CaseName));
      if (unknown.length > 0) {
        throw new Error(`Unknown case(s): ${unknown.join(", ")}`);
      }
      options.cases = cases as CaseName[];
    } else if (flag === "--timeout") options.timeoutSeconds = Number(value);
    else if (flag === "--json") options.json = value;
    else if (flag === "--out") options.out = value;
    else if (flag === "--emit") options.emit = value;
    else throw new Error(`Unknown flag: ${flag}`);
  }
  return options;
}

/**
 * A Markdown page for a person the fixture also knows about, so the scoped
 * cases validate real frontmatter. Scoped mode sees only the page, so the
 * `sh:class` and path constraints that reach other documents report there:
 * that is scoped mode's documented behaviour, and it times the report path.
 */
function page(index: number): string {
  return [
    "---",
    "type: Person",
    `givenName: Bench ${index}`,
    `email: bench-${index}@bench.example`,
    "worksFor:",
    `  "@id": ${orgIri(0)}`,
    "knows:",
    `  "@id": ${personIri(index)}`,
    "---",
    `# Bench Person ${index}`,
    "",
  ].join("\n");
}

function writeFixture(dir: string, ntriples: string, withWiki: boolean): void {
  Deno.mkdirSync(dir, { recursive: true });
  Deno.writeTextFileSync(join(dir, "data.nt"), ntriples);
  Deno.writeTextFileSync(join(dir, "shapes.ttl"), SHAPES_TURTLE);
  if (!withWiki) return;
  const wiki = join(dir, "wiki");
  Deno.mkdirSync(wiki, { recursive: true });
  Deno.writeTextFileSync(join(wiki, "data.nt"), ntriples);
  Deno.writeTextFileSync(join(wiki, "shapes.ttl"), SHAPES_TURTLE);
  for (let i = 0; i < PAGES; i++) {
    Deno.writeTextFileSync(join(wiki, `Bench_Person_${i}.md`), page(i));
  }
}

async function runOne(
  name: CaseName,
  dir: string,
  timeoutSeconds: number,
): Promise<CaseResult | CaseFailure> {
  const start = performance.now();
  const elapsed = () => Math.round(performance.now() - start);
  try {
    const output = await new Deno.Command(Deno.execPath(), {
      args: ["run", "-A", CASE_SCRIPT, name, dir],
      stdout: "piped",
      stderr: "piped",
      signal: AbortSignal.timeout(timeoutSeconds * 1000),
    }).output();
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
    const timedOut = error instanceof DOMException &&
      error.name === "TimeoutError";
    return {
      case: name,
      ok: false,
      reason: timedOut ? `timeout after ${timeoutSeconds} s` : String(error),
      totalMs: elapsed(),
    };
  }
}

function seconds(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}

function megabytes(bytes: number | null): string {
  return bytes === null ? "n/a" : `${Math.round(bytes / 2 ** 20)} MB`;
}

function phaseText(phases: Readonly<Record<string, number>>): string {
  return Object.entries(phases)
    .map(([name, ms]) => `${name} ${seconds(ms)}`)
    .join(", ");
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
