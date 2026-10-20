/**
 * Run one benchmark case in this process and print one JSON result line.
 *
 * `run.ts` spawns a fresh process per case so no case inherits another's graph
 * cache or heap, and so a case that runs out of memory fails alone.
 *
 * Usage: `deno run -A bench/shacl/case.ts <case> <fixture-dir>`
 */

import { join } from "@std/path";
import { Parser, Store } from "n3";
import type { Quad } from "@rdfjs/types";
import { runCheck } from "../../src/wiki/audit.ts";
import { Config } from "../../src/wiki/config.ts";
import { loadGraph } from "../../src/wiki/graph.ts";
import { namedNode, RdfGraph, triple } from "../../src/wiki/rdf.ts";
import { loadShapes, validateShacl } from "../../src/wiki/shacl.ts";
import { employerOf, EX, orgIri, personIri } from "./fixture.ts";

const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const SCHEMA = "https://schema.org/";
const SH = "http://www.w3.org/ns/shacl#";

/** The cases, in the order `run.ts` runs them. */
export const CASES = [
  "validator-full",
  "validator-delta",
  "wiki-phases",
  "wiki-check-full",
  "wiki-check-scoped-1",
  "wiki-check-scoped-50",
] as const;
export type CaseName = typeof CASES[number];

/** How many writes `validator-delta` times. */
const DELTA_OPS = 200;

/** The highest `heapUsed` the sampler in the entry point has seen. */
let peakHeap = 0;

/** One case's measurements. Times are milliseconds; memory is bytes. */
export interface CaseResult {
  readonly case: CaseName;
  readonly ok: true;
  readonly totalMs: number;
  /** Named sub-timings, in the order they ran. */
  readonly phases: Readonly<Record<string, number>>;
  /** Peak resident set size the OS reports for this process, if it can. */
  readonly peakRss: number | null;
  /** Highest `heapUsed` seen by the sampler (misses spikes inside sync work). */
  readonly peakHeapSampled: number;
  readonly violations: number | null;
  readonly notes?: string;
}

function readGraph(path: string): RdfGraph {
  const graph = new RdfGraph();
  for (const quad of new Parser().parse(Deno.readTextFileSync(path))) {
    graph.addQuad(quad as Quad);
  }
  return graph;
}

/** Peak RSS from the OS: `VmHWM` on Linux, `PeakWorkingSet64` on Windows. */
async function peakRss(): Promise<number | null> {
  try {
    if (Deno.build.os === "linux") {
      const status = Deno.readTextFileSync("/proc/self/status");
      const match = /^VmHWM:\s+(\d+) kB$/m.exec(status);
      return match ? Number(match[1]) * 1024 : null;
    }
    if (Deno.build.os === "windows") {
      const output = await new Deno.Command("powershell", {
        args: [
          "-NoProfile",
          "-Command",
          `(Get-Process -Id ${Deno.pid}).PeakWorkingSet64`,
        ],
        stdout: "piped",
        stderr: "null",
      }).output();
      const value = Number(new TextDecoder().decode(output.stdout).trim());
      return Number.isFinite(value) && value > 0 ? value : null;
    }
  } catch {
    // Fall through: no peak is better than a wrong one.
  }
  return null;
}

/** Time `work`, recording it under `name` in `phases`. */
async function phase<T>(
  phases: Record<string, number>,
  name: string,
  work: () => T | Promise<T>,
): Promise<T> {
  const start = performance.now();
  const value = await work();
  phases[name] = round(performance.now() - start);
  return value;
}

function round(ms: number): number {
  return Math.round(ms * 10) / 10;
}

function percentile(sorted: readonly number[], p: number): number {
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return round(sorted[index] ?? 0);
}

/**
 * The write a Worlds import would validate for one person: the person's own
 * triples (the Δ) plus the neighbourhood the shapes reach. That is the type of
 * every IRI the person points at (`sh:class`), the employer's triples (the
 * sequence path, and the employer is itself a touched focus node), and the
 * employer's inbound `worksFor` edges (the organization shape's inverse path).
 */
function deltaWithNeighbourhood(store: Store, person: number): RdfGraph {
  const graph = new RdfGraph();
  const add = (quads: readonly Quad[]) => {
    for (const quad of quads) graph.addQuad(quad);
  };
  const employer = orgIri(employerOf(person));
  const own = store.getQuads(personIri(person), null, null, null) as Quad[];
  add(own);
  for (const quad of own) {
    if (quad.object.termType !== "NamedNode") continue;
    if (!quad.object.value.startsWith(EX)) continue;
    add(store.getQuads(quad.object, RDF_TYPE, null, null) as Quad[]);
  }
  add(store.getQuads(employer, null, null, null) as Quad[]);
  add(store.getQuads(null, `${SCHEMA}worksFor`, employer, null) as Quad[]);
  return graph;
}

/**
 * The shapes re-targeted at exactly the touched focus nodes.
 *
 * A neighbourhood holds typed nodes that are not part of the write (the person
 * someone `knows`), and a class target would validate them without *their*
 * neighbourhood and report violations that are not there. So the class targets
 * are swapped for `sh:targetNode`: this, not the smaller data graph alone, is
 * what makes write-scoped validation answer the right question.
 */
function retarget(
  shapes: RdfGraph,
  targets: Readonly<Record<string, string>>,
): RdfGraph {
  const graph = new RdfGraph();
  for (const item of shapes) {
    if (item.predicate.value !== `${SH}targetClass`) graph.addQuad(item);
  }
  for (const [shape, node] of Object.entries(targets)) {
    graph.addQuad(
      triple(namedNode(shape), namedNode(`${SH}targetNode`), namedNode(node)),
    );
  }
  return graph;
}

async function runCase(name: CaseName, dir: string): Promise<CaseResult> {
  const phases: Record<string, number> = {};
  const wiki = join(dir, "wiki");
  const config = () => new Config({ wiki: { input: [wiki] } });
  let violations: number | null = null;
  let notes: string | undefined;

  const start = performance.now();
  switch (name) {
    case "validator-full": {
      const data = await phase(
        phases,
        "parse",
        () => readGraph(join(dir, "data.nt")),
      );
      const shapes = readGraph(join(dir, "shapes.ttl"));
      const outcome = await phase(
        phases,
        "validate",
        () => validateShacl(data, shapes),
      );
      violations = outcome.results.length;
      break;
    }
    case "validator-delta": {
      const store = await phase(phases, "index", () => {
        const store = new Store();
        store.addQuads(
          new Parser().parse(Deno.readTextFileSync(join(dir, "data.nt"))),
        );
        return store;
      });
      const shapes = readGraph(join(dir, "shapes.ttl"));
      const people = store.getSubjects(
        "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
        "https://schema.org/Person",
        null,
      ).length;
      const fetches: number[] = [];
      const validations: number[] = [];
      let sizes = 0;
      violations = 0;
      for (let op = 0; op < DELTA_OPS; op++) {
        const person = Math.floor((op * 7919) % people);
        const fetchStart = performance.now();
        const graph = deltaWithNeighbourhood(store, person);
        fetches.push(performance.now() - fetchStart);
        sizes += graph.size;
        const validateStart = performance.now();
        const outcome = await validateShacl(
          graph,
          retarget(shapes, {
            [`${EX}shape/Person`]: personIri(person),
            [`${EX}shape/Organization`]: orgIri(employerOf(person)),
          }),
        );
        validations.push(performance.now() - validateStart);
        violations += outcome.results.length;
      }
      fetches.sort((a, b) => a - b);
      validations.sort((a, b) => a - b);
      phases["fetchP50"] = percentile(fetches, 0.5);
      phases["fetchP95"] = percentile(fetches, 0.95);
      phases["validateP50"] = percentile(validations, 0.5);
      phases["validateP95"] = percentile(validations, 0.95);
      notes = `${DELTA_OPS} writes; mean ${
        Math.round(sizes / DELTA_OPS)
      } quads validated per write; fetch is an in-memory n3 index lookup, not D1`;
      break;
    }
    case "wiki-phases": {
      const cfg = config();
      const graph = await phase(phases, "loadGraph", () => loadGraph(cfg));
      const shapes = await phase(phases, "loadShapes", () => loadShapes(graph));
      const outcome = await phase(
        phases,
        "validate",
        () => validateShacl(graph, shapes),
      );
      violations = outcome.results.length;
      notes = `inferred graph: ${graph.size} quads`;
      break;
    }
    case "wiki-check-full":
    case "wiki-check-scoped-1":
    case "wiki-check-scoped-50": {
      const pages = name === "wiki-check-scoped-1"
        ? 1
        : name === "wiki-check-scoped-50"
        ? 50
        : 0;
      const filePaths = pages === 0 ? null : Array.from(
        { length: pages },
        (_, i) => join(wiki, `Bench_Person_${i}.md`),
      );
      const report = await phase(
        phases,
        "runCheck",
        () => runCheck(config(), { filePaths }),
      );
      violations = report.errors
        .filter((issue) => issue.code === "shacl_violation")
        .reduce((sum, issue) => sum + (issue.results?.length ?? 0), 0);
      break;
    }
  }
  const totalMs = round(performance.now() - start);

  return {
    case: name,
    ok: true,
    totalMs,
    phases,
    peakRss: await peakRss(),
    peakHeapSampled: peakHeap,
    violations,
    ...(notes === undefined ? {} : { notes }),
  };
}

if (import.meta.main) {
  const [name, dir] = Deno.args;
  if (!CASES.includes(name as CaseName) || dir === undefined) {
    console.error(`Usage: case.ts <${CASES.join("|")}> <fixture-dir>`);
    Deno.exit(2);
  }
  const sampler = setInterval(() => {
    peakHeap = Math.max(peakHeap, Deno.memoryUsage().heapUsed);
  }, 25);
  const result = await runCase(name as CaseName, dir);
  clearInterval(sampler);
  console.log(JSON.stringify(result));
}
