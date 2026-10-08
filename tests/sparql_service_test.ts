import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";
import { createSparqlServiceHandler } from "../src/wiki/sparql_service.ts";
import { Wiki } from "../src/wiki/wiki.ts";

function createWiki(root: string, enabled = true): Wiki {
  const wikiDir = join(root, "wiki");
  Deno.mkdirSync(wikiDir, { recursive: true });
  Deno.writeTextFileSync(
    join(root, "wiki.yml"),
    `wiki:\n  input: [wiki]\nsparql_service:\n  enabled: ${enabled}\n  path: /api/sparql\n`,
  );
  Deno.writeTextFileSync(
    join(wikiDir, "Ethan.md"),
    "---\nname: Ethan\ntype: schema:Person\n---\n\n# Ethan\n",
  );
  return Wiki.load(join(root, "wiki.yml"));
}

Deno.test("SPARQL service returns a Turtle service description by default", async () => {
  const root = await Deno.makeTempDir({ prefix: "wiki-sparql-service-" });
  const wiki = createWiki(root);
  try {
    const handler = createSparqlServiceHandler(wiki, {
      path: wiki.config.sparql_service.path,
      baseUrl: wiki.config.site.base_url,
    });
    const response = await handler(new Request("http://localhost/api/sparql"));
    assert(response !== null);
    assertEquals(response.status, 200);
    assertStringIncludes(
      response.headers.get("content-type") ?? "",
      "text/turtle",
    );
    assertStringIncludes(await response.text(), "sd:Service");
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("SPARQL service defers RDF/XML with an explicit error", async () => {
  const root = await Deno.makeTempDir({ prefix: "wiki-sparql-service-" });
  const wiki = createWiki(root);
  try {
    const handler = createSparqlServiceHandler(wiki, {
      path: wiki.config.sparql_service.path,
      baseUrl: wiki.config.site.base_url,
    });
    const response = await handler(
      new Request("http://localhost/api/sparql", {
        headers: { accept: "application/rdf+xml" },
      }),
    );
    assert(response !== null);
    assertEquals(response.status, 406);
    assertStringIncludes(
      await response.text(),
      "RDF/XML serialization is deferred",
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("SPARQL service supports GET JSON and POST N-Triples", async () => {
  const root = await Deno.makeTempDir({ prefix: "wiki-sparql-service-" });
  const wiki = createWiki(root);
  try {
    const handler = createSparqlServiceHandler(wiki, {
      path: wiki.config.sparql_service.path,
      baseUrl: wiki.config.site.base_url,
    });
    const select = encodeURIComponent(
      "SELECT ?name WHERE { ?person <https://schema.org/name> ?name }",
    );
    const jsonResponse = await handler(
      new Request(
        `http://localhost/api/sparql?query=${select}`,
        { headers: { accept: "application/sparql-results+json" } },
      ),
    );
    assert(jsonResponse !== null);
    assertEquals(jsonResponse.status, 200);
    const json = await jsonResponse.json();
    assertEquals(json.results.bindings[0].name.value, "Ethan");

    const construct = "CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }";
    const ntriplesResponse = await handler(
      new Request("http://localhost/api/sparql", {
        method: "POST",
        headers: {
          accept: "application/n-triples",
          "content-type": "application/sparql-query",
        },
        body: construct,
      }),
    );
    assert(ntriplesResponse !== null);
    assertEquals(ntriplesResponse.status, 200);
    assertStringIncludes(
      ntriplesResponse.headers.get("content-type") ?? "",
      "application/n-triples",
    );
    assertStringIncludes(await ntriplesResponse.text(), "schema.org/name");
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("SPARQL service rejects updates and disabled endpoints", async () => {
  const root = await Deno.makeTempDir({ prefix: "wiki-sparql-service-" });
  const wiki = createWiki(root);
  const disabledWiki = createWiki(join(root, "disabled"), false);
  try {
    const handler = createSparqlServiceHandler(wiki, {
      path: wiki.config.sparql_service.path,
      baseUrl: wiki.config.site.base_url,
    });
    const update = await handler(
      new Request("http://localhost/api/sparql", {
        method: "POST",
        headers: { "content-type": "application/sparql-query" },
        body: "INSERT DATA { <urn:s> <urn:p> <urn:o> }",
      }),
    );
    assert(update !== null);
    assertEquals(update.status, 405);
    assertStringIncludes(await update.text(), "SPARQL Update is not supported");

    const disabled = createSparqlServiceHandler(disabledWiki, {
      path: disabledWiki.config.sparql_service.path,
      baseUrl: disabledWiki.config.site.base_url,
    });
    const response = await disabled(new Request("http://localhost/api/sparql"));
    assert(response !== null);
    assertEquals(response.status, 404);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
