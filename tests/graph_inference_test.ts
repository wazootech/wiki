import { assert, assertEquals, assertFalse } from "@std/assert";
import { Config } from "../src/wiki/config.ts";
import { frontmatterToGraph, loadGraph } from "../src/wiki/graph.ts";
import { clearAllProcessGraphs } from "../src/wiki/graph_cache.ts";
import { applyInference } from "../src/wiki/infer.ts";
import { parseFrontmatter } from "../src/wiki/parser.ts";
import {
  literal,
  type NamedNode,
  namedNode,
  type Quad,
  RDF_TYPE,
  RdfDataset,
  RdfGraph,
  termKey,
  XSD_BOOLEAN,
  XSD_DATE,
  XSD_DATETIME,
  XSD_DOUBLE,
  XSD_INTEGER,
} from "../src/wiki/rdf.ts";
import {
  cleanup,
  RDFS_SUBCLASS_OF,
  SCHEMA,
  tempRoot,
  WIKI,
  write,
} from "./graph_support.ts";

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

Deno.test("YAML date-only frontmatter becomes xsd:date with its lexical form", () => {
  // End to end through the parser: PyYAML hands rdflib a `date` for
  // `2026-05-30` and the oracle writes `"2026-05-30"^^xsd:date`. A bare
  // `Date` would lose both the type and the spelling, so the parser records
  // the lexical form at the YAML layer (see `scalars.ts`).
  const config = new Config();
  const attrs = parseFrontmatter(
    "---\npublished: 2026-05-30\n---\n\nBody\n",
  );
  const graph = frontmatterToGraph(
    { "@type": "TechArticle", "@id": "wiki:dates", ...attrs },
    config.context,
  );
  const subject = namedNode(`${WIKI}dates`);
  assert(
    graph.has(
      subject,
      namedNode(`${SCHEMA}published`),
      literal("2026-05-30", { datatype: XSD_DATE }),
    ),
  );
});

Deno.test("a zoned YAML timestamp keeps rdflib's +00:00 lexical form", () => {
  // rdflib serialises a zoned datetime as `2026-05-30T00:00:00+00:00`;
  // `Date#toISOString` would emit the `...000Z` form instead.
  const config = new Config();
  const attrs = parseFrontmatter(
    "---\nupdated: 2026-05-30T00:00:00Z\n---\n\nBody\n",
  );
  const graph = frontmatterToGraph(
    { "@type": "TechArticle", "@id": "wiki:dates", ...attrs },
    config.context,
  );
  const subject = namedNode(`${WIKI}dates`);
  assert(
    graph.has(
      subject,
      namedNode(`${SCHEMA}updated`),
      literal("2026-05-30T00:00:00+00:00", { datatype: XSD_DATETIME }),
    ),
  );
});

Deno.test("YAML 30.0 becomes xsd:double and is not dropped as falsy", () => {
  // End to end through the parser: `30.0` parses to the number `30`, which
  // the graph layer would otherwise type `xsd:integer` — or drop entirely,
  // because a `WikiFloat` is `typeof "object"` and the old `isTruthy` read
  // it as an empty mapping. Python writes `"30.0"^^xsd:double`.
  const config = new Config();
  const attrs = parseFrontmatter(
    "---\nscore: 30.0\ncount: 30\nnothing: 0.0\n---\n\nBody\n",
  );
  const graph = frontmatterToGraph(
    { "@type": "TechArticle", "@id": "wiki:nums", ...attrs },
    config.context,
  );
  const subject = namedNode(`${WIKI}nums`);
  assert(
    graph.has(
      subject,
      namedNode(`${SCHEMA}score`),
      literal("30.0", { datatype: XSD_DOUBLE }),
    ),
  );
  assert(
    graph.has(
      subject,
      namedNode(`${SCHEMA}count`),
      literal("30", { datatype: XSD_INTEGER }),
    ),
  );
  // `0.0` is a value, not an absence (#374): it is a typed literal.
  assert(
    graph.has(
      subject,
      namedNode(`${SCHEMA}nothing`),
      literal("0.0", { datatype: XSD_DOUBLE }),
    ),
  );
});

Deno.test("falsy frontmatter values are emitted, absences are not (#374)", () => {
  const config = new Config();
  const attrs = parseFrontmatter(
    '---\nprice: 0\nfree: false\nnote: ""\nnone: null\nlist: []\nmap: {}\n---\n\nBody\n',
  );
  const graph = frontmatterToGraph(
    { "@type": "Product", "@id": "wiki:falsy", ...attrs },
    config.context,
  );
  const subject = namedNode(`${WIKI}falsy`);
  assert(
    graph.has(
      subject,
      namedNode(`${SCHEMA}price`),
      literal("0", { datatype: XSD_INTEGER }),
    ),
  );
  assert(
    graph.has(
      subject,
      namedNode(`${SCHEMA}free`),
      literal("false", { datatype: XSD_BOOLEAN }),
    ),
  );
  assert(graph.has(subject, namedNode(`${SCHEMA}note`), literal("")));
  for (const absent of ["none", "list", "map"]) {
    assertEquals(
      [...graph.match(subject, namedNode(`${SCHEMA}${absent}`))].length,
      0,
      absent,
    );
  }
});

Deno.test("inference keeps one literal per numeric value (#367)", () => {
  // `1`^^xsd:integer and `1.0`^^xsd:double are value-equal to the bundled
  // dt-eq rule, and eq-rep-o used to copy each onto the other's subject, so a
  // `price: 1.00` page failed `sh:maxCount 1`.
  const config = new Config();
  const values: Record<string, string> = {
    int: "1",
    float: "1.00",
    other: "2.00",
    frac: "3.50",
    zero: "0.00",
  };
  const graph = new RdfGraph();
  for (const [id, value] of Object.entries(values)) {
    const attrs = parseFrontmatter(`---\nprice: ${value}\n---\n\nBody\n`);
    for (
      const quad of frontmatterToGraph(
        { "@type": "Product", "@id": `wiki:${id}`, ...attrs },
        config.context,
      )
    ) {
      graph.add(quad.subject, quad.predicate as NamedNode, quad.object);
    }
  }
  applyInference(graph, config);
  const prices = (id: string) =>
    [...graph.match(namedNode(`${WIKI}${id}`), namedNode(`${SCHEMA}price`))]
      .map(({ object }) => termKey(object));
  assertEquals(prices("int"), [
    termKey(literal("1", { datatype: XSD_INTEGER })),
  ]);
  assertEquals(prices("float"), [
    termKey(literal("1.0", { datatype: XSD_DOUBLE })),
  ]);
  assertEquals(prices("zero"), [
    termKey(literal("0.0", { datatype: XSD_DOUBLE })),
  ]);
  assertEquals(prices("other").length, 1);
  assertEquals(prices("frac").length, 1);
});

Deno.test("inference works on a named graph and derives into it (#382)", () => {
  // A named graph's quads carry their graph term; handing them to the engine
  // as-is serialized `{` into the N3 text and skipped reasoning entirely.
  const RDFS = "http://www.w3.org/2000/01/rdf-schema#";
  const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
  const dataset = new RdfDataset();
  const graph = dataset.graph("https://wiki.example.org/graphs/source/a");
  graph.add(
    namedNode(`${WIKI}Person`),
    namedNode(`${RDFS}subClassOf`),
    namedNode(`${WIKI}Agent`),
  );
  graph.add(
    namedNode(`${WIKI}ada`),
    namedNode(RDF_TYPE),
    namedNode(`${WIKI}Person`),
  );
  const before = graph.size;
  applyInference(graph, new Config());
  assert(graph.size > before, "inference derived no triples");
  const derived = [
    ...graph.match(
      namedNode(`${WIKI}ada`),
      namedNode(RDF_TYPE),
      namedNode(`${WIKI}Agent`),
    ),
  ];
  assertEquals(derived.length, 1);
  assertEquals(derived[0]!.graph.value, graph.graphName!.value);
});
