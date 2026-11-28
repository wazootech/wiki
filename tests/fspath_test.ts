import * as sys from "../src/wiki/sys.ts";
import { test } from "node:test";
import { assertEquals, assertThrows } from "@std/assert";
import { join, relative } from "@std/path";
import {
  activeOverlay,
  fileStat,
  isDirectory,
  isFile,
  isSymlink,
  overlayKey,
  pathExists,
  readText,
  relativeWithin,
  sortedTreePaths,
  sortPaths,
  walkTree,
  withOverlay,
} from "../src/wiki/fspath.ts";
import { ValueError } from "../src/wiki/errors.ts";
import { symlinksUnavailable } from "./support/symlink_support.ts";

// Needs SeCreateSymbolicLinkPrivilege, which a Windows host only grants to
// Administrators or processes in Developer Mode. Skipped, not passed, where
// the OS refuses the symlink.
test(
  "path helpers read BOM-tolerant text and check symlinks",
  {
    skip: symlinksUnavailable(),
  },
  () => {
    const root = sys.makeTempDirSync({ prefix: "wiki-fspath-" });
    const outside = sys.makeTempDirSync({ prefix: "wiki-fspath-outside-" });
    try {
      const text = join(root, "text.md");
      const dotDotName = join(root, "..notes.md");
      const target = join(outside, "target.md");
      const link = join(root, "link.md");
      sys.writeTextFileSync(text, "\uFEFF# Page\n");
      sys.writeTextFileSync(dotDotName, "# Notes\n");
      sys.writeTextFileSync(target, "# Outside\n");
      sys.symlinkSync(target, link);

      assertEquals(readText(text), "# Page\n");
      assertEquals(pathExists(link), true);
      assertEquals(isSymlink(link), true);
      assertEquals(isFile(link), true);
      assertEquals(isDirectory(link), false);
      assertEquals(relativeWithin(dotDotName, root), "..notes.md");
      assertThrows(() => relativeWithin(link, root), ValueError);
    } finally {
      sys.removeSync(root, { recursive: true });
      sys.removeSync(outside, { recursive: true });
    }
  },
);

test("path sorting uses string order and traversal stays in-tree", () => {
  assertEquals(sortPaths(["notes.md", "notes/inner.md", "notes"]), [
    "notes",
    "notes.md",
    "notes/inner.md",
  ]);

  const root = sys.makeTempDirSync({ prefix: "wiki-fspath-walk-" });
  try {
    sys.mkdirSync(join(root, "notes"));
    sys.writeTextFileSync(join(root, "notes.md"), "# Note\n");
    sys.writeTextFileSync(join(root, "notes", "inner.md"), "# Inner\n");
    assertEquals(
      sortedTreePaths(root).map((path) => relative(root, path)),
      ["notes", "notes.md", join("notes", "inner.md")],
    );
  } finally {
    sys.removeSync(root, { recursive: true });
  }
});

test(
  "walkTree never follows or lists symlinks",
  {
    skip: symlinksUnavailable(),
  },
  () => {
    const root = sys.makeTempDirSync({ prefix: "wiki-fspath-walklink-" });
    const outside = sys.makeTempDirSync({ prefix: "wiki-fspath-walkout-" });
    try {
      sys.writeTextFileSync(join(root, "real.md"), "# Real\n");
      sys.mkdirSync(join(root, "realdir"));
      sys.writeTextFileSync(join(root, "realdir", "inner.md"), "# Inner\n");
      sys.writeTextFileSync(join(outside, "secret.md"), "# Secret\n");
      // A symlink to a file outside the tree, one to a directory outside it,
      // and one looping back inside: none may be followed or listed, so a
      // symlinked wiki input can neither leak outside files into the build
      // nor let `fmt`/`render` write through the link.
      sys.symlinkSync(join(outside, "secret.md"), join(root, "evil.md"));
      sys.symlinkSync(outside, join(root, "evildir"));
      sys.symlinkSync(join(root, "realdir"), join(root, "loop"));

      const rel = walkTree(root)
        .map((path) => relative(root, path))
        .sort();
      assertEquals(rel, ["real.md", "realdir", join("realdir", "inner.md")]);
    } finally {
      sys.removeSync(root, { recursive: true });
      sys.removeSync(outside, { recursive: true });
    }
  },
);

test("an overlay stages creates, edits, and deletes for every read", async () => {
  const root = sys.makeTempDirSync({ prefix: "wiki-overlay-" });
  try {
    const kept = join(root, "kept.md");
    const gone = join(root, "gone.md");
    sys.writeTextFileSync(kept, "old");
    sys.writeTextFileSync(gone, "bye");
    const created = join(root, "new", "deep", "page.md");
    const overlay = {
      id: "o1",
      files: new Map<string, string | null>([
        [overlayKey(kept), "new text"],
        [overlayKey(gone), null],
        [overlayKey(created), "hello"],
      ]),
    };

    await withOverlay(overlay, async () => {
      // Survives an await: AsyncLocalStorage carries the overlay through.
      await Promise.resolve();
      assertEquals(activeOverlay()?.id, "o1");
      assertEquals(readText(kept), "new text");
      assertThrows(() => readText(gone), sys.errors.NotFound);
      assertEquals(pathExists(gone), false);
      assertEquals(isFile(created), true);
      assertEquals(isDirectory(join(root, "new")), true);
      assertEquals(isDirectory(created), false);
      assertEquals(fileStat(created).size, 5);
      assertEquals(
        walkTree(root).map((path) => relative(root, path)),
        sortPaths([
          "kept.md",
          "new",
          join("new", "deep"),
          join("new", "deep", "page.md"),
        ]),
      );
    });

    // Outside the overlay, the disk is untouched and authoritative.
    assertEquals(activeOverlay(), undefined);
    assertEquals(readText(kept), "old");
    assertEquals(isFile(created), false);
    assertEquals(
      walkTree(root).map((path) => relative(root, path)),
      ["gone.md", "kept.md"],
    );
  } finally {
    sys.removeSync(root, { recursive: true });
  }
});
