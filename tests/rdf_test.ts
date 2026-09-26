/**
 * Tests for `src/wiki/rdf.ts`, the RDF substrate.
 *
 * The interesting assertions compare the two encoders against committed
 * fixtures under `tests/fixtures/rdf/`, regenerated with
 * `tests/fixtures/rdf/generate-golden.ts`. Those encoders write the on-disk
 * graph cache, which is reused across processes, so their output is a contract
 * rather than an implementation detail.
 *
 * The rest exist to catch the failure modes the phase-5 probe found: a
 * serializer that silently substitutes N-Quads, a parser registry that lost an
 * entry, and a Turtle writer that is really an N-Triples writer.
 */

import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from "@std/assert";
import {
  canParse,
  canSerialize,
  literal,
  n3Term,
  type NamedNode,
  namedNode,
  ntTerm,
  parseRdf,
  type Quad,
  RdfDataset,
  RdfGraph,
  serializeNquads,
  serializeNt,
  serializeRdf,
  type Term,
  termKey,
  triple,
  UnsupportedFormatError,
} from "../src/wiki/rdf.ts";

interface TermSpec {
  readonly iri?: string;
  readonly literal?: string;
  readonly lang?: string;
  readonly datatype?: string;
}

interface TripleSpec {
  readonly s: TermSpec;
  readonly p: string;
  readonly o: TermSpec;
}

const fixtureDir = new URL("./fixtures/rdf/", import.meta.url);
const fixture: { triples: TripleSpec[] } = JSON.parse(
  Deno.readTextFileSync(new URL("terms.json", fixtureDir)),
);

function termOf(spec: TermSpec): Term {
  if (spec.iri !== undefined) return namedNode(spec.iri);
  if (spec.datatype !== undefined) {
    return literal(spec.literal ?? "", { datatype: spec.datatype });
  }
  if (spec.lang !== undefined) {
    return literal(spec.literal ?? "", { language: spec.lang });
  }
  return literal(spec.literal ?? "");
}

const quads: Quad[] = fixture.triples.map((item) =>
  triple(termOf(item.s), namedNode(item.p), termOf(item.o))
);

const goldenNt = Deno.readTextFileSync(new URL("oracle-nt.txt", fixtureDir));
const goldenNquads = Deno.readTextFileSync(
  new URL("oracle-nquads.txt", fixtureDir),
);

/**
 * Compare as a *set* of lines.
 *
 * rdflib iterates its store in a set order, not insertion order, so the line
 * order of a cache file was never part of the contract — only how each line is
 * rendered is. Parsing the file back is order-insensitive; this test says so
 * explicitly rather than pretending to a byte order we do not control.
 */
function sortedLines(text: string): string {
  return text.replaceAll("\r\n", "\n").trimEnd().split("\n").sort().join("\n");
}

Deno.test("N-Triples output matches rdflib's byte for byte", () => {
  assertEquals(sortedLines(serializeNt(quads)), sortedLines(goldenNt));
});

Deno.test("N-Quads output matches the engine's hand-rolled writer byte for byte", () => {
  assertEquals(sortedLines(serializeNquads(quads)), sortedLines(goldenNquads));
});

Deno.test("the two N-Triples dialects differ exactly where rdflib's do", () => {
  const nt = serializeNt(quads);
  const nquads = serializeNquads(quads);

  // A value containing a newline: the NT serializer escapes it…
  assertStringIncludes(nt, '"line1\\nline2 \\"quoted\\" \\\\ backslash\ttab"');
  // …while `n3()` switches to a triple-quoted literal and leaves it raw, and
  // does not escape the inner quotes either.
  assertStringIncludes(
    nquads,
    '"""line1\nline2 "quoted" \\\\ backslash\ttab"""',
  );
  // A tab is left raw by both: rdflib does not escape it.
  assert(nt.includes("backslash\ttab"));
  assert(nquads.includes("backslash\ttab"));
});

Deno.test("RDF/XML parsing remains supported while serialization is deferred", async () => {
  assertEquals(canSerialize("turtle"), true);
  assertEquals(canSerialize("ttl"), true);
  assertEquals(canSerialize("nquads"), true);
  assertEquals(canSerialize("xml"), false);
  assertEquals(canSerialize("rdf"), false);
  assertEquals(canSerialize("application/rdf+xml"), false);
  assertEquals(canSerialize("nosuchformat"), false);
  for (const format of ["xml", "rdf", "rdf/xml", "application/rdf+xml"]) {
    const error = await assertRejects(
      () => serializeRdf(quads, format),
      UnsupportedFormatError,
    );
    assertStringIncludes(error.message, "RDF/XML serialization is deferred");
  }
  await assertRejects(
    () => serializeRdf(quads, "nosuchformat"),
    UnsupportedFormatError,
  );
});

Deno.test("the Turtle writer emits prefixes and abbreviated IRIs", async () => {
  // The hazard this guards: the `@zazuko` registry's Turtle serializer is the
  // N-Triples writer under another media type, so a format-routing change could
  // turn every Turtle export into N-Triples without failing anything.
  const text = await serializeRdf(quads, "turtle", {
    prefixes: { schema: "https://schema.org/" },
  });
  assertStringIncludes(text, "@prefix schema: <https://schema.org/>");
  assertStringIncludes(text, "schema:name");
});

Deno.test("every format the engine reads is still parsable", async () => {
  const documents: Record<string, string> = {
    "turtle": '<https://example.org/a> <https://schema.org/name> "caf\u00e9" .',
    "trig":
      '<https://example.org/g> { <https://example.org/a> <https://schema.org/name> "x" . }',
    "nt": '<https://example.org/a> <https://schema.org/name> "x" .',
    "nquads":
      '<https://example.org/a> <https://schema.org/name> "x" <https://example.org/g> .',
    "xml": `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:schema="https://schema.org/">
  <rdf:Description rdf:about="https://example.org/a"><schema:name>x</schema:name></rdf:Description>
</rdf:RDF>`,
    "json-ld": JSON.stringify([{
      "@id": "https://example.org/a",
      "https://schema.org/name": [{ "@value": "x" }],
    }]),
  };
  for (const [format, text] of Object.entries(documents)) {
    assertEquals(canParse(format), true, `${format} should be parsable`);
    const parsed = await parseRdf(text, format);
    assertEquals(parsed.length, 1, `${format} should yield one triple`);
  }
  assertEquals(canParse("nosuchformat"), false);
});

Deno.test("the cache dialect survives a round trip through the parser", async () => {
  const reparsed = await parseRdf(goldenNt, "nt");
  assertEquals(reparsed.length, quads.length);
  const keys = (input: readonly Quad[]) =>
    input.map((item) => ntTerm(item.object)).sort();
  assertEquals(keys(reparsed), keys(quads));
});

Deno.test("a graph deduplicates, matches, and reports distinct terms", () => {
  const graph = new RdfGraph();
  const alice = namedNode("https://example.org/Alice");
  const name = namedNode("https://schema.org/name");
  const bob = namedNode("https://example.org/Bob");

  graph.add(alice, name, literal("Ada"));
  graph.add(alice, name, literal("Ada"));
  graph.add(alice, name, bob);

  assertEquals(graph.size, 2);
  assertEquals(graph.has(alice, name, literal("Ada")), true);
  assertEquals(graph.has(alice, name, literal("Grace")), false);
  assertEquals([...graph.subjects()].length, 1);
  assertEquals([...graph.predicates()].map((term) => term.value), [name.value]);
  assertEquals([...graph.objects()].length, 2);
  assertEquals([...graph.match(alice, name, bob)].length, 1);
  assertEquals([...graph.match(null, null, null)].length, 2);

  graph.bind("schema", "https://schema.org/");
  assertEquals(graph.bindings.get("schema"), "https://schema.org/");
});

Deno.test("a dataset keeps named graphs separate and unions them", () => {
  const dataset = new RdfDataset({ defaultUnion: true });
  const alice = namedNode("https://example.org/Alice");
  const name = namedNode("https://schema.org/name");

  dataset.graph("https://example.org/graphs/root").add(
    alice,
    name,
    literal("root"),
  );
  dataset.graph("https://example.org/graphs/source/a").add(
    alice,
    name,
    literal("source"),
  );

  assertEquals(dataset.graphNames().length, 2);
  assertEquals(dataset.size, 2);
  // Iterating the dataset is the union view unscoped queries read.
  assertEquals([...dataset].length, 2);
  // A named graph is a view: asking twice yields the same container.
  const root = dataset.graph("https://example.org/graphs/root");
  assertEquals([...root].length, 1);
  assertEquals(root.graphName?.value, "https://example.org/graphs/root");
});

Deno.test("term keys separate literals that share a lexical form", () => {
  const plain = literal("42");
  const typed = literal("42", {
    datatype: "http://www.w3.org/2001/XMLSchema#integer",
  });
  const tagged = literal("42", { language: "en" });
  assertEquals(termKey(plain) === termKey(typed), false);
  assertEquals(termKey(typed) === termKey(tagged), false);
  assertEquals(termKey(literal("42")) === termKey(plain), true);
  // An IRI and a literal with the same text are different terms, too.
  assertEquals(termKey(namedNode("42")) === termKey(plain), false);
});

Deno.test("n3Term and ntTerm agree on everything but multi-line literals", () => {
  const single = literal('a "quoted" value');
  const multi = literal("one\ntwo");
  assertEquals(ntTerm(single), n3Term(single));
  assertEquals(ntTerm(multi), '"one\\ntwo"');
  assertEquals(n3Term(multi), '"""one\ntwo"""');
  assertEquals(ntTerm(namedNode("https://e/x")), "<https://e/x>");
  // An `xsd:string` datatype is rdflib's plain literal: no suffix.
  assertEquals(
    ntTerm(
      literal("x", { datatype: "http://www.w3.org/2001/XMLSchema#string" }),
    ),
    '"x"',
  );
});

Deno.test("a predicate is typed as a named node for callers", () => {
  const graph = new RdfGraph();
  graph.add(namedNode("https://e/s"), namedNode("https://e/p"), literal("o"));
  const [predicate] = [...graph.predicates()];
  assertEquals((predicate as NamedNode).termType, "NamedNode");
});
