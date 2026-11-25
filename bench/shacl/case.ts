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
import { runCheck } from "../../src/wiki/audit.ts";
import { Config } from "../../src/wiki/config.ts";
import { loadGraph } from "../../src/wiki/graph.ts";
import { loadShapes, validateShacl } from "../../src/wiki/shacl.ts";
import { employerOf, EX, orgIri, personIri } from "./fixture.ts";
import {
  type CaseName,
  type CaseResult,
  CASES,
  DELTA_OPS,
  deltaWithNeighbourhood,
  peakRss,
  percentile,
  phase,
  readGraph,
  retarget,
  round,
} from "./case/measure.ts";

export { type CaseName, type CaseResult, CASES } from "./case/measure.ts";

/** The highest `heapUsed` the sampler in the entry point has seen. */
let peakHeap = 0;

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
