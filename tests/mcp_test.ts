import { join } from "@std/path";
import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from "@std/assert";
import {
  createMcpServer,
  describeWiki,
  graphTtlResource,
  infoResource,
  type McpTransport,
  namespacesResource,
  querySparql,
  runMcpServer,
} from "../src/wiki/mcp.ts";

import { Wiki } from "../src/wiki/wiki.ts";

function tempRoot(): string {
  return Deno.makeTempDirSync({ prefix: "wiki-mcp-" });
}

function cleanup(root: string): void {
  try {
    Deno.removeSync(root, { recursive: true });
  } catch {
    // Windows can briefly retain a handle after a graph read.
  }
}

function makeWiki(root: string): Wiki {
  const wikiDir = join(root, "wiki");
  Deno.mkdirSync(wikiDir, { recursive: true });
  Deno.writeTextFileSync(
    join(root, "wiki.yaml"),
    "wiki:\n  input: [wiki]\n",
  );
  Deno.writeTextFileSync(
    join(wikiDir, "Ethan.md"),
    "---\ntype: schema:Person\ngivenName: Ethan\nfamilyName: Davidson\n---\n",
  );
  return Wiki.load(root);
}

Deno.test("describeWiki reports factual config, graph, namespace, and vocabulary data", async () => {
  const root = tempRoot();
  try {
    const description = await describeWiki(makeWiki(root));

    assertEquals(description.version, "0.1.24");
    assertEquals(description.config, "wiki.yaml");
    assertEquals(description.inputs, ["wiki"]);
    assert(description.graph.triples > 0);
    assertEquals(description.graph.inference, true);
    assertEquals(
      description.vocabulary.classes.find((entry) =>
        entry.iri === "https://schema.org/Person"
      ),
      {
        iri: "https://schema.org/Person",
        count: 1,
        curie: "schema:Person",
      },
    );
    assert(
      description.vocabulary.predicates.some((entry) =>
        entry.iri === "https://schema.org/givenName" &&
        entry.curie === "schema:givenName"
      ),
    );
  } finally {
    cleanup(root);
  }
});

Deno.test("querySparql preserves structured results and TypeScript format aliases", async () => {
  const root = tempRoot();
  try {
    const wiki = makeWiki(root);
    const query =
      "SELECT ?given WHERE { ?s <https://schema.org/givenName> ?given }";
    const json = await querySparql(wiki, query, {
      format: "json",
      inference: false,
    });
    assertEquals(json.format, "json");
    assertEquals(json.query_form, "SELECT");
    assertEquals(
      JSON.parse(json.result).results.bindings[0].given.value,
      "Ethan",
    );

    const csv = await querySparql(wiki, query, {
      format: "text/csv",
      inference: false,
    });
    assertEquals(csv.format, "csv");
    assertStringIncludes(csv.result, "Ethan");
  } finally {
    cleanup(root);
  }
});

Deno.test("querySparql rejects updates, unrecognized forms, and unsupported formats", async () => {
  const root = tempRoot();
  try {
    const wiki = makeWiki(root);
    const updateError = await assertRejects(
      () => querySparql(wiki, "INSERT DATA { <urn:s> <urn:p> <urn:o> }"),
      Error,
    );
    assertStringIncludes(updateError.message, "SPARQL Update");

    const formError = await assertRejects(
      () => querySparql(wiki, "PREFIX schema: <https://schema.org/> BAD QUERY"),
      Error,
    );
    assertStringIncludes(formError.message, "Could not determine");

    const formatError = await assertRejects(
      () =>
        querySparql(
          wiki,
          "SELECT ?s WHERE { ?s ?p ?o }",
          { format: "application/rdf+xml" },
        ),
      Error,
    );
    assertStringIncludes(
      formatError.message,
      "Unsupported query result format",
    );
  } finally {
    cleanup(root);
  }
});

Deno.test("wiki MCP resources return JSON and Turtle contents", async () => {
  const root = tempRoot();
  try {
    const wiki = makeWiki(root);
    const info = JSON.parse(await infoResource(wiki));
    const namespaces = JSON.parse(await namespacesResource(wiki));
    const turtle = await graphTtlResource(wiki);

    assert("vocabulary" in info);
    assert("schema" in namespaces);
    assertStringIncludes(turtle, "schema:givenName");
  } finally {
    cleanup(root);
  }
});

Deno.test("MCP factory exposes typed tools/resources and validates request errors", async () => {
  const root = tempRoot();
  try {
    const server = createMcpServer(makeWiki(root));
    const initialized = await server.handleMessage({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "test-client", version: "1" },
      },
    });
    assertEquals(
      initialized?.result &&
        (initialized.result as { serverInfo: { name: string } }).serverInfo
          .name,
      "wiki",
    );

    const listed = await server.handleMessage({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
    });
    const toolNames = (listed?.result as { tools: { name: string }[] }).tools
      .map((tool) => tool.name);
    assertEquals(toolNames, ["query_sparql", "describe_wiki"]);
    const listedTools = (listed?.result as {
      tools: { name: string; outputSchema?: { type: string } }[];
    }).tools;
    assertEquals(listedTools[0]?.outputSchema?.type, "object");

    const listedResources = await server.handleMessage({
      jsonrpc: "2.0",
      id: 8,
      method: "resources/list",
    });
    const resourceDefinitions = (listedResources?.result as {
      resources: { uri: string; mimeType: string }[];
    }).resources;
    assertEquals(resourceDefinitions.map((resource) => resource.uri), [
      "wiki://info",
      "wiki://namespaces",
      "wiki://graph.ttl",
    ]);
    assertEquals(resourceDefinitions[2]?.mimeType, "text/turtle");

    const called = await server.handleMessage({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "query_sparql",
        arguments: {
          query:
            "SELECT ?given WHERE { ?s <https://schema.org/givenName> ?given }",
          inference: false,
        },
      },
    });
    const toolResult = called?.result as {
      structuredContent: { format: string; query_form: string; result: string };
      isError: boolean;
    };
    assertEquals(toolResult.isError, false);
    assertEquals(toolResult.structuredContent.format, "json");
    assertEquals(toolResult.structuredContent.query_form, "SELECT");
    assertStringIncludes(toolResult.structuredContent.result, "Ethan");

    const described = await server.handleMessage({
      jsonrpc: "2.0",
      id: 9,
      method: "tools/call",
      params: { name: "describe_wiki" },
    });
    const descriptionResult = described?.result as {
      structuredContent: { config: string | null; vocabulary: unknown };
      isError: boolean;
    };
    assertEquals(descriptionResult.isError, false);
    assertEquals(descriptionResult.structuredContent.config, "wiki.yaml");
    assert(descriptionResult.structuredContent.vocabulary !== undefined);

    const invalidToolArgs = await server.handleMessage({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "query_sparql", arguments: { query: 3 } },
    });
    assertEquals(
      (invalidToolArgs?.result as { isError: boolean }).isError,
      true,
    );

    const invalidParams = await server.handleMessage({
      jsonrpc: "2.0",
      id: 5,
      method: "resources/read",
      params: { uri: 7 },
    });
    assertEquals((invalidParams?.error as { code: number }).code, -32602);

    const unknownMethod = await server.handleMessage({
      jsonrpc: "2.0",
      id: 6,
      method: "not/a/method",
    });
    assertEquals((unknownMethod?.error as { code: number }).code, -32601);

    const unknownResource = await server.handleMessage({
      jsonrpc: "2.0",
      id: 7,
      method: "resources/read",
      params: { uri: "wiki://missing" },
    });
    assertEquals((unknownResource?.error as { code: number }).code, -32002);

    const notification = await server.handleMessage({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
    assertEquals(notification, null);
  } finally {
    cleanup(root);
  }
});

Deno.test("stdio transport can be injected and tested without a process or network", async () => {
  const root = tempRoot();
  try {
    const encoder = new TextEncoder();
    const input = [
      {
        jsonrpc: "2.0",
        id: "init",
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "transport-test", version: "1" },
        },
      },
      {
        jsonrpc: "2.0",
        id: "read",
        method: "resources/read",
        params: { uri: "wiki://namespaces" },
      },
      { jsonrpc: "2.0", method: "notifications/initialized" },
    ].map((message) => JSON.stringify(message)).join("\n") + "\n";
    let output = "";
    const transport: McpTransport = {
      readable: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(input));
          controller.close();
        },
      }),
      writable: new WritableStream<Uint8Array>({
        write(chunk) {
          output += new TextDecoder().decode(chunk);
        },
      }),
    };

    await runMcpServer(makeWiki(root), { transport });
    const responses = output.trim().split("\n").map((line) => JSON.parse(line));
    assertEquals(responses.map((response) => response.id), ["init", "read"]);
    assertEquals(responses[0].result.serverInfo.name, "wiki");
    assertEquals(responses[1].result.contents[0].uri, "wiki://namespaces");
    assert("schema" in JSON.parse(responses[1].result.contents[0].text));
  } finally {
    cleanup(root);
  }
});
