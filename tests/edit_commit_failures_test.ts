import { dirname, join } from "@std/path";
import { assert, assertEquals, assertFalse, assertThrows } from "@std/assert";
import {
  EXIT_CONFLICT,
  EXIT_FAILURE,
  EXIT_OK,
  EXIT_USAGE,
} from "../src/wiki/cli.ts";
import { commitFiles, contentHash, type FilePlan } from "../src/wiki/edit.ts";
import {
  cleanup,
  exists,
  GOOD,
  HEADLESS,
  OTHER,
  read,
  runEdit,
  writeWiki,
} from "./edit_support.ts";

Deno.test("a commit that fails midway restores every file byte for byte", () => {
  const root = Deno.makeTempDirSync({ prefix: "wiki-edit-commit-" });
  try {
    const a = join(root, "A.md");
    const b = join(root, "B.md");
    const c = join(root, "C.md");
    // A BOM and CRLFs, so a text round-trip would show up as a diff.
    const original = new TextEncoder().encode("﻿# A\r\n\r\nBody\r\n");
    Deno.writeFileSync(a, original);
    Deno.writeFileSync(c, new TextEncoder().encode("# C\n"));
    const plans: FilePlan[] = [
      { path: a, before: original, after: "# A changed\n" },
      { path: b, before: null, after: "# B\n" },
      { path: c, before: new TextEncoder().encode("# C\n"), after: null },
    ];
    let renames = 0;
    assertThrows(() =>
      commitFiles(plans, {
        writeFile: (path, data) => Deno.writeFileSync(path, data),
        mkdir: (path) => Deno.mkdirSync(path, { recursive: true }),
        remove: (path) => Deno.removeSync(path),
        rename: (from, to) => {
          if (++renames === 2) throw new Error("disk full");
          Deno.renameSync(from, to);
        },
      })
    );
    assertEquals(Deno.readFileSync(a), original);
    assertFalse(exists(root, "B.md"));
    assertEquals(Deno.readTextFileSync(c), "# C\n");
    assertEquals(
      [...Deno.readDirSync(root)].map((entry) => entry.name).sort(),
      ["A.md", "C.md"],
    );
  } finally {
    cleanup(root);
  }
});

Deno.test("a failed commit removes the directories it created", () => {
  const root = Deno.makeTempDirSync({ prefix: "wiki-edit-dirs-" });
  try {
    const nested = join(root, "new", "deep", "Page.md");
    const sibling = join(root, "Top.md");
    const plans: FilePlan[] = [
      { path: nested, before: null, after: "# Page\n" },
      { path: sibling, before: null, after: "# Top\n" },
    ];
    let renames = 0;
    assertThrows(() =>
      commitFiles(plans, {
        writeFile: (path, data) => Deno.writeFileSync(path, data),
        mkdir: (path) => Deno.mkdirSync(path, { recursive: true }),
        remove: (path) => Deno.removeSync(path),
        rename: (from, to) => {
          if (++renames === 2) throw new Error("disk full");
          Deno.renameSync(from, to);
        },
      })
    );
    assertEquals([...Deno.readDirSync(root)].map((entry) => entry.name), []);
  } finally {
    cleanup(root);
  }
});

Deno.test(
  "wiki edit maps statuses to exit codes and prints JSON on stdout",
  { permissions: { run: true, read: true, write: true } },
  async () => {
    const root = writeWiki();
    try {
      const valid = JSON.stringify({
        ops: [{ op: "replace", path: "wiki/Other.md", content: OTHER + "\n" }],
      });
      const dry = await runEdit(root, ["--json"], valid);
      assertEquals(dry.code, EXIT_OK, dry.stderr);
      assertEquals(JSON.parse(dry.stdout).status, "dry_run");
      assertEquals(read(root, "wiki/Other.md"), OTHER);

      const stale = JSON.stringify({
        ops: [{
          op: "replace",
          path: "wiki/Other.md",
          content: "x",
          expect: contentHash("nope"),
        }],
      });
      assertEquals((await runEdit(root, [], stale)).code, EXIT_CONFLICT);

      const breaking = JSON.stringify({
        ops: [{
          op: "replace",
          path: "wiki/Good.md",
          content: HEADLESS,
        }],
      });
      assertEquals(
        (await runEdit(root, ["--apply"], breaking)).code,
        EXIT_FAILURE,
      );
      assertEquals(read(root, "wiki/Good.md"), GOOD);

      assertEquals((await runEdit(root, [], "not json")).code, EXIT_USAGE);
      const malformed = JSON.stringify({
        ops: [{ op: "move", from: "wiki/Good.md" }],
      });
      const usage = await runEdit(root, [], malformed);
      assertEquals(usage.code, EXIT_USAGE);
      assert(usage.stderr.includes("ops[0].to"), usage.stderr);

      const applied = await runEdit(root, ["--apply"], valid);
      assertEquals(applied.code, EXIT_OK, applied.stderr);
      assertEquals(read(root, "wiki/Other.md"), OTHER + "\n");
    } finally {
      cleanup(root);
    }
  },
);

Deno.test(
  "wiki edit --from reads a plan file",
  { permissions: { run: true, read: true, write: true } },
  async () => {
    const root = writeWiki();
    try {
      const plan = join(root, "plan.json");
      Deno.writeTextFileSync(
        plan,
        JSON.stringify({ ops: [{ op: "delete", path: "wiki/Broken.md" }] }),
      );
      const result = await runEdit(root, ["--from", plan, "--apply"], "");
      assertEquals(result.code, EXIT_OK, result.stderr);
      assertFalse(exists(root, "wiki/Broken.md"));
      assert(dirname(plan) === root);
    } finally {
      cleanup(root);
    }
  },
);
