import { Parser, type Store } from "n3";
import type { Quad } from "@rdfjs/types";
import { namedNode, RdfGraph, triple } from "../../../src/wiki/rdf.ts";
import { employerOf, EX, orgIri, personIri } from "../fixture.ts";

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
export const DELTA_OPS = 200;

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

export function readGraph(path: string): RdfGraph {
  const graph = new RdfGraph();
  for (const quad of new Parser().parse(Deno.readTextFileSync(path))) {
    graph.addQuad(quad as Quad);
  }
  return graph;
}

/** Peak RSS from the OS: `VmHWM` on Linux, `PeakWorkingSet64` on Windows. */
export async function peakRss(): Promise<number | null> {
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
export async function phase<T>(
  phases: Record<string, number>,
  name: string,
  work: () => T | Promise<T>,
): Promise<T> {
  const start = performance.now();
  const value = await work();
  phases[name] = round(performance.now() - start);
  return value;
}

export function round(ms: number): number {
  return Math.round(ms * 10) / 10;
}

export function percentile(sorted: readonly number[], p: number): number {
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
export function deltaWithNeighbourhood(store: Store, person: number): RdfGraph {
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
export function retarget(
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
