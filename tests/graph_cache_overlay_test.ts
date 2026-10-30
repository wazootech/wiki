import { join } from "@std/path";
import { overlayKey, readText, withOverlay } from "../src/wiki/fspath.ts";
import { assertEquals, assertNotEquals } from "@std/assert";
import { Config } from "../src/wiki/config.ts";
import {
  iterWikiFiles,
  wikiFingerprint,
  wikiManifest,
} from "../src/wiki/graph_cache.ts";
import { PINNED_MTIME, wiki, withTempDir } from "./graph_cache_support.ts";

Deno.test("the manifest orders paths by standard string order", async () => {
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
      ["wiki/notes.md", "wiki/notes/inner.md"],
    );
    assertEquals(
      wikiManifest(config).files.map((entry) => entry.path),
      ["wiki/notes.md", "wiki/notes/inner.md"],
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

    // This pins the Deno manifest order, canonical JSON, and SHA-256 together.
    // The manifest includes VERSION, so a version bump changes this hash.
    assertEquals(
      wikiFingerprint(config),
      "fa71b23d2dc65ab36c86015e445e74b4abee2a17b0e8a6689fbb59e2fdecb41c",
    );
  });
});

Deno.test("an edit overlay gets its own fingerprint and sees staged files", async () => {
  await withTempDir((root) => {
    const { wikiDir, page, config } = wiki(root);
    const onDisk = wikiFingerprint(config);
    const created = join(wikiDir, "staged.md");
    const overlay = {
      id: "test-overlay",
      files: new Map<string, string | null>([
        [overlayKey(created), "---\ntype: Person\n---\n"],
      ]),
    };
    // Before the fix this threw NotFound: the manifest stat'ed every listed
    // file on disk, and a staged page has no file yet.
    const staged = withOverlay(overlay, () => wikiFingerprint(config));
    assertNotEquals(staged, onDisk);
    // Same staged tree under a different overlay id must not share a key, or
    // the in-process cache could serve one edit's graph to another.
    const again = withOverlay(
      { ...overlay, id: "other-overlay" },
      () => wikiFingerprint(config),
    );
    assertNotEquals(again, staged);
    assertEquals(wikiFingerprint(config), onDisk);
    assertEquals(readText(page), "---\ntype: Person\ngivenName: Ada\n---\n");
  });
});
