import { assertEquals } from "@std/assert";
import { fromFileUrl } from "@std/path";
import { Config } from "../src/wiki/config.ts";
import { loadGraph } from "../src/wiki/graph.ts";
import { runQuery } from "../src/wiki/format.ts";
import { literal, namedNode } from "../src/wiki/rdf.ts";

const CONFIG_PATH = fromFileUrl(
  new URL("../parity/corpus/micro/wiki.yml", import.meta.url),
);

Deno.test("configured RDF/XML input is ingested and queryable", async () => {
  const config = Config.load(CONFIG_PATH);
  const graph = await loadGraph(config, {
    infer: false,
    useCache: false,
    diskCache: false,
  });
  assertEquals(
    graph.has(
      namedNode("https://example.org/rdf-ingestion"),
      namedNode("https://schema.org/name"),
      literal("RDF/XML integration fixture"),
    ),
    true,
  );

  const query =
    "SELECT ?name WHERE { <https://example.org/rdf-ingestion> <https://schema.org/name> ?name }";
  const result = JSON.parse(
    await runQuery(graph, query, { format: "json" }),
  ) as {
    results: { bindings: Array<{ name?: { value: string } }> };
  };
  assertEquals(
    result.results.bindings.map((binding) => binding.name?.value),
    ["RDF/XML integration fixture"],
  );
});
