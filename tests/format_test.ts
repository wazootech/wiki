import { assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import { factory, parseRdf, RdfDataset, RdfGraph } from "../src/wiki/rdf.ts";
import { normalizeQueryFormat, runQuery } from "../src/wiki/format.ts";

function graphWithNames(): RdfGraph {
  const graph = new RdfGraph();
  const predicate = factory.namedNode("https://schema.org/name");
  graph.add(
    factory.namedNode("https://wiki.example.org/alice"),
    predicate,
    factory.literal("Alice"),
  );
  graph.add(
    factory.namedNode("https://wiki.example.org/bob"),
    predicate,
    factory.literal("Bob"),
  );
  return graph;
}

Deno.test("query format aliases normalize and unsupported formats reject", () => {
  assertEquals(normalizeQueryFormat("JSON"), "json");
  assertEquals(normalizeQueryFormat("text/csv"), "csv");
  assertEquals(normalizeQueryFormat("ttl"), "turtle");
  assertEquals(normalizeQueryFormat("md"), "markdown");
  try {
    normalizeQueryFormat("rdf+xml");
    throw new Error("Expected an unsupported format to reject.");
  } catch (error) {
    assertStringIncludes(
      error instanceof Error ? error.message : String(error),
      "Choose from table, json, csv, tsv, turtle, n3, markdown",
    );
  }
});

Deno.test("SPARQL updates are rejected after comments and prefixes", async () => {
  const error = await assertRejects(
    () =>
      runQuery(
        graphWithNames(),
        [
          "# update",
          "PREFIX ex: <https://example.org/>",
          "INSERT DATA { ex:s ex:p ex:o }",
        ].join(String.fromCharCode(10)),
      ),
    Error,
  );
  assertStringIncludes(error.message, "SPARQL updates are not supported");
});

Deno.test("SELECT query supports table and structured output formats", async () => {
  const graph = graphWithNames();
  const query =
    "SELECT ?name WHERE { ?s <https://schema.org/name> ?name } ORDER BY ?name";

  assertEquals(
    await runQuery(graph, query),
    "name \n-----\nAlice\nBob  ",
  );
  assertEquals(
    await runQuery(graph, query, { format: "csv" }),
    "name\r\nAlice\r\nBob\r\n",
  );
  assertEquals(
    await runQuery(graph, query, { format: "tsv" }),
    "name\nAlice\nBob",
  );
  assertEquals(
    await runQuery(graph, query, { format: "markdown" }),
    "| name |\n| --- |\n| Alice |\n| Bob |",
  );
  const json = JSON.parse(await runQuery(graph, query, { format: "json" }));
  assertEquals(json.head.vars, ["name"]);
  assertEquals(
    json.results.bindings.map((binding: { name: { value: string } }) =>
      binding.name.value
    ),
    ["Alice", "Bob"],
  );
});

Deno.test("SELECT pretty output and ASK queries remain usable", async () => {
  const graph = graphWithNames();
  const pretty = await runQuery(
    graph,
    "SELECT ?name WHERE { ?s <https://schema.org/name> ?name } ORDER BY ?name",
    { pretty: true },
  );
  assertEquals(
    pretty,
    "+-------+\n| name  |\n+-------+\n| Alice |\n| Bob   |\n+-------+",
  );

  assertEquals(
    await runQuery(
      graph,
      'ASK { <https://wiki.example.org/alice> <https://schema.org/name> "Alice" }',
    ),
    "true",
  );
  const ask = JSON.parse(
    await runQuery(
      graph,
      'ASK { <https://wiki.example.org/alice> <https://schema.org/name> "Alice" }',
      { format: "json" },
    ),
  );
  assertEquals(ask.boolean, true);
});

Deno.test("CONSTRUCT results serialize as RDF and preserve triples", async () => {
  const graph = graphWithNames();
  const turtle = await runQuery(
    graph,
    "CONSTRUCT { ?s <https://schema.org/name> ?name } WHERE { ?s <https://schema.org/name> ?name }",
    { format: "turtle" },
  );
  const quads = await parseRdf(turtle, "turtle");
  assertEquals(quads.length, 2);
});

Deno.test("query datasets expose their union and named graphs", async () => {
  const dataset = new RdfDataset({ defaultUnion: true });
  const graphName = factory.namedNode(
    "https://wiki.example.org/graphs/source/docs",
  );
  const person = factory.namedNode("https://wiki.example.org/alice");
  const predicate = factory.namedNode("https://schema.org/name");
  dataset.addQuad(
    factory.quad(person, predicate, factory.literal("Alice"), graphName),
  );

  const union = await runQuery(
    dataset,
    "SELECT ?name WHERE { ?person <https://schema.org/name> ?name }",
  );
  const named = await runQuery(
    dataset,
    "SELECT ?name WHERE { GRAPH <https://wiki.example.org/graphs/source/docs> { ?person <https://schema.org/name> ?name } }",
  );
  assertEquals(union, "name \n-----\nAlice");
  assertEquals(named, union);
});

Deno.test("CSV quotes cells and prefixes blank-node values", async () => {
  const graph = new RdfGraph();
  graph.add(
    factory.blankNode("record"),
    factory.namedNode("https://schema.org/name"),
    factory.literal("Ada, Lovelace"),
  );
  assertEquals(
    await runQuery(
      graph,
      "SELECT ?name WHERE { ?s <https://schema.org/name> ?name }",
      { format: "csv" },
    ),
    'name\r\n"Ada, Lovelace"\r\n',
  );
  assertEquals(
    await runQuery(
      graph,
      "SELECT ?s WHERE { ?s <https://schema.org/name> ?name }",
      { format: "csv" },
    ),
    "s\r\n_:record\r\n",
  );
});

Deno.test("Markdown query output links root-wiki page IRIs", async () => {
  const graph = new RdfGraph();
  graph.add(
    factory.namedNode("https://wiki.example.org/index"),
    factory.namedNode("https://schema.org/relatedLink"),
    factory.namedNode("https://wiki.example.org/Some_Page.md"),
  );
  const output = await runQuery(
    graph,
    "SELECT ?page WHERE { ?s <https://schema.org/relatedLink> ?page }",
    {
      format: "markdown",
      baseIri: "https://wiki.example.org/",
    },
  );
  assertStringIncludes(output, "[Some_Page](Some_Page.md)");
});
