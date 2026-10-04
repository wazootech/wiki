/**
 * Probe (continued): can `n3.js` supply the Turtle / N3 / TriG writer the swap
 * stack is missing?
 *
 * `@zazuko/env-node` registers a serializer for `text/turtle`, but it emits
 * N-Triples: no prefixes, no predicate grouping, one triple per line. That is
 * *valid* Turtle, so nothing fails — but `export --format turtle` would stop
 * looking like the oracle's, and the serve metadata view labelled "Turtle"
 * would be mislabelled. `probe.ts` also found no serializer at all for
 * `application/rdf+xml` and none that produced real TriG.
 *
 * n3.js is the canonical JavaScript Turtle-family reader/writer, so it is the
 * candidate for those three. This probe asks whether its output is *shape*-
 * comparable to the oracle's, not byte-comparable: rdflib's pretty-printer
 * chooses prefixes, grouping, and numeric shorthand its own way, and matching
 * that is porting the library.
 *
 * Run: deno run --allow-read --allow-config deno.json n3-probe.ts
 */

import { Parser, Writer } from "n3";
import { dataFactory } from "@wazoo/sparql-engine";
import type { Quad } from "@rdfjs/types";

interface Triple {
  readonly s: { iri?: string; blank?: boolean };
  readonly p: string;
  readonly o: {
    iri?: string;
    blank?: boolean;
    literal?: string;
    lang?: string;
    datatype?: string;
  };
}

const fixture: Triple[] =
  JSON.parse(await Deno.readTextFile(new URL("./graph.json", import.meta.url)))[0].triples;

const blanks = new Map<object, object>();
function term(spec: Triple["s"] | Triple["o"]): unknown {
  if (spec.iri !== undefined) return dataFactory.namedNode(spec.iri);
  if (spec.blank === true) {
    let node = blanks.get(spec);
    if (node === undefined) {
      node = dataFactory.blankNode();
      blanks.set(spec, node);
    }
    return node;
  }
  const literal = (spec as { literal?: string }).literal ?? "";
  if ((spec as { datatype?: string }).datatype !== undefined) {
    return dataFactory.literal(literal, dataFactory.namedNode((spec as { datatype: string }).datatype));
  }
  if ((spec as { lang?: string }).lang !== undefined) {
    return dataFactory.literal(literal, (spec as { lang: string }).lang);
  }
  return dataFactory.literal(literal);
}

const quads = fixture.map((triple) =>
  dataFactory.quad(
    term(triple.s) as never,
    dataFactory.namedNode(triple.p),
    term(triple.o) as never,
  )
);

/** The wiki's own prefix table, which is what a reader is shown. */
const prefixes: Record<string, string> = {
  rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  rdfs: "http://www.w3.org/2000/01/rdf-schema#",
  schema: "https://schema.org/",
  xsd: "http://www.w3.org/2001/XMLSchema#",
};

console.log("=== n3.Writer Turtle ===");
console.log(await write(quads, "Turtle"));
console.log("=== n3.Writer N-Triples ===");
console.log(await write(quads, "N-Triples"));
console.log("=== n3.Writer TriG ===");
console.log(await write(quads, "TriG"));

// And the reader side: does n3.js parse what the oracle writes?
const oracleTurtle = await Deno.readTextFile(new URL("./oracle/turtle.txt", import.meta.url));
const reparsed = new Parser({ format: "Turtle" }).parse(oracleTurtle);
console.log(`n3.Parser read the oracle's turtle: ${reparsed.length} quads`);

/** Serialize with n3.js and return the text. */
function write(input: Quad[], format: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const writer = new Writer({ format, prefixes });
    writer.addQuads(input as never[]);
    writer.end((error: Error | null, result: string) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
}
