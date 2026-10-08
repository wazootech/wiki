import { assertEquals, assertThrows } from "@std/assert";
import { join, relative } from "@std/path";
import {
  isDirectory,
  isFile,
  isSymlink,
  pathExists,
  readText,
  relativeWithin,
  sortedTreePaths,
  sortPaths,
  walkTree,
} from "../src/wiki/fspath.ts";
import { ValueError } from "../src/wiki/errors.ts";
import { symlinksUnavailable } from "./support/symlink_support.ts";

Deno.test({
  name: "path helpers read BOM-tolerant text and check symlinks",
  // Needs SeCreateSymbolicLinkPrivilege, which a Windows host only grants to
  // Administrators or processes in Developer Mode. Skipped, not passed, where
  // the OS refuses the symlink.
  ignore: symlinksUnavailable(),
  fn: () => {
    const root = Deno.makeTempDirSync({ prefix: "wiki-fspath-" });
    const outside = Deno.makeTempDirSync({ prefix: "wiki-fspath-outside-" });
    try {
      const text = join(root, "text.md");
      const dotDotName = join(root, "..notes.md");
      const target = join(outside, "target.md");
      const link = join(root, "link.md");
      Deno.writeTextFileSync(text, "\uFEFF# Page\n");
      Deno.writeTextFileSync(dotDotName, "# Notes\n");
      Deno.writeTextFileSync(target, "# Outside\n");
      Deno.symlinkSync(target, link);

      assertEquals(readText(text), "# Page\n");
      assertEquals(pathExists(link), true);
      assertEquals(isSymlink(link), true);
      assertEquals(isFile(link), true);
      assertEquals(isDirectory(link), false);
      assertEquals(relativeWithin(dotDotName, root), "..notes.md");
      assertThrows(() => relativeWithin(link, root), ValueError);
    } finally {
      Deno.removeSync(root, { recursive: true });
      Deno.removeSync(outside, { recursive: true });
    }
  },
});

Deno.test("path sorting uses string order and traversal stays in-tree", () => {
  assertEquals(
    sortPaths(["notes.md", "notes/inner.md", "notes"]),
    ["notes", "notes.md", "notes/inner.md"],
  );

  const root = Deno.makeTempDirSync({ prefix: "wiki-fspath-walk-" });
  try {
    Deno.mkdirSync(join(root, "notes"));
    Deno.writeTextFileSync(join(root, "notes.md"), "# Note\n");
    Deno.writeTextFileSync(join(root, "notes", "inner.md"), "# Inner\n");
    assertEquals(
      sortedTreePaths(root).map((path) => relative(root, path)),
      ["notes", "notes.md", join("notes", "inner.md")],
    );
  } finally {
    Deno.removeSync(root, { recursive: true });
  }
});

Deno.test({
  name: "walkTree never follows or lists symlinks",
  ignore: symlinksUnavailable(),
  fn: () => {
    const root = Deno.makeTempDirSync({ prefix: "wiki-fspath-walklink-" });
    const outside = Deno.makeTempDirSync({ prefix: "wiki-fspath-walkout-" });
    try {
      Deno.writeTextFileSync(join(root, "real.md"), "# Real\n");
      Deno.mkdirSync(join(root, "realdir"));
      Deno.writeTextFileSync(join(root, "realdir", "inner.md"), "# Inner\n");
      Deno.writeTextFileSync(join(outside, "secret.md"), "# Secret\n");
      // A symlink to a file outside the tree, one to a directory outside it,
      // and one looping back inside: none may be followed or listed, so a
      // symlinked wiki input can neither leak outside files into the build
      // nor let `fmt`/`render` write through the link.
      Deno.symlinkSync(join(outside, "secret.md"), join(root, "evil.md"));
      Deno.symlinkSync(outside, join(root, "evildir"));
      Deno.symlinkSync(join(root, "realdir"), join(root, "loop"));

      const rel = walkTree(root).map((path) => relative(root, path)).sort();
      assertEquals(rel, ["real.md", "realdir", join("realdir", "inner.md")]);
    } finally {
      Deno.removeSync(root, { recursive: true });
      Deno.removeSync(outside, { recursive: true });
    }
  },
});
