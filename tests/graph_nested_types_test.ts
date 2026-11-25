import { assert, assertEquals } from "@std/assert";
import { Config } from "../src/wiki/config.ts";
import { effectiveTypes, frontmatterToGraph } from "../src/wiki/graph.ts";
import {
  literal,
  namedNode,
  RDF_FIRST,
  RDF_TYPE,
  RdfGraph,
} from "../src/wiki/rdf.ts";
import { listMembers, ns, SCHEMA, WIKI } from "./graph_support.ts";

Deno.test("identical nested frontmatter yields distinct blank nodes (#144)", () => {
  const context = new Config().context;
  const shape = (id: string) => ({
    "@type": "sh:NodeShape",
    "@id": `wiki:${id}`,
    "sh:property": [{
      "sh:path": "schema:name",
      "sh:datatype": "xsd:string",
    }],
  });

  const combined = new RdfGraph();
  combined.addAll(frontmatterToGraph(shape("person-shape"), context));
  combined.addAll(frontmatterToGraph(shape("pet-shape"), context));

  const blanks = [
    ...combined.match(null, namedNode("http://www.w3.org/ns/shacl#property")),
  ];
  assertEquals(blanks.length, 2);
  assertEquals(new Set(blanks.map((item) => item.object.value)).size, 2);
  for (const item of blanks) assertEquals(item.object.termType, "BlankNode");
});

Deno.test("sh:in nested in a list of mappings compiles to an RDF list (#305)", () => {
  const context = new Config().context;
  const sh = ns(context, "sh");
  const graph = frontmatterToGraph({
    "@type": "sh:NodeShape",
    "@id": "wiki:status-shape",
    "sh:targetClass": "schema:Thing",
    "sh:property": [{
      "sh:path": "schema:status",
      "sh:in": ["schema:Open", "schema:Shipped", "draft"],
    }],
  }, context);

  const ins = [...graph.match(null, namedNode(sh + "in"))];
  assertEquals(ins.length, 1);
  assertEquals(ins[0]!.object.termType, "BlankNode");
  assertEquals(listMembers(graph, ins[0]!.object), [
    SCHEMA + "Open",
    SCHEMA + "Shipped",
    "draft",
  ]);
  // A single `sh:path` stays a plain IRI, not a one-member sequence path.
  const paths = [...graph.match(null, namedNode(sh + "path"))];
  assertEquals(paths.map((quad) => quad.object.value), [SCHEMA + "status"]);
});

Deno.test("a top-level sh:in on a property shape page is an RDF list too", () => {
  const context = new Config().context;
  const sh = ns(context, "sh");
  const graph = frontmatterToGraph({
    "@type": "sh:PropertyShape",
    "@id": "wiki:status-property",
    "sh:path": "schema:status",
    "sh:in": ["schema:Open"],
  }, context);
  const ins = [...graph.match(null, namedNode(sh + "in"))];
  assertEquals(ins.length, 1);
  assertEquals(listMembers(graph, ins[0]!.object), [SCHEMA + "Open"]);
});

Deno.test("a one-member sh:path list stays a predicate path (SHACL §2.3.1.1)", () => {
  const context = new Config().context;
  const sh = ns(context, "sh");
  const graph = frontmatterToGraph({
    "@type": "sh:PropertyShape",
    "@id": "wiki:name-property",
    "sh:path": ["schema:name"],
    "sh:minCount": 1,
  }, context);
  const paths = [...graph.match(null, namedNode(sh + "path"))];
  assertEquals(paths.map((quad) => quad.object.value), [SCHEMA + "name"]);
  assertEquals([...graph.match(null, namedNode(RDF_FIRST))].length, 0);
});

Deno.test("a multi-member path list is a sequence path (SHACL §2.3.1.2)", () => {
  const context = new Config().context;
  const sh = ns(context, "sh");
  const graph = frontmatterToGraph({
    "@type": "sh:NodeShape",
    "@id": "wiki:knows-shape",
    "sh:property": [
      { "sh:path": ["schema:knows", "schema:name"] },
      { "sh:path": { "sh:inversePath": ["schema:knows", "schema:name"] } },
    ],
  }, context);
  for (const key of ["path", "inversePath"]) {
    const heads = [...graph.match(null, namedNode(sh + key))]
      .filter((quad) =>
        quad.object.termType === "BlankNode" &&
        [...graph.match(quad.object, namedNode(RDF_FIRST))].length > 0
      );
    assertEquals(heads.length, 1, key);
    assertEquals(listMembers(graph, heads[0]!.object), [
      SCHEMA + "knows",
      SCHEMA + "name",
    ]);
  }
});

Deno.test("sh:alternativePath is a SHACL list of paths (SHACL §2.3.1.3)", () => {
  const context = new Config().context;
  const sh = ns(context, "sh");
  const graph = frontmatterToGraph({
    "@type": "sh:PropertyShape",
    "@id": "wiki:label-property",
    "sh:path": {
      "sh:alternativePath": [
        "schema:name",
        ["schema:author", "schema:name"],
        ["schema:alternateName"],
      ],
    },
  }, context);
  const alternatives = [
    ...graph.match(null, namedNode(sh + "alternativePath")),
  ];
  assertEquals(alternatives.length, 1);
  const members = listMembers(graph, alternatives[0]!.object);
  assertEquals(members.length, 3);
  assertEquals(members[0], SCHEMA + "name");
  // A nested list member is itself a sequence path...
  const sequence = [...graph.match(null, namedNode(RDF_FIRST))]
    .find((quad) => quad.object.termType === "BlankNode")!.object;
  assertEquals(listMembers(graph, sequence), [
    SCHEMA + "author",
    SCHEMA + "name",
  ]);
  // ...and a one-member one collapses to its predicate path.
  assertEquals(members[2], SCHEMA + "alternateName");
});

Deno.test("a list inside an sh:in list nests instead of repeating rdf:first", () => {
  const context = new Config().context;
  const sh = ns(context, "sh");
  const graph = frontmatterToGraph({
    "@type": "sh:PropertyShape",
    "@id": "wiki:nested-in",
    "sh:path": "schema:status",
    "sh:in": [["schema:Open", "schema:Shipped"], null],
  }, context);
  const ins = [...graph.match(null, namedNode(sh + "in"))];
  assertEquals(ins.length, 1);
  // `listMembers` asserts exactly one `rdf:first` and `rdf:rest` per cell, and
  // the null member is dropped rather than leaving a cell without `rdf:first`.
  const outer = listMembers(graph, ins[0]!.object);
  assertEquals(outer.length, 1);
  const inner = [...graph.match(ins[0]!.object, namedNode(RDF_FIRST))][0]!;
  assertEquals(listMembers(graph, inner.object), [
    SCHEMA + "Open",
    SCHEMA + "Shipped",
  ]);
});

Deno.test("a plain list nested in a list of mappings repeats the predicate", () => {
  const context = new Config().context;
  const graph = frontmatterToGraph({
    "@type": "Person",
    "@id": "wiki:gregory",
    knowsAbout: [{ name: "Topic", keywords: ["a", "b"] }],
  }, context);
  const keywords = [...graph.match(null, namedNode(SCHEMA + "keywords"))];
  assertEquals(keywords.map((quad) => quad.object.value).sort(), ["a", "b"]);
});

Deno.test("the wazoo layout predicate is emitted and nothing else", () => {
  const context = new Config().context;
  const graph = frontmatterToGraph({
    "@type": "Person",
    "@id": "wiki:ethan",
    givenName: "Ethan",
    "wazoo:layout": "layouts/person.html",
  }, context);

  const wazoo = ns(context, "wazoo");
  assert(
    graph.has(
      namedNode(WIKI + "ethan"),
      namedNode(`${wazoo}layout`),
      literal("layouts/person.html"),
    ),
  );
  assertEquals(graph.size, 3);
});

Deno.test("implicit types fall back for an untyped page", () => {
  const config = new Config({ graph: { implicit_types: ["TechArticle"] } });
  const graph = frontmatterToGraph({ headline: "Untitled" }, config, {
    fileId: "untitled",
  });

  assert(
    graph.has(
      namedNode(`${WIKI}untitled`),
      namedNode(RDF_TYPE),
      namedNode(SCHEMA + "TechArticle"),
    ),
  );
});

Deno.test("implicit types leave an explicit type alone under fallback", () => {
  const config = new Config({ graph: { implicit_types: ["TechArticle"] } });
  const context = config.context;
  const graph = frontmatterToGraph({
    "@type": "Person",
    "@id": "wiki:alice",
    givenName: "Alice",
  }, config);
  const subject = namedNode(WIKI + "alice");

  const types = [...graph.match(subject, namedNode(RDF_TYPE))];
  assertEquals(types.length, 1);
  assertEquals(types[0]!.object.value, SCHEMA + "Person");
  assert(context.vocab === SCHEMA);
});

Deno.test("append policy unions implicit types and dedupes by URI", () => {
  const config = new Config({
    graph: {
      implicit_types: ["TechArticle", "CreativeWork"],
      implicit_types_policy: "append",
    },
  });
  const graph = frontmatterToGraph({
    "@type": ["TechArticle", "Person"],
    "@id": "wiki:doc",
    headline: "Doc",
  }, config);
  const subject = namedNode(WIKI + "doc");

  assertEquals(
    new Set(
      [...graph.match(subject, namedNode(RDF_TYPE))].map((item) =>
        item.object.value
      ),
    ),
    new Set([
      SCHEMA + "TechArticle",
      SCHEMA + "Person",
      SCHEMA + "CreativeWork",
    ]),
  );
});

Deno.test("append policy leaves SHACL shape documents alone", () => {
  const config = new Config({
    graph: { implicit_types: ["TechArticle"], implicit_types_policy: "append" },
  });
  const context = config.context;
  const data = {
    "@type": "sh:NodeShape",
    "@id": "wiki:person-shape",
    "rdfs:label": "Person",
  };

  assertEquals(effectiveTypes(data, config), ["sh:NodeShape"]);
  const graph = frontmatterToGraph(data, config);
  const types = [
    ...graph.match(namedNode(WIKI + "person-shape"), namedNode(RDF_TYPE)),
  ];
  assertEquals(types.length, 1);
  assertEquals(types[0]!.object.value, ns(context, "sh") + "NodeShape");
});

Deno.test("graph.base_iri overrides graph.context.wiki for page subjects", () => {
  const config = new Config({
    graph: {
      context: { "@vocab": SCHEMA, wiki: "https://example.test/wiki/" },
      base_iri: "https://example.test/docs/",
    },
  });
  const graph = frontmatterToGraph(
    { "@type": "WebPage", headline: "Page" },
    config,
    {
      fileId: "page",
    },
  );

  assert(
    graph.has(
      namedNode("https://example.test/docs/page"),
      namedNode(RDF_TYPE),
      namedNode(SCHEMA + "WebPage"),
    ),
  );
});

Deno.test("a list of types adds one rdf:type per entry", () => {
  const config = new Config();
  const graph = frontmatterToGraph({
    "@type": ["Person", "Developer"],
    "@id": "wiki:multi",
    givenName: "Multi Guy",
  }, config.context);
  const subject = namedNode(WIKI + "multi");

  const types = [...graph.match(subject, namedNode(RDF_TYPE))];
  assertEquals(types.length, 2);
  assertEquals(
    new Set(types.map((item) => item.object.value)),
    new Set([SCHEMA + "Person", SCHEMA + "Developer"]),
  );
});
