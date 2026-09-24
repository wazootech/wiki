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
import type { Context } from "../src/wiki/context.ts";
import { Path } from "../src/wiki/fspath.ts";
import {
  effectiveTypes,
  frontmatterToGraph,
  graphDescriptors,
  graphStats,
  kebabCase,
  loadDataset,
  loadGraph,
  resolveObject,
  resolvePredicate,
  resolveType,
  sourceGraphUri,
  usesNamedGraphs,
} from "../src/wiki/graph.ts";
import { clearAllProcessGraphs } from "../src/wiki/graph_cache.ts";
import { type LogRecord, setLogSink } from "../src/wiki/logging.ts";
import {
  blankNode,
  literal,
  namedNode,
  type Quad,
  RDF_TYPE,
  RdfGraph,
  XSD_BOOLEAN,
  XSD_DATETIME,
  XSD_INTEGER,
} from "../src/wiki/rdf.ts";
import { saveLockfile } from "../src/wiki/schemas/sources.ts";

const SCHEMA = "https://schema.org/";
const WIKI = "https://wiki.example.org/";
const RDFS_SUBCLASS_OF = "http://www.w3.org/2000/01/rdf-schema#subClassOf";

/** Namespace helper: the prefix table is a `Map` in the port. */
function ns(context: Context, prefix: string): string {
  const iri = context.namespaces.get(prefix);
  assert(iri !== undefined, `namespace ${prefix} is not bound`);
  return iri;
}

/** A unique temp directory, to be removed with {@link cleanup}. */
function tempRoot(): Path {
  return Path.of(Deno.makeTempDirSync({ prefix: "wiki-graph-" }));
}

function cleanup(root: Path): void {
  try {
    Deno.removeSync(root.toString(), { recursive: true });
  } catch {
    // Windows keeps a handle open long enough to lose this race occasionally.
  }
}

/** Write a file below `root`, creating parent directories. */
function write(root: Path, relative: string, content: string): Path {
  const target = root.joinpath(...relative.split("/"));
  Deno.mkdirSync(target.parent.toString(), { recursive: true });
  Deno.writeTextFileSync(target.toString(), content);
  return target;
}

/** Run `fn` with the log sink captured, and return what it collected. */
async function captureLogs<T>(
  fn: () => T | Promise<T>,
): Promise<{ records: LogRecord[]; value: T }> {
  const records: LogRecord[] = [];
  setLogSink((record) => records.push(record));
  try {
    return { records, value: await fn() };
  } finally {
    setLogSink(null);
  }
}

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

  // The catch-all stringifies. Python's tuple renders `(1, 2)`; JavaScript has
  // only arrays, and renders `[1, 2]`.
  resolveObject("tup", [1, 2], graph, subject, context);
  assert(graph.has(subject, namedNode(SCHEMA + "tup"), literal("[1, 2]")));
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

// ---------------------------------------------------------------------------
// Graph loading
// ---------------------------------------------------------------------------

Deno.test("loadGraph reads every input dir and survives broken RDF", async () => {
  clearAllProcessGraphs();
  const root = tempRoot();
  try {
    const wiki = root.joinpath("wiki");
    const imports = root.joinpath("imports");
    Deno.mkdirSync(wiki.toString(), { recursive: true });
    Deno.mkdirSync(imports.toString(), { recursive: true });

    write(root, "imports/error.ttl", "UNPARSABLE NONSENSE");
    write(
      root,
      "wiki/safe.md",
      `---
"@type": WebPage
name: Safe Page
---
This is body text loaded by content_predicate.
\`\`\`turtle
@prefix : <#> .
:broken syntax !!!!!!
\`\`\`
`,
    );
    write(
      root,
      "imports/raw_discovery.md",
      `---
"@type": Person
"@id": "wiki:raw_agent"
name: Raw Agent
---
Raw Body Text.
`,
    );

    const config = Config.forRoot(root, {
      wiki: { input: [wiki, imports] },
      graph: { content_predicate: "schema:text" },
    });
    const { records, value: graph } = await captureLogs(() =>
      loadGraph(config, { infer: false })
    );

    assert(graph.size > 0);
    const bodies = [...graph.match(null, namedNode(SCHEMA + "text"))]
      .map((item) => item.object.value)
      .join(" ");
    assert(bodies.includes("This is body text loaded by content_predicate."));
    assert(bodies.includes("Raw Body Text."));
    assert([...graph.match(null, null, literal("Safe Page"))].length > 0);
    assert(
      graph.has(
        namedNode(WIKI + "raw_agent"),
        namedNode(RDF_TYPE),
        namedNode(SCHEMA + "Person"),
      ),
    );
    // One warning: the unparseable `.ttl`. The malformed turtle block inside
    // `safe.md` is a second, and the oracle warns about both.
    assertEquals(records.filter((item) => item.level === "warning").length, 2);
  } finally {
    cleanup(root);
  }
});

Deno.test("loadGraph warns about an unparseable file by name", async () => {
  clearAllProcessGraphs();
  const root = tempRoot();
  try {
    write(
      root,
      "wiki/good.md",
      `---
"@type": WebPage
name: Good Page
---
`,
    );
    write(root, "wiki/broken.ttl", "UNPARSABLE GARBAGE");
    const config = Config.forRoot(root, { wiki: { input: ["wiki"] } });

    const { records, value: graph } = await captureLogs(() =>
      loadGraph(config, { infer: false })
    );

    const messages = records.map((item) => item.message);
    assert(
      messages.some((message) => message.includes("broken.ttl")),
      `no warning about broken.ttl in: ${JSON.stringify(messages)}`,
    );
    assert(graph.size > 0);
  } finally {
    cleanup(root);
  }
});

Deno.test("loadGraph reads YAML and JSON documents as pages", async () => {
  clearAllProcessGraphs();
  const root = tempRoot();
  try {
    write(root, "wiki/bob.yml", "type: Person\ngivenName: Bob\n");
    write(root, "wiki/gregory.yaml", "type: Person\ngivenName: Gregory\n");
    write(root, "wiki/alice.json", '{"type": "Person", "givenName": "Alice"}');
    const config = Config.forRoot(root, { wiki: { input: ["wiki"] } });

    const graph = await loadGraph(config, { infer: false });

    for (const value of ["Bob", "Gregory", "Alice"]) {
      assert([...graph.match(null, null, literal(value))].length > 0);
    }
    for (const name of ["bob", "gregory", "alice"]) {
      assert(
        graph.has(
          namedNode(`${WIKI}${name}`),
          namedNode(RDF_TYPE),
          namedNode(SCHEMA + "Person"),
        ),
      );
    }
  } finally {
    cleanup(root);
  }
});

Deno.test("loadGraph keeps title-cased file URIs matching wiki: CURIEs", async () => {
  clearAllProcessGraphs();
  const root = tempRoot();
  try {
    write(
      root,
      "wiki/Pokemon_Cartridge_Case.md",
      `---
type: schema:Place
name: Pokemon Cartridge Case
---
`,
    );
    write(
      root,
      "wiki/FindAction_2026-05-30_Pokemon_Diamond_(copy_1).md",
      `---
type: schema:FindAction
schema:location: wiki:Pokemon_Cartridge_Case
---
`,
    );
    const config = Config.forRoot(root, { wiki: { input: ["wiki"] } });

    const graph = await loadGraph(config, { infer: false });

    const place = namedNode(`${WIKI}Pokemon_Cartridge_Case`);
    const action = namedNode(
      `${WIKI}FindAction_2026-05-30_Pokemon_Diamond_(copy_1)`,
    );
    assert(graph.has(place, namedNode(RDF_TYPE), namedNode(SCHEMA + "Place")));
    assert(graph.has(action, namedNode(SCHEMA + "location"), place));
  } finally {
    cleanup(root);
  }
});

Deno.test("include_file_extension appends the source extension", async () => {
  clearAllProcessGraphs();
  const root = tempRoot();
  try {
    write(
      root,
      "wiki/test.md",
      `---
type: WebPage
name: Test Page
---
`,
    );
    write(root, "wiki/person.yaml", "type: Person\ngivenName: Test\n");
    const config = Config.forRoot(root, {
      wiki: { input: ["wiki"] },
      graph: { include_file_extension: true },
    });

    const graph = await loadGraph(config, { infer: false });

    assert(
      [...graph.match(namedNode(`${WIKI}test.md`), null, null)].length > 0,
    );
    assert(
      [...graph.match(namedNode(`${WIKI}person.yaml`), null, null)].length > 0,
    );
  } finally {
    cleanup(root);
  }
});

Deno.test("a null @vocab drops unprefixed keys and types", async () => {
  clearAllProcessGraphs();
  const root = tempRoot();
  try {
    write(
      root,
      "wiki/alice.md",
      `---
type: Person
givenName: Alice
schema:familyName: Smith
---
`,
    );
    const config = Config.forRoot(root, {
      wiki: { input: ["wiki"] },
      graph: { context: { "@vocab": null, schema: SCHEMA } },
    });

    const graph = await loadGraph(config, { infer: false });
    const alice = namedNode(`${WIKI}alice`);

    assertEquals([...graph.match(alice, namedNode(RDF_TYPE))].length, 0);
    assertEquals(
      [...graph.match(alice, namedNode(SCHEMA + "givenName"))].length,
      0,
    );
    assert(
      graph.has(alice, namedNode(SCHEMA + "familyName"), literal("Smith")),
    );
  } finally {
    cleanup(root);
  }
});

Deno.test("a custom @vocab resolves unprefixed keys to it", async () => {
  clearAllProcessGraphs();
  const root = tempRoot();
  try {
    write(
      root,
      "wiki/alice.md",
      `---
type: CustomPerson
name: Alice
---
`,
    );
    const config = Config.forRoot(root, {
      wiki: { input: ["wiki"] },
      graph: { context: { "@vocab": "https://custom.example.org/vocab/" } },
    });

    const graph = await loadGraph(config, { infer: false });

    assert(
      graph.has(
        namedNode(`${WIKI}alice`),
        namedNode(RDF_TYPE),
        namedNode("https://custom.example.org/vocab/CustomPerson"),
      ),
    );
    assert(
      graph.has(
        namedNode(`${WIKI}alice`),
        namedNode("https://custom.example.org/vocab/name"),
        literal("Alice"),
      ),
    );
  } finally {
    cleanup(root);
  }
});

Deno.test("two shape files keep their property shapes distinct end to end", async () => {
  clearAllProcessGraphs();
  const root = tempRoot();
  try {
    const shape = (target: string) =>
      `---
type: sh:NodeShape
sh:targetClass: ${target}
sh:property:
  - sh:path: schema:name
    sh:minCount: 1
    sh:datatype: xsd:string
---
`;
    write(root, "wiki/Person_Shape.md", shape("schema:Person"));
    write(root, "wiki/Pet_Shape.md", shape("schema:Pet"));
    const config = Config.forRoot(root, { wiki: { input: ["wiki"] } });

    const graph = await loadGraph(config, { infer: true });

    const properties = [
      ...graph.match(null, namedNode("http://www.w3.org/ns/shacl#property")),
    ];
    // Two shapes, one property shape each, and no collision between them: the
    // shape-loading failure this guards against was a *duplicate* blank node
    // holding both paths.
    assert(properties.length >= 2);
    const shapeSubjects = new Set(
      properties.map((item) => item.subject.value),
    );
    assertEquals(shapeSubjects.size, 2);
    for (const item of properties) {
      assertEquals(item.object.termType, "BlankNode");
    }
  } finally {
    cleanup(root);
  }
});

// ---------------------------------------------------------------------------
// Dataset and descriptors
// ---------------------------------------------------------------------------

/** A source checkout the way `sources install` leaves one. */
function sourceFixture(root: Path): { wiki: Path; source: Path } {
  const wiki = root.joinpath("wiki");
  Deno.mkdirSync(wiki.toString(), { recursive: true });
  const source = root.joinpath(
    ".wiki",
    "sources",
    "brain",
    "repo",
    "wiki",
  );
  Deno.mkdirSync(source.toString(), { recursive: true });
  return { wiki, source };
}

/** The locked entry every dataset test uses, with `required_by` overridable. */
function lockBrain(root: Path, requiredBy: readonly string[] = ["root"]): void {
  saveLockfile({
    version: 2,
    sources: new Map([["brain", {
      url: "https://example.com/brain.git",
      resolved_ref: "abcdef1234567890",
      ref: null,
      path: "wiki",
      fetched_at: "2026-01-01T00:00:00+00:00",
      required_by: requiredBy,
    }]]),
  }, root.joinpath("wiki.lock"));
}

Deno.test("loadDataset keeps root and source graphs separate", async () => {
  clearAllProcessGraphs();
  const root = tempRoot();
  try {
    const { wiki, source } = sourceFixture(root);
    write(
      root,
      "wiki/Root.md",
      `---
type: Thing
name: Root Doc
---
`,
    );
    write(
      root,
      ".wiki/sources/brain/repo/wiki/Source.md",
      `---
type: Thing
name: Source Doc
---
`,
    );
    lockBrain(root);

    const config = Config.forRoot(root, { wiki: { input: [wiki, source] } });
    const dataset = await loadDataset(config, { infer: false });

    const sourceGraph = dataset.graph(sourceGraphUri(config, "brain"));
    assert(
      sourceGraph.has(
        namedNode(`${WIKI}Source`),
        namedNode(SCHEMA + "name"),
        literal("Source Doc"),
      ),
    );
    assertEquals(
      [...sourceGraph.match(
        namedNode(`${WIKI}Root`),
        namedNode(SCHEMA + "name"),
      )]
        .length,
      0,
    );

    const rootGraph = dataset.graph(`${WIKI}graphs/root`);
    assert(
      rootGraph.has(
        namedNode(`${WIKI}Root`),
        namedNode(SCHEMA + "name"),
        literal("Root Doc"),
      ),
    );
    // The union view sees both, which is what an unscoped query reads.
    const names = [...dataset]
      .filter((item) => item.predicate.value === SCHEMA + "name")
      .map((item) => item.object.value)
      .sort();
    assertEquals(names, ["Root Doc", "Source Doc"]);
  } finally {
    cleanup(root);
  }
});

Deno.test("the dataset disk cache round-trips named graphs", async () => {
  clearAllProcessGraphs();
  const root = tempRoot();
  try {
    const { wiki, source } = sourceFixture(root);
    write(
      root,
      ".wiki/sources/brain/repo/wiki/Source.md",
      `---
type: Thing
name: Source Doc
---
`,
    );
    lockBrain(root);

    const config = Config.forRoot(root, { wiki: { input: [wiki, source] } });
    const sourceUri = sourceGraphUri(config, "brain");
    await loadDataset(config, { infer: false, diskCache: true });

    // Cold process cache, warm disk cache: this is the warm-start path a one-shot
    // CLI invocation takes.
    clearAllProcessGraphs();
    const cached = await loadDataset(config, { infer: false, diskCache: true });

    assert(
      cached.graph(sourceUri).has(
        namedNode(`${WIKI}Source`),
        namedNode(SCHEMA + "name"),
        literal("Source Doc"),
      ),
    );
    const cacheFiles = [...Deno.readDirSync(
      root.joinpath(".wiki", "cache").toString(),
    )].map((entry) => entry.name);
    assert(
      cacheFiles.some((name) =>
        name.startsWith("dataset-asserted-") && name.endsWith(".nq")
      ),
      `no dataset cache in ${JSON.stringify(cacheFiles)}`,
    );
  } finally {
    cleanup(root);
  }
});

Deno.test("graphDescriptors reports locked source metadata", () => {
  const root = tempRoot();
  try {
    const { wiki, source } = sourceFixture(root);
    saveLockfile({
      version: 2,
      sources: new Map([["brain", {
        url: "https://example.com/brain.git",
        resolved_ref: "abcdef1234567890",
        ref: "main",
        path: "wiki",
        fetched_at: "2026-01-01T00:00:00+00:00",
        required_by: ["root"],
      }]]),
    }, root.joinpath("wiki.lock"));

    const config = Config.forRoot(root, { wiki: { input: [wiki, source] } });
    const descriptors = graphDescriptors(config);

    assertEquals(descriptors[0]!.kind, "root");
    const brain = descriptors[1]!;
    assertEquals(brain.name, "brain");
    assertEquals(brain.kind, "source");
    assertEquals(brain.url, "https://example.com/brain.git");
    assertEquals(brain.ref, "main");
    assertEquals(brain.resolved_ref, "abcdef1234567890");
    assertEquals(brain.required_by, ["root"]);
    assertEquals(
      brain.local_path?.resolve().toString(),
      source.resolve().toString(),
    );
  } finally {
    cleanup(root);
  }
});

Deno.test("a directly declared source is marked required by root", () => {
  const root = tempRoot();
  try {
    const { wiki, source } = sourceFixture(root);
    lockBrain(root, []);

    const config = Config.forRoot(root, {
      wiki: { input: [wiki, source] },
      sources: [{
        name: "brain",
        type: "git",
        url: "https://example.com/brain.git",
      }],
    });

    const brain = graphDescriptors(config).find((item) =>
      item.name === "brain"
    );
    assertEquals(brain?.required_by, ["root"]);
  } finally {
    cleanup(root);
  }
});

Deno.test("graphDescriptors warns when a cache has no lockfile sources", async () => {
  const root = tempRoot();
  try {
    const { wiki, source } = sourceFixture(root);
    const config = Config.forRoot(root, { wiki: { input: [wiki, source] } });

    const { records, value: descriptors } = await captureLogs(() =>
      graphDescriptors(config)
    );

    assertEquals(descriptors.map((item) => item.kind), ["root"]);
    assert(
      records.some((item) => item.message.includes("Source cache exists")),
      JSON.stringify(records),
    );
  } finally {
    cleanup(root);
  }
});

// ---------------------------------------------------------------------------
// Helpers with no oracle test of their own
// ---------------------------------------------------------------------------

Deno.test("usesNamedGraphs sees the keyword and not its lookalikes", () => {
  assert(usesNamedGraphs("SELECT * WHERE { GRAPH ?g { ?s ?p ?o } }"));
  assert(usesNamedGraphs("select * where { graph <urn:x> { ?s ?p ?o } }"));
  assertFalse(usesNamedGraphs("SELECT * WHERE { ?s ?p ?o }"));
  assertFalse(usesNamedGraphs("SELECT * WHERE { ?s ?graph ?o }"));
  assertFalse(usesNamedGraphs("SELECT * WHERE { ?s ex:graph ?o }"));
  // The oracle's lookbehind excludes variable and IRI spellings, not string
  // literals: `'GRAPH '` after a space reads as the keyword. Kept as-is, since
  // a query naming the word in a literal is the caller's problem, not a parse.
  assert(
    usesNamedGraphs("SELECT * WHERE { ?s ?p ?o . FILTER(?x = 'GRAPH ') }"),
  );
});

Deno.test("graphStats counts distinct subjects, predicates, and objects", () => {
  const graph = new RdfGraph();
  const subject = namedNode(`${WIKI}alice`);
  graph.add(subject, namedNode(RDF_TYPE), namedNode(SCHEMA + "Person"));
  graph.add(subject, namedNode(SCHEMA + "name"), literal("Alice"));
  graph.add(subject, namedNode(SCHEMA + "name"), literal("Alice"));
  graph.add(
    blankNode("b0"),
    namedNode(SCHEMA + "knows"),
    namedNode(`${WIKI}bob`),
  );

  assertEquals(graphStats(graph), {
    triples: 3,
    subjects: 2,
    predicates: 3,
    objects: 3,
  });
});

Deno.test("subClassOf drives the type of every instance after inference", async () => {
  clearAllProcessGraphs();
  const root = tempRoot();
  try {
    write(
      root,
      "wiki/custom-axiom.ttl",
      `@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix schema: <https://schema.org/> .
schema:Person rdfs:subClassOf schema:Agent .
`,
    );
    write(
      root,
      "wiki/gregory.md",
      `---
type: Person
givenName: Gregory
---
`,
    );
    const config = Config.forRoot(root, { wiki: { input: ["wiki"] } });

    const asserted = await loadGraph(config, { infer: false });
    const gregory = namedNode(`${WIKI}gregory`);
    assert(
      asserted.has(
        namedNode(SCHEMA + "Person"),
        namedNode(RDFS_SUBCLASS_OF),
        namedNode(SCHEMA + "Agent"),
      ),
    );
    assertFalse(
      asserted.has(gregory, namedNode(RDF_TYPE), namedNode(SCHEMA + "Agent")),
    );

    const { applyInference } = await import("../src/wiki/infer.ts");
    const expanded = applyInference(asserted, config);

    assert(
      expanded.has(gregory, namedNode(RDF_TYPE), namedNode(SCHEMA + "Agent")),
    );
  } finally {
    cleanup(root);
  }
});

Deno.test("inference does not leave engine bookkeeping in the graph", async () => {
  clearAllProcessGraphs();
  const root = tempRoot();
  try {
    write(
      root,
      "wiki/axioms.ttl",
      `@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix schema: <https://schema.org/> .
schema:Person rdfs:subClassOf schema:Agent .
`,
    );
    write(
      root,
      "wiki/gregory.md",
      `---
type: Person
givenName: Gregory
---
`,
    );
    const config = Config.forRoot(root, { wiki: { input: ["wiki"] } });

    const graph = await loadGraph(config, { infer: true });

    const leaked = [...graph].filter((item: Quad) =>
      item.subject.value.includes("rdfjs-inference-engine") ||
      item.predicate.value.includes("rdfjs-inference-engine") ||
      item.object.value.includes("rdfjs-inference-engine")
    );
    assertEquals(leaked, []);
    assert(
      graph.has(
        namedNode(`${WIKI}gregory`),
        namedNode(RDF_TYPE),
        namedNode(SCHEMA + "Agent"),
      ),
    );
  } finally {
    cleanup(root);
  }
});
