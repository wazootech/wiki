import { join, resolve } from "@std/path";
import { assert, assertEquals, assertFalse } from "@std/assert";
import { Config } from "../src/wiki/config.ts";
import {
  graphDescriptors,
  graphStats,
  loadDataset,
  loadGraph,
  sourceGraphUri,
  usesNamedGraphs,
} from "../src/wiki/graph.ts";
import { clearAllProcessGraphs } from "../src/wiki/graph_cache.ts";
import {
  blankNode,
  literal,
  namedNode,
  RDF_TYPE,
  RdfGraph,
} from "../src/wiki/rdf.ts";
import { saveLockfile } from "../src/wiki/schemas/sources.ts";
import {
  captureLogs,
  cleanup,
  lockBrain,
  SCHEMA,
  sourceFixture,
  tempRoot,
  WIKI,
  write,
} from "./graph_support.ts";

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
      join(root, ".wiki", "cache"),
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
    }, join(root, "wiki.lock"));

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
      resolve(brain.local_path!),
      resolve(source),
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
