/**
 * Tests for `src/wiki/graph_cache.ts`.
 *
 * The Python suite (`tests/test_graph_cache.py`) covers the cache *behaviour*
 * through `load_graph`, which belongs to this module's consumer. What is tested
 * here is the machinery underneath it — the fingerprint, the manifest, the path
 * scheme, the two caches and their invalidation rules — so that when
 * `graph.ts` lands there is nothing left to discover.
 */

import { basename, extname, join } from "@std/path";
import { pathExists, readText } from "../src/wiki/fspath.ts";
import {
  assertEquals,
  assertNotEquals,
  assertStringIncludes,
} from "@std/assert";
import { Config } from "../src/wiki/config.ts";

import {
  cacheDir,
  canonicalJson,
  clearAllProcessGraphs,
  clearProcessGraph,
  datasetCachePath,
  diskCachePath,
  getDiskDataset,
  getDiskGraph,
  getProcessDataset,
  getProcessGraph,
  iterWikiFiles,
  setDiskDataset,
  setDiskGraph,
  setProcessGraph,
  wikiFingerprint,
  wikiManifest,
} from "../src/wiki/graph_cache.ts";
import {
  literal,
  namedNode,
  RdfDataset,
  RdfGraph,
  triple,
} from "../src/wiki/rdf.ts";

/** 2023-11-14T22:13:20Z, a whole second so both sides record the same instant. */
const PINNED_MTIME = 1_700_000_000;

/** Run `body` with a fresh temp directory, cleaning up afterwards. */
async function withTempDir(
  body: (root: string) => void | Promise<void>,
): Promise<void> {
  const dir = Deno.makeTempDirSync({ prefix: "wiki-cache-" });
  try {
    await body(dir);
  } finally {
    clearAllProcessGraphs();
    Deno.removeSync(dir, { recursive: true });
  }
}

/** A wiki with one page, plus the config that points at it. */
function wiki(
  root: string,
  content = "---\ntype: Person\ngivenName: Ada\n---\n",
) {
  const wikiDir = join(root, "wiki");
  Deno.mkdirSync(wikiDir, { recursive: true });
  const page = join(wikiDir, "page.md");
  Deno.writeTextFileSync(page, content);
  return {
    wikiDir,
    page,
    config: Config.forRoot(root, { wiki: { input: [wikiDir] } }),
  };
}

Deno.test("the fingerprint follows content and configuration, not the clock", async () => {
  await withTempDir((root) => {
    const { page, config } = wiki(root);
    const first = wikiFingerprint(config);
    assertEquals(
      wikiFingerprint(config),
      first,
      "a repeat call must be stable",
    );

    Deno.writeTextFileSync(page, "---\ntype: Person\ngivenName: Grace\n---\n");
    const edited = wikiFingerprint(config);
    assertNotEquals(edited, first);

    // A configuration change that alters how the graph is built must invalidate
    // the cache too, even when every file is untouched.
    const other = Config.forRoot(root, {
      wiki: { input: [config.wiki.input[0]!] },
      graph: { base_iri: "https://other.example/" },
    });
    assertNotEquals(wikiFingerprint(other), edited);
  });
});

Deno.test("the manifest describes each contributing file", async () => {
  await withTempDir((root) => {
    const { config } = wiki(root);
    const manifest = wikiManifest(config);
    assertEquals(manifest.version, "0.1.24");
    assertEquals(manifest.files.length, 1);
    assertEquals(manifest.files[0]!.path, "wiki/page.md");
    assertEquals(manifest.files[0]!.size > 0, true);
    assertEquals(manifest.files[0]!.mtime_ns > 0, true);
    assertEquals(manifest.config["base_iri"], "https://wiki.example.org/");
  });
});

Deno.test("the cache directory is excluded from the files it fingerprints", async () => {
  await withTempDir((root) => {
    const { config } = wiki(root);
    const cache = cacheDir(config);
    Deno.mkdirSync(cache, { recursive: true });
    Deno.writeTextFileSync(
      join(cache, "graph-asserted-deadbeef.nt"),
      "<a> <b> <c> .\n",
    );
    // A staged file inside the wiki tree that is not a cache artifact.
    Deno.writeTextFileSync(join(config.wiki.input[0]!, "other.md"), "x");

    const files = iterWikiFiles(config).map((path) => basename(path)).sort();
    assertEquals(files, ["other.md", "page.md"]);
  });
});

Deno.test("excluded files do not contribute to the fingerprint", async () => {
  await withTempDir((root) => {
    const wikiDir = join(root, "wiki");
    Deno.mkdirSync(join(wikiDir, "drafts"), { recursive: true });
    Deno.writeTextFileSync(join(wikiDir, "Published.md"), "x");
    Deno.writeTextFileSync(join(wikiDir, "drafts", "Draft.md"), "x");
    const config = Config.forRoot(root, {
      wiki: { input: [wikiDir], exclude: ["wiki/drafts/**"] },
    });
    assertEquals(wikiManifest(config).files.map((entry) => entry.path), [
      "wiki/Published.md",
    ]);
  });
});

Deno.test("canonical json reproduces Python's json.dumps output", () => {
  // Sorted keys, no separator whitespace, and `ensure_ascii` escaping — the
  // three things JSON.stringify gets wrong for this use.
  assertEquals(canonicalJson({ b: 1, a: [2, 3] }), '{"a":[2,3],"b":1}');
  assertEquals(
    canonicalJson({ path: "wiki/caf\u00e9.md" }),
    '{"path":"wiki/caf\\u00e9.md"}',
  );
  assertEquals(
    canonicalJson({ emoji: "\u{1f600}" }),
    '{"emoji":"\\ud83d\\ude00"}',
  );
  assertEquals(
    canonicalJson({ tab: "a\tb", nl: "a\nb" }),
    '{"nl":"a\\nb","tab":"a\\tb"}',
  );
  assertEquals(
    canonicalJson({ none: null, yes: true }),
    '{"none":null,"yes":true}',
  );
  assertEquals(canonicalJson({ del: "\u007f" }), '{"del":"\\u007f"}');
  // A nested object is sorted at every level, as `sort_keys` does.
  assertEquals(canonicalJson({ z: { b: 1, a: 2 } }), '{"z":{"a":2,"b":1}}');
});

Deno.test("the in-process cache separates infer modes and drops stale entries", async () => {
  await withTempDir((root) => {
    const { page, config } = wiki(root);
    const asserted = new RdfGraph();
    asserted.add(
      namedNode("https://e/s"),
      namedNode("https://e/p"),
      literal("asserted"),
    );
    const inferred = new RdfGraph();
    inferred.add(
      namedNode("https://e/s"),
      namedNode("https://e/p"),
      literal("inferred"),
    );

    assertEquals(getProcessGraph(config, false), null);
    setProcessGraph(config, false, asserted);
    setProcessGraph(config, true, inferred);
    assertEquals(getProcessGraph(config, false), asserted);
    assertEquals(getProcessGraph(config, true), inferred);

    clearProcessGraph(config, false);
    assertEquals(getProcessGraph(config, false), null);
    assertEquals(
      getProcessGraph(config, true),
      inferred,
      "the other mode is untouched",
    );

    // Editing the wiki changes the fingerprint, so the old entry is no longer
    // reachable — and setting a new one drops it rather than leaking it.
    Deno.writeTextFileSync(page, "---\ntype: Person\ngivenName: Grace\n---\n");
    assertEquals(getProcessGraph(config, true), null);
    const rebuilt = new RdfGraph();
    setProcessGraph(config, true, rebuilt);
    assertEquals(getProcessGraph(config, true), rebuilt);
    assertEquals(getProcessDataset(config, false), null);
  });
});

Deno.test("a graph survives a disk round trip across a cleared process cache", async () => {
  await withTempDir(async (root) => {
    const { config } = wiki(root);
    const graph = new RdfGraph();
    graph.add(
      namedNode("https://e/s"),
      namedNode("https://e/p"),
      literal("one"),
    );
    graph.add(
      namedNode("https://e/s"),
      namedNode("https://e/p"),
      literal("two"),
    );
    setDiskGraph(config, false, graph);

    const cachePath = diskCachePath(config, false);
    assertEquals(pathExists(cachePath), true);
    assertStringIncludes(cachePath, "graph-asserted-");
    assertEquals(extname(cachePath), ".nt");

    clearAllProcessGraphs();
    const loaded = await getDiskGraph(config, false);
    assertEquals(loaded?.size, 2);
    assertEquals([...loaded!].map((item) => item.object.value).sort(), [
      "one",
      "two",
    ]);
  });
});

Deno.test("the infer and asserted caches do not share a file", async () => {
  await withTempDir(async (root) => {
    const { config } = wiki(root);
    const graph = new RdfGraph();
    setDiskGraph(config, false, graph);
    assertNotEquals(
      diskCachePath(config, false),
      diskCachePath(config, true),
    );
    assertStringIncludes(
      diskCachePath(config, true),
      "graph-infer-",
    );
    assertEquals(await getDiskGraph(config, true), null);
  });
});

Deno.test("writing a new fingerprint removes the old cache file", async () => {
  await withTempDir((root) => {
    const { page, config } = wiki(root);
    const graph = new RdfGraph();
    graph.add(
      namedNode("https://e/s"),
      namedNode("https://e/p"),
      literal("one"),
    );
    setDiskGraph(config, false, graph);
    const stale = diskCachePath(config, false);

    Deno.writeTextFileSync(page, "---\ntype: Person\ngivenName: Grace\n---\n");
    setDiskGraph(config, false, graph);
    const current = diskCachePath(config, false);

    assertNotEquals(current, stale);
    assertEquals(pathExists(current), true);
    assertEquals(pathExists(stale), false);
    // The other mode's files are left alone.
    setDiskGraph(config, true, graph);
    assertEquals(pathExists(diskCachePath(config, true)), true);
    assertEquals(pathExists(current), true);
  });
});

Deno.test("a corrupt cache file is discarded rather than propagated", async () => {
  await withTempDir(async (root) => {
    const { config } = wiki(root);
    const graph = new RdfGraph();
    graph.add(
      namedNode("https://e/s"),
      namedNode("https://e/p"),
      literal("one"),
    );
    setDiskGraph(config, false, graph);
    const cachePath = diskCachePath(config, false);
    Deno.writeTextFileSync(cachePath, "this is not n-triples\n");

    assertEquals(await getDiskGraph(config, false), null);
    assertEquals(
      pathExists(cachePath),
      false,
      "the unreadable cache is removed",
    );
  });
});

Deno.test("a named-graph dataset round-trips through its own cache file", async () => {
  await withTempDir(async (root) => {
    const { config } = wiki(root);
    const dataset = new RdfDataset({ defaultUnion: true });
    const subject = namedNode("https://e/s");
    const predicate = namedNode("https://e/p");
    dataset.graph("https://e/graphs/root").add(
      subject,
      predicate,
      literal("root"),
    );
    dataset.graph("https://e/graphs/source/a").add(
      subject,
      predicate,
      literal("source"),
    );

    setDiskDataset(config, false, dataset);
    const cachePath = datasetCachePath(config, false);
    assertEquals(pathExists(cachePath), true);
    assertStringIncludes(cachePath, "dataset-asserted-");
    assertEquals(extname(cachePath), ".nq");

    const loaded = await getDiskDataset(config, false);
    assertEquals(loaded?.size, 2);
    assertEquals(loaded?.graphNames().sort(), [
      "https://e/graphs/root",
      "https://e/graphs/source/a",
    ]);
    assertEquals([...loaded!].map((item) => item.object.value).sort(), [
      "root",
      "source",
    ]);
    // The graph a quad belongs to survives the round trip.
    const roots = [...loaded!.graph("https://e/graphs/root")];
    assertEquals(roots.length, 1);
    assertEquals(roots[0]!.object.value, "root");
  });
});

Deno.test("a triple added twice is one triple in the cache file", async () => {
  await withTempDir((root) => {
    const { config } = wiki(root);
    const graph = new RdfGraph();
    const item = triple(
      namedNode("https://e/s"),
      namedNode("https://e/p"),
      literal("one"),
    );
    graph.addQuad(item);
    graph.addQuad(item);
    setDiskGraph(config, false, graph);
    const lines = readText(diskCachePath(config, false)).trimEnd().split("\n");
    assertEquals(lines.length, 1);
  });
});

Deno.test("the manifest orders paths by component, not by string", async () => {
  // The oracle settles this one: the sorted recursive path walk compares
  // `_parts_normcase`, so `notes/inner.md` sorts *before* `notes.md` even though
  // `.` precedes the separator in the joined string. It reaches the digest, and
  // a digest that disagrees with the oracle is a cold cache on every run.
  await withTempDir((root) => {
    const wikiDir = join(root, "wiki");
    Deno.mkdirSync(join(wikiDir, "notes"), { recursive: true });
    Deno.writeTextFileSync(
      join(wikiDir, "notes.md"),
      "---\ntype: Thing\n---\n",
    );
    Deno.writeTextFileSync(
      join(wikiDir, "notes", "inner.md"),
      "---\ntype: Thing\n---\n",
    );
    const config = Config.forRoot(root, { wiki: { input: [wikiDir] } });

    assertEquals(
      iterWikiFiles(config).map((path) => config.relativeToRoot(path)),
      ["wiki/notes/inner.md", "wiki/notes.md"],
    );
    assertEquals(
      wikiManifest(config).files.map((entry) => entry.path),
      ["wiki/notes/inner.md", "wiki/notes.md"],
    );

    // Whole-second mtimes, because the oracle records `st_mtime_ns` in
    // nanoseconds and this port derives nanoseconds from a `Date`'s
    // milliseconds: a sub-second mtime would be a difference in the fixture
    // rather than in the code.
    for (
      const file of [
        join(wikiDir, "notes.md"),
        join(wikiDir, "notes", "inner.md"),
      ]
    ) {
      Deno.utimeSync(file, PINNED_MTIME, PINNED_MTIME);
    }

    // The oracle's own digest for exactly this fixture (`wiki_fingerprint` in a
    // `PYTHONPATH=src` probe, Python 3.12.13), which is what makes this a
    // byte-level check of the manifest order, the canonical JSON, and the
    // SHA-256 together rather than of this port against itself.
    assertEquals(
      wikiFingerprint(config),
      "3d673f9c38b503f03baceda746c99ed6cd08642009dc842292b86670e2e22338",
    );
  });
});
