/**
 * `Wiki.edit()` and `wiki edit` — guarded writes (wiki#355, slice 1).
 *
 * The promises under test are the ones an agent relies on to edit without
 * reading the result back: a stale `expect` writes nothing, an edit that
 * breaks the wiki writes nothing, an edit that does not break it is not blocked
 * by unrelated breakage elsewhere, and a commit that fails halfway leaves every
 * file byte-identical to before.
 */

import { join } from "@std/path";
import { assert, assertEquals, assertFalse, assertRejects } from "@std/assert";
import { contentHash, EditUsageError } from "../src/wiki/edit.ts";
import { Wiki } from "../src/wiki/wiki.ts";
import {
  BROKEN,
  cleanup,
  type EditOpInput,
  exists,
  GOOD,
  HEADLESS,
  OTHER,
  read,
  writeWiki,
} from "./edit_support.ts";

Deno.test("a dry run validates and reports without writing", async () => {
  const root = writeWiki();
  try {
    const wiki = Wiki.load(root);
    const content = GOOD.replace("# Good\n", "# Good\n\nMore prose.\n");
    const report = await wiki.edit({
      ops: [{
        op: "replace",
        path: "wiki/Good.md",
        content,
        expect: contentHash(GOOD),
      }],
    });
    assertEquals(report.status, "dry_run");
    assert(report.ok);
    assertEquals(report.files, [{
      path: "wiki/Good.md",
      action: "modify",
      before: contentHash(GOOD),
      after: contentHash(content),
    }]);
    assertEquals(read(root, "wiki/Good.md"), GOOD);
  } finally {
    cleanup(root);
  }
});

Deno.test("apply writes the edit and reports the next expect hash", async () => {
  const root = writeWiki();
  try {
    const wiki = Wiki.load(root);
    const page = OTHER.replaceAll("Other", "New_Page");
    const report = await wiki.edit({
      ops: [{
        op: "create",
        path: "wiki/New_Page.md",
        content: page,
        expect: "absent",
      }],
    }, { apply: true });
    assertEquals(report.status, "applied");
    assertEquals(read(root, "wiki/New_Page.md"), page);
    assertEquals(report.files[0]!.after, contentHash(page));
  } finally {
    cleanup(root);
  }
});

Deno.test("a stale expect is a conflict and writes nothing", async () => {
  const root = writeWiki();
  try {
    const wiki = Wiki.load(root);
    const report = await wiki.edit({
      ops: [
        {
          op: "replace",
          path: "wiki/Good.md",
          content: GOOD + "\nChanged.\n",
          expect: contentHash("something else"),
        },
        {
          op: "create",
          path: "wiki/Other.md",
          content: OTHER,
          expect: "absent",
        },
      ],
    }, { apply: true });
    assertEquals(report.status, "conflict");
    assertFalse(report.ok);
    assertEquals(report.conflicts.map((c) => c.path), [
      "wiki/Good.md",
      "wiki/Other.md",
    ]);
    assertEquals(report.conflicts[0]!.actual, contentHash(GOOD));
    assertEquals(read(root, "wiki/Good.md"), GOOD);
  } finally {
    cleanup(root);
  }
});

Deno.test("an edit that introduces an error is rejected unless forced", async () => {
  const root = writeWiki();
  try {
    const wiki = Wiki.load(root);
    const edit = {
      ops: [{
        op: "replace" as const,
        path: "wiki/Good.md",
        content: HEADLESS,
      }],
    };

    const rejected = await wiki.edit(edit, { apply: true });
    assertEquals(rejected.status, "rejected");
    assert(
      rejected.introduced.some((issue) =>
        issue.code === "shacl_violation" && issue.severity === "error"
      ),
      JSON.stringify(rejected.introduced),
    );
    // Broken.md's pre-existing violation is not the edit's fault.
    assertFalse(
      rejected.introduced.some((issue) => issue.message.includes("Broken")),
    );
    assertEquals(read(root, "wiki/Good.md"), GOOD);
    assert(rejected.check !== null);

    const forced = await wiki.edit(edit, { apply: true, force: true });
    assertEquals(forced.status, "applied");
    assertEquals(read(root, "wiki/Good.md"), HEADLESS);
  } finally {
    cleanup(root);
  }
});

Deno.test("an H1 satisfies a shape that requires schema:headline", async () => {
  const root = writeWiki();
  try {
    const wiki = Wiki.load(root);
    // The frontmatter key goes, the `# Good` H1 stays: the graph derives the
    // headline from it (wiki#318), so the shape is still met.
    const content = GOOD.replace("schema:headline: Good\n", "");
    const report = await wiki.edit({
      ops: [{ op: "replace", path: "wiki/Good.md", content }],
    }, { apply: true });
    assertEquals(report.status, "applied", JSON.stringify(report.introduced));
    assertEquals(read(root, "wiki/Good.md"), content);
  } finally {
    cleanup(root);
  }
});

Deno.test("pre-existing errors elsewhere do not block an edit", async () => {
  const root = writeWiki();
  try {
    const wiki = Wiki.load(root);
    assertFalse((await wiki.check()).ok, "fixture should start broken");
    const report = await wiki.edit({
      ops: [{
        op: "replace",
        path: "wiki/Other.md",
        content: OTHER + "\nMore.\n",
      }],
    }, { apply: true });
    assertEquals(report.status, "applied");
    assertEquals(report.introduced, []);
  } finally {
    cleanup(root);
  }
});

Deno.test("a create does not introduce pre-existing wiki-wide lint findings", async () => {
  const root = writeWiki();
  try {
    // A configured asset path that is a file, not a directory: a path-less lint
    // warning that is there before the edit and after it.
    Deno.writeTextFileSync(join(root, "not_a_dir"), "");
    Deno.writeTextFileSync(
      join(root, "wiki.yml"),
      "wiki:\n  input: [wiki]\n  assets: [not_a_dir]\n",
    );
    const wiki = Wiki.load(root);
    const lint = await wiki.lint();
    assert(
      lint.warnings.some((issue) =>
        issue.message.includes("Asset directory is not a directory")
      ),
      JSON.stringify(lint.warnings),
    );
    const report = await wiki.edit({
      ops: [{
        op: "create",
        path: "wiki/Fresh.md",
        content: OTHER.replaceAll("Other", "Fresh"),
      }],
    });
    assertEquals(report.status, "dry_run");
    assertEquals(report.introduced, [], JSON.stringify(report.introduced));
  } finally {
    cleanup(root);
  }
});

Deno.test("editing an already-broken page is not blocked by its old error", async () => {
  const root = writeWiki();
  try {
    const wiki = Wiki.load(root);
    const report = await wiki.edit({
      ops: [{
        op: "replace",
        path: "wiki/Broken.md",
        content: BROKEN + "\nStill no headline.\n",
      }],
    });
    assertEquals(report.status, "dry_run");
  } finally {
    cleanup(root);
  }
});

Deno.test("a create that collides with an existing route is rejected", async () => {
  const root = writeWiki();
  try {
    const wiki = Wiki.load(root);
    const report = await wiki.edit({
      ops: [{
        op: "create",
        path: "wiki/Good/index.md",
        content: OTHER.replaceAll("Other", "Good"),
      }],
    }, { apply: true });
    assertEquals(report.status, "rejected");
    assert(
      report.introduced.some((issue) => issue.code === "output_collision"),
      JSON.stringify(report.introduced),
    );
    assertFalse(exists(root, "wiki/Good"));
  } finally {
    cleanup(root);
  }
});

Deno.test("delete removes the file and reports it", async () => {
  const root = writeWiki();
  try {
    const wiki = Wiki.load(root);
    const report = await wiki.edit({
      ops: [{ op: "delete", path: "wiki/Broken.md" }],
    }, { apply: true });
    assertEquals(report.status, "applied");
    assertEquals(report.files[0]!.action, "delete");
    assertEquals(report.files[0]!.after, null);
    assertFalse(exists(root, "wiki/Broken.md"));
  } finally {
    cleanup(root);
  }
});

Deno.test("edits are confined to wiki documents under wiki.input", async () => {
  const root = writeWiki();
  try {
    const wiki = Wiki.load(root);
    for (
      const path of [
        "notes/Outside.md",
        "../Escape.md",
        ".wiki/sources/x/repo/Page.md",
        "wiki/script.sh",
      ]
    ) {
      await assertRejects(
        () => wiki.edit({ ops: [{ op: "create", path, content: "x" }] }),
        EditUsageError,
      );
    }
  } finally {
    cleanup(root);
  }
});

Deno.test("malformed ops are a clear usage error", async () => {
  const root = writeWiki();
  try {
    const wiki = Wiki.load(root);
    const error = await assertRejects(
      () =>
        wiki.edit({
          ops: [{ op: "move", from: "wiki/Good.md" } as unknown as EditOpInput],
        }),
      EditUsageError,
    );
    assert(error.message.includes("ops[0].to"), error.message);
    await assertRejects(
      () =>
        wiki.edit({ ops: [{ op: "frobnicate" } as unknown as EditOpInput] }),
      EditUsageError,
    );
    await assertRejects(() => wiki.edit({ ops: [] }), EditUsageError);
  } finally {
    cleanup(root);
  }
});
