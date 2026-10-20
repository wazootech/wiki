import { assert, assertEquals } from "@std/assert";
import { Parser } from "n3";
import type { Quad } from "@rdfjs/types";
import { RdfGraph } from "../src/wiki/rdf.ts";
import { validateShacl } from "../src/wiki/shacl.ts";
import { generateFixture, SHAPES_TURTLE } from "../bench/shacl/fixture.ts";

function graphOf(text: string): RdfGraph {
  const graph = new RdfGraph();
  for (const quad of new Parser().parse(text)) graph.addQuad(quad as Quad);
  return graph;
}

Deno.test("the benchmark fixture is deterministic and near its target size", () => {
  const first = generateFixture(5_000);
  assertEquals(generateFixture(5_000).ntriples, first.ntriples);
  assert(first.ntriples !== generateFixture(5_000, 1).ntriples);
  assertEquals(first.ntriples.trimEnd().split("\n").length, first.quads);
  assert(Math.abs(first.quads - 5_000) / 5_000 < 0.05, `${first.quads}`);
});

Deno.test("the benchmark shapes find exactly the planted violations", async () => {
  const fixture = generateFixture(20_000);
  assert(fixture.violatingPeople > 0);
  const outcome = await validateShacl(
    graphOf(fixture.ntriples),
    graphOf(SHAPES_TURTLE),
  );
  assert(!outcome.conforms);
  const focusNodes = new Set(outcome.results.map((result) => result.focusNode));
  assertEquals(focusNodes.size, fixture.violatingPeople);
});
