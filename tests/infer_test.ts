import { assert, assertEquals, assertFalse } from "@std/assert";
import { Parser } from "n3";
import type { Quad } from "@rdfjs/types";
import { Config } from "../src/wiki/config.ts";
import {
  applyInference,
  isOntologyTriple,
  mayDeriveSameAs,
} from "../src/wiki/infer.ts";
import { namedNode, RdfGraph } from "../src/wiki/rdf.ts";

const EX = "https://infer.example/";
const OWL = "http://www.w3.org/2002/07/owl#";
const PREFIXES = `@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl: <${OWL}> .
@prefix ex: <${EX}> .
`;

function quads(turtle: string): Quad[] {
  return new Parser().parse(PREFIXES + turtle) as Quad[];
}

function closureOf(turtle: string): RdfGraph {
  const graph = new RdfGraph();
  for (const quad of quads(turtle)) graph.addQuad(quad);
  return applyInference(graph, new Config());
}

function has(graph: RdfGraph, s: string, p: string, o: string): boolean {
  return graph.has(namedNode(EX + s), namedNode(p), namedNode(EX + o));
}

Deno.test("ontology triples are axioms and declarations, not instance data", () => {
  const [subClass, typeClass, list, label, typeData, sameAs, data] = quads(`
ex:A rdfs:subClassOf ex:B .
ex:A a owl:Class .
ex:l rdf:first ex:A .
ex:A rdfs:label "A" .
ex:x a ex:A .
ex:x owl:sameAs ex:y .
ex:x ex:knows ex:y .
`);
  assert(isOntologyTriple(subClass!));
  assert(isOntologyTriple(typeClass!));
  assert(isOntologyTriple(list!));
  assertFalse(isOntologyTriple(label!));
  assertFalse(isOntologyTriple(typeData!));
  assertFalse(isOntologyTriple(sameAs!));
  assertFalse(isOntologyTriple(data!));
});

Deno.test("only the terms that can introduce owl:sameAs keep the equality rules", () => {
  assertFalse(mayDeriveSameAs(quads(`
ex:A rdfs:subClassOf ex:B .
ex:p owl:inverseOf ex:q .
ex:x a ex:A ; ex:p ex:y .
`)));
  for (
    const turtle of [
      "ex:x owl:sameAs ex:y .",
      "ex:x a owl:NamedIndividual .",
      "ex:x a owl:Nothing .",
      "ex:p a owl:FunctionalProperty .",
      "ex:p a owl:InverseFunctionalProperty .",
      "ex:A owl:hasKey ( ex:p ) .",
      'ex:r owl:maxCardinality "1" .',
      'ex:r owl:maxQualifiedCardinality "1" .',
    ]
  ) assert(mayDeriveSameAs(quads(turtle)), turtle);
});

Deno.test("an asserted owl:sameAs still substitutes into every triple", () => {
  const graph = closureOf(`
ex:a owl:sameAs ex:b .
ex:a ex:knows ex:c .
`);
  assert(has(graph, "b", `${EX}knows`, "c"));
  assert(has(graph, "b", `${OWL}sameAs`, "a"));
});

Deno.test("a functional property still derives owl:sameAs and substitutes", () => {
  const graph = closureOf(`
ex:hasMother a owl:FunctionalProperty .
ex:gus ex:hasMother ex:m1 , ex:m2 .
ex:m1 ex:livesIn ex:town .
`);
  assert(has(graph, "m1", `${OWL}sameAs`, "m2"));
  assert(has(graph, "m2", `${EX}livesIn`, "town"));
});

Deno.test("class and property axioms apply without the equality rules", () => {
  const graph = closureOf(`
ex:Student rdfs:subClassOf ex:Person .
ex:hasChild owl:inverseOf ex:hasParent .
ex:ancestorOf a owl:TransitiveProperty .
ex:alice a ex:Student ; ex:hasChild ex:carol .
ex:a1 ex:ancestorOf ex:a2 . ex:a2 ex:ancestorOf ex:a3 .
`);
  const type = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
  assert(has(graph, "alice", type, "Person"));
  assert(has(graph, "carol", `${EX}hasParent`, "alice"));
  assert(has(graph, "a1", `${EX}ancestorOf`, "a3"));
  assertEquals(
    graph.toArray().filter((quad) => quad.predicate.value === `${OWL}sameAs`)
      .length,
    0,
  );
});
