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

    assertEquals(description.version, "0.3.0");
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
    assertEquals(toolNames, [
      "query_sparql",
      "describe_wiki",
      "wiki_page_show",
      "wiki_page_refs",
    ]);
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

interface ToolResult {
  isError: boolean;
  structuredContent?: {
    status?: string;
    hash?: string;
    [key: string]: unknown;
  };
  content: { type: string; text: string }[];
}

async function callTool(
  server: ReturnType<typeof createMcpServer>,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const response = await server.handleMessage({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name, arguments: args },
  });
  assertEquals(response?.error, undefined);
  return response?.result as ToolResult;
}

Deno.test("write tools are not listed or callable without allowWrite (#356)", async () => {
  const root = tempRoot();
  try {
    const server = createMcpServer(makeWiki(root));
    const listed = await server.handleMessage({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    });
    const names = (listed?.result as { tools: { name: string }[] }).tools
      .map((tool) => tool.name);
    assertEquals(names.filter((name) => name.startsWith("wiki_page_")), [
      "wiki_page_show",
      "wiki_page_refs",
    ]);
    assert(!names.includes("wiki_edit_apply"));
    const called = await callTool(server, "wiki_edit_apply", {
      ops: [{ op: "create", path: "wiki/New.md", content: "# New\n" }],
      dry_run: false,
    });
    assertEquals(called.isError, true);
    assertStringIncludes(called.content[0]!.text, "--allow-write");
    assertEquals(
      Deno.statSync(join(root, "wiki")).isDirectory &&
        !Deno.readDirSync(join(root, "wiki")).toArray().some((entry) =>
          entry.name === "New.md"
        ),
      true,
    );
  } finally {
    cleanup(root);
  }
});

Deno.test("wiki_page_show returns the hash an edit passes as expect (#356)", async () => {
  const root = tempRoot();
  try {
    const server = createMcpServer(makeWiki(root));
    const shown = await callTool(server, "wiki_page_show", {
      path: "wiki/Ethan.md",
    });
    assertEquals(shown.isError, false);
    assertEquals(typeof shown.structuredContent?.hash, "string");
    const refs = await callTool(server, "wiki_page_refs", {
      path: "wiki/Ethan.md",
    });
    assertEquals(refs.isError, false);
    const missing = await callTool(server, "wiki_page_show", {
      path: "wiki/Nope.md",
    });
    assertEquals(missing.isError, true);
  } finally {
    cleanup(root);
  }
});

Deno.test("write tools dry-run by default, apply on dry_run=false, and refuse stale expect (#356)", async () => {
  const root = tempRoot();
  try {
    const wiki = makeWiki(root);
    const server = createMcpServer(wiki, { allowWrite: true });
    const listed = await server.handleMessage({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    });
    const names = (listed?.result as { tools: { name: string }[] }).tools
      .map((tool) => tool.name);
    for (
      const name of [
        "wiki_edit_apply",
        "wiki_page_create",
        "wiki_page_set_field",
        "wiki_page_patch",
        "wiki_page_move",
        "wiki_page_delete",
      ]
    ) {
      assert(names.includes(name), name);
    }

    const page = join(root, "wiki", "Ethan.md");
    const before = Deno.readTextFileSync(page);

    // The dry run is the report `wiki edit --json` returns, and writes nothing.
    const dry = await callTool(server, "wiki_page_set_field", {
      path: "wiki/Ethan.md",
      field: "givenName",
      value: "Ethan T.",
    });
    assertEquals(dry.isError, false);
    assertEquals(dry.structuredContent?.status, "dry_run");
    assertEquals(
      dry.structuredContent,
      JSON.parse(JSON.stringify(
        await wiki.edit({
          ops: [{
            op: "set",
            path: "wiki/Ethan.md",
            field: "givenName",
            value: "Ethan T.",
          }],
        }),
      )),
    );
    assertEquals(Deno.readTextFileSync(page), before);

    // A stale expect is a conflict result, not a thrown error, and writes nothing.
    const stale = await callTool(server, "wiki_page_set_field", {
      path: "wiki/Ethan.md",
      field: "givenName",
      value: "Nope",
      expect: "0".repeat(64),
      dry_run: false,
    });
    assertEquals(stale.isError, true);
    assertEquals(stale.structuredContent?.status, "conflict");
    assertEquals(Deno.readTextFileSync(page), before);

    // Applying needs dry_run=false.
    const shown = await callTool(server, "wiki_page_show", {
      path: "wiki/Ethan.md",
    });
    const applied = await callTool(server, "wiki_page_set_field", {
      path: "wiki/Ethan.md",
      field: "givenName",
      value: "Ethan T.",
      expect: shown.structuredContent?.hash,
      dry_run: false,
    });
    assertEquals(applied.isError, false);
    assertEquals(applied.structuredContent?.status, "applied");
    assertStringIncludes(Deno.readTextFileSync(page), "Ethan T.");

    // The graph the server answers from reflects the applied edit.
    const queried = await callTool(server, "query_sparql", {
      query: "SELECT ?n WHERE { ?s <https://schema.org/givenName> ?n }",
    });
    assertStringIncludes(queried.content[0]!.text, "Ethan T.");

    // A batch applies all-or-nothing through wiki_edit_apply.
    const created = await callTool(server, "wiki_edit_apply", {
      ops: [{
        op: "create",
        path: "wiki/Other.md",
        content: "---\ntype: schema:Person\ngivenName: Other\n---\n",
      }],
      dry_run: false,
    });
    assertEquals(created.structuredContent?.status, "applied");
    assertEquals(
      Deno.readTextFileSync(join(root, "wiki", "Other.md")).includes("Other"),
      true,
    );

    // A malformed edit is a tool error the agent can repair, not a protocol error.
    const malformed = await callTool(server, "wiki_edit_apply", {
      ops: [{ op: "frobnicate", path: "wiki/Other.md" }],
    });
    assertEquals(malformed.isError, true);

    // Paths outside the wiki's documents are refused.
    const outside = await callTool(server, "wiki_page_create", {
      path: ".wiki/cache/x.md",
      content: "# x\n",
      dry_run: false,
    });
    assertEquals(outside.isError, true);
  } finally {
    cleanup(root);
  }
});
