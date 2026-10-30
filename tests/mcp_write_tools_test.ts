import { join } from "@std/path";
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { createMcpServer } from "../src/wiki/mcp.ts";
import { callTool, cleanup, makeWiki, tempRoot } from "./mcp_support.ts";

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
