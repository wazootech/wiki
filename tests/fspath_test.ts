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
  sortPathsByComponent,
} from "../src/wiki/fspath.ts";
import { ValueError } from "../src/wiki/errors.ts";

Deno.test("path helpers read BOM-tolerant text and check symlinks", () => {
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
});

Deno.test("path sorting compares components and traversal stays in-tree", () => {
  assertEquals(
    sortPathsByComponent(["notes.md", "notes/inner.md", "notes"]),
    ["notes", "notes/inner.md", "notes.md"],
  );

  const root = Deno.makeTempDirSync({ prefix: "wiki-fspath-walk-" });
  try {
    Deno.mkdirSync(join(root, "notes"));
    Deno.writeTextFileSync(join(root, "notes.md"), "# Note\n");
    Deno.writeTextFileSync(join(root, "notes", "inner.md"), "# Inner\n");
    assertEquals(
      sortedTreePaths(root).map((path) => relative(root, path)),
      ["notes", join("notes", "inner.md"), "notes.md"],
    );
  } finally {
    Deno.removeSync(root, { recursive: true });
  }
});
