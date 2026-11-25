import { join } from "@std/path";
import { assert, assertEquals } from "@std/assert";
import { Config } from "../src/wiki/config.ts";
import { loadGraph } from "../src/wiki/graph.ts";
import { clearAllProcessGraphs } from "../src/wiki/graph_cache.ts";
import { literal, namedNode, RDF_TYPE } from "../src/wiki/rdf.ts";
import {
  captureLogs,
  cleanup,
  SCHEMA,
  tempRoot,
  WIKI,
  write,
} from "./graph_support.ts";

// ---------------------------------------------------------------------------
// Graph loading
// ---------------------------------------------------------------------------

Deno.test("loadGraph reads every input dir and survives broken RDF", async () => {
  clearAllProcessGraphs();
  const root = tempRoot();
  try {
    const wiki = join(root, "wiki");
    const imports = join(root, "imports");
    Deno.mkdirSync(wiki, { recursive: true });
    Deno.mkdirSync(imports, { recursive: true });

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

Deno.test("separate Turtle fences keep blank-node labels in separate scopes", async () => {
  clearAllProcessGraphs();
  const root = tempRoot();
  try {
    write(
      root,
      "wiki/Scoped.md",
      [
        "```turtle",
        '_:x <https://example.org/p> "first" .',
        '_:x <https://example.org/q> "first" .',
        "```",
        "",
        "```turtle",
        '_:x <https://example.org/p> "second" .',
        '_:x <https://example.org/q> "second" .',
        "```",
      ].join("\n"),
    );
    const config = Config.forRoot(root, { wiki: { input: ["wiki"] } });
    const graph = await loadGraph(config, {
      infer: false,
      useCache: false,
      diskCache: false,
    });
    const blankSubjects = [...graph.subjects()].filter((term) =>
      term.termType === "BlankNode"
    );

    assertEquals(graph.size, 4);
    assertEquals(blankSubjects.length, 2);
    assertEquals(
      new Set(blankSubjects.map((term) => term.value)).size,
      2,
    );
    assertEquals(
      [...graph.match(blankSubjects[0] ?? null, null, null)].length,
      2,
    );
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
