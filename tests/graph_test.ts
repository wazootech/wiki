/**
 * Port of `tests/test_graph.py`.
 *
 * Two oracle tests are adapted rather than transliterated, and both are called
 * out where they appear:
 *
 * - the dataset tests assert named-graph membership directly instead of running
 *   SPARQL against the dataset, because SPARQL evaluation lives in the query
 *   layer and is not ported yet (the assertion is the same one the query made),
 *   and
 * - the SHACL regression test asserts the blank-node property it was written to
 *   protect instead of invoking pyshacl, which is phase 3b's `rdf-validate-shacl`
 *   swap rather than this module's concern.
 *
 * Where the port cannot reproduce a Python value exactly, the test says so and
 * asserts the port's behaviour: `(1, 2)` is an array here because JavaScript has
 * no tuples, and `date(1990, 1, 1)` is a `Date` typed `xsd:dateTime` because
 * JavaScript has one date-time type.
 */

import { assert, assertEquals, assertFalse } from "@std/assert";
import { Config } from "../src/wiki/config.ts";
import {
  frontmatterToGraph,
  kebabCase,
  resolveObject,
  resolvePredicate,
  resolveType,
} from "../src/wiki/graph.ts";
import {
  literal,
  namedNode,
  RDF_TYPE,
  RdfGraph,
  XSD_BOOLEAN,
  XSD_DATETIME,
  XSD_INTEGER,
} from "../src/wiki/rdf.ts";
import { ns, SCHEMA, WIKI } from "./graph_support.ts";

// ---------------------------------------------------------------------------
// Frontmatter to triples
// ---------------------------------------------------------------------------

Deno.test("kebabCase lowercases, collapses, and drops punctuation", () => {
  assertEquals(kebabCase("John Smith! & Co."), "john-smith--co");
  assertEquals(kebabCase(""), "");
  assertEquals(kebabCase("some--double--dashes"), "some-double-dashes");
});

Deno.test("resolvePredicate walks CURIE, wiki.*, then vocab", () => {
  const schemaContext = new Config().context;

  assertEquals(
    resolvePredicate("foaf:name", schemaContext),
    namedNode(ns(schemaContext, "foaf") + "name"),
  );
  assertEquals(
    resolvePredicate("wiki.gregory", schemaContext),
    namedNode(WIKI + "gregory"),
  );
  assertEquals(
    resolvePredicate("givenName", schemaContext),
    namedNode(SCHEMA + "givenName"),
  );
  assertEquals(
    resolvePredicate("headline", schemaContext),
    namedNode(SCHEMA + "headline"),
  );
  assertEquals(
    resolvePredicate("rdfs:label", schemaContext),
    namedNode("http://www.w3.org/2000/01/rdf-schema#label"),
  );
  assertEquals(
    resolvePredicate("label", schemaContext),
    namedNode(SCHEMA + "label"),
  );
  // An unregistered prefix is not a prefix: the whole key falls through to the
  // vocab, colon included.
  assertEquals(
    resolvePredicate("unregistered:prop", schemaContext),
    namedNode(`${SCHEMA}unregistered:prop`),
  );

  const noVocab = new Config({ graph: { context: {} } }).context;
  assertEquals(resolvePredicate("givenName", noVocab), null);
  assertEquals(resolvePredicate("headline", noVocab), null);
  assertEquals(resolvePredicate("label", noVocab), null);
  assertEquals(
    resolvePredicate("foaf:name", noVocab),
    namedNode(ns(noVocab, "foaf") + "name"),
  );
});

Deno.test("resolveType resolves CURIEs, vocab names, and bare URIs", () => {
  const context = new Config().context;
  assertEquals(resolveType("Person", context), namedNode(SCHEMA + "Person"));
  assertEquals(
    resolveType("sh:NodeShape", context),
    namedNode("http://www.w3.org/ns/shacl#NodeShape"),
  );
  assertEquals(resolveType(5, context), namedNode("5"));
});

Deno.test("resolveObject maps datatypes the way rdflib does", () => {
  const context = new Config().context;
  const graph = new RdfGraph();
  const subject = namedNode(WIKI + "gregory");

  resolveObject("url", "https://google.com", graph, subject, context);
  assert(
    graph.has(
      subject,
      namedNode(SCHEMA + "url"),
      namedNode("https://google.com"),
    ),
  );

  resolveObject("knows", true, graph, subject, context);
  assert(
    graph.has(
      subject,
      namedNode(SCHEMA + "knows"),
      literal("true", { datatype: XSD_BOOLEAN }),
    ),
  );

  resolveObject("age", 30, graph, subject, context);
  assert(
    graph.has(
      subject,
      namedNode(SCHEMA + "age"),
      literal("30", { datatype: XSD_INTEGER }),
    ),
  );

  resolveObject("nothing", null, graph, subject, context);
  assertEquals(
    [...graph.match(subject, namedNode(SCHEMA + "nothing"))].length,
    0,
  );

  // A `datetime` in Python; a `Date` that is always typed `xsd:dateTime` here,
  // because JavaScript's only date type carries a time (see `temporalLiteral`).
  resolveObject(
    "resolvedAt",
    new Date(Date.UTC(2025, 5, 15, 14, 30, 0)),
    graph,
    subject,
    context,
  );
  assert(
    graph.has(
      subject,
      namedNode(SCHEMA + "resolvedAt"),
      literal("2025-06-15T14:30:00.000Z", { datatype: XSD_DATETIME }),
    ),
  );

  // A string that looks like a CURIE but uses an unregistered prefix stays a
  // literal rather than inventing a namespace.
  resolveObject("unregistered", "bogus:value", graph, subject, context);
  assert(
    graph.has(
      subject,
      namedNode(SCHEMA + "unregistered"),
      literal("bogus:value"),
    ),
  );

  // A list is one triple per item rather than a stringified literal (#305).
  resolveObject("tup", [1, 2], graph, subject, context);
  for (const lexical of ["1", "2"]) {
    assert(
      graph.has(
        subject,
        namedNode(SCHEMA + "tup"),
        literal(lexical, { datatype: XSD_INTEGER }),
      ),
    );
  }
  assertEquals([...graph.match(subject, namedNode(SCHEMA + "tup"))].length, 2);
});

Deno.test("a nested mapping without @type becomes a blank node", () => {
  const config = new Config();
  const context = config.context;
  const graph = frontmatterToGraph({
    "@type": "Person",
    "@id": "wiki:gregory",
    givenName: "Gregory",
    address: { street: "123 Main St", city: "Seattle" },
  }, context);
  const subject = namedNode(WIKI + "gregory");

  assert(
    graph.has(subject, namedNode(SCHEMA + "givenName"), literal("Gregory")),
  );

  const blanks = [...graph.match(subject, namedNode(SCHEMA + "address"))];
  assertEquals(blanks.length, 1);
  const blank = blanks[0]!.object;
  assertEquals(blank.termType, "BlankNode");
  assert(
    graph.has(blank, namedNode(SCHEMA + "street"), literal("123 Main St")),
  );
  assert(graph.has(blank, namedNode(SCHEMA + "city"), literal("Seattle")));
});

Deno.test("a nested mapping with @type becomes a typed blank node", () => {
  const context = new Config().context;
  const graph = frontmatterToGraph({
    "@type": "Person",
    "@id": "wiki:gregory",
    givenName: "Gregory",
    address: { "@type": "PostalAddress", street: "123 Main St" },
  }, context);
  const subject = namedNode(WIKI + "gregory");
  const blank = [...graph.match(subject, namedNode(SCHEMA + "address"))][0]!
    .object;

  assert(
    graph.has(blank, namedNode(RDF_TYPE), namedNode(SCHEMA + "PostalAddress")),
  );
});

Deno.test("a nested @type resolves through the configured vocab", () => {
  const context = new Config({
    graph: {
      context: { "@vocab": "https://custom.example.org/vocab/", wiki: WIKI },
    },
  }).context;
  const graph = frontmatterToGraph({
    "@type": "Document",
    "@id": "wiki:doc",
    embed: { "@type": "CustomEmbed", name: "test" },
  }, context);
  const subject = namedNode(WIKI + "doc");
  const blank = [...graph.match(
    subject,
    namedNode("https://custom.example.org/vocab/embed"),
  )][0]!.object;

  assert(
    graph.has(
      blank,
      namedNode(RDF_TYPE),
      namedNode("https://custom.example.org/vocab/CustomEmbed"),
    ),
  );
  assertFalse(
    graph.has(blank, namedNode(RDF_TYPE), namedNode(SCHEMA + "CustomEmbed")),
  );
});

Deno.test("a nested @id becomes a URI reference", () => {
  const context = new Config().context;
  const graph = frontmatterToGraph({
    "@type": "Person",
    "@id": "wiki:gregory",
    givenName: "Gregory",
    spouse: { "@id": "wiki:bella" },
  }, context);

  assert(
    graph.has(
      namedNode(WIKI + "gregory"),
      namedNode(SCHEMA + "spouse"),
      namedNode(WIKI + "bella"),
    ),
  );
});

Deno.test("a list of nested mappings creates one node per item", () => {
  const context = new Config().context;
  const graph = frontmatterToGraph({
    "@type": "Person",
    "@id": "wiki:gregory",
    address: [{ street: "123 Main St" }, { street: "456 Oak Ave" }],
  }, context);
  const subject = namedNode(WIKI + "gregory");

  const blanks = [...graph.match(subject, namedNode(SCHEMA + "address"))];
  assertEquals(blanks.length, 2);
  const streets = new Set(
    blanks.map((item) =>
      [...graph.match(item.object, namedNode(SCHEMA + "street"))][0]!.object
        .value
    ),
  );
  assertEquals(streets, new Set(["123 Main St", "456 Oak Ave"]));
});

Deno.test("the body is injected under the configured content predicate", () => {
  const body = "Gregory is a software engineer.";
  const graph = frontmatterToGraph(
    { "@type": "Person", "@id": "wiki:gregory", givenName: "Gregory" },
    new Config({ graph: { content_predicate: "schema:text" } }),
    { body },
  );

  assert(
    graph.has(
      namedNode(WIKI + "gregory"),
      namedNode(SCHEMA + "text"),
      literal(body),
    ),
  );
});

Deno.test("empty frontmatter and missing ids produce empty graphs", () => {
  const config = new Config();
  const context = config.context;

  assertEquals(frontmatterToGraph({}, config).size, 0);
  assertEquals(frontmatterToGraph({ givenName: "Alice" }, config).size, 0);

  const withFileId = frontmatterToGraph({ "@type": "WebPage" }, config, {
    fileId: "doc",
  });
  assert(
    withFileId.has(
      namedNode(`${WIKI}doc`),
      namedNode(RDF_TYPE),
      namedNode(SCHEMA + "WebPage"),
    ),
  );

  const withExtension = frontmatterToGraph({ "@type": "WebPage" }, config, {
    fileId: "doc",
    includeFileExtension: true,
  });
  assert(
    withExtension.has(
      namedNode(`${WIKI}doc.md`),
      namedNode(RDF_TYPE),
      namedNode(SCHEMA + "WebPage"),
    ),
  );

  // No `@id` and no route to derive one from: nothing is emitted at all.
  assertEquals(
    frontmatterToGraph({ "@type": "Person", givenName: "Cher" }, config).size,
    0,
  );
  assertEquals(
    frontmatterToGraph(
      { "@type": "WebPage", givenName: "Some Page" },
      config,
    ).size,
    0,
  );
  assert(context.vocab === SCHEMA);
});
