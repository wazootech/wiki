/**
 * `Wiki.edit()` and `wiki edit` — guarded writes (wiki#355, slice 1).
 *
 * The promises under test are the ones an agent relies on to edit without
 * reading the result back: a stale `expect` writes nothing, an edit that
 * breaks the wiki writes nothing, an edit that does not break it is not blocked
 * by unrelated breakage elsewhere, and a commit that fails halfway leaves every
 * file byte-identical to before.
 */

import { dirname, fromFileUrl, join } from "@std/path";
import {
  assert,
  assertEquals,
  assertFalse,
  assertRejects,
  assertThrows,
} from "@std/assert";

import {
  EXIT_CONFLICT,
  EXIT_FAILURE,
  EXIT_OK,
  EXIT_USAGE,
} from "../src/wiki/cli.ts";
import {
  commitFiles,
  contentHash,
  EditUsageError,
  type FilePlan,
} from "../src/wiki/edit.ts";
import { Wiki } from "../src/wiki/wiki.ts";

const CLI_ENTRY = fromFileUrl(new URL("../src/wiki/cli.ts", import.meta.url));
const DECODER = new TextDecoder();

const ARTICLE_SHAPE = `---
'@type': sh:NodeShape
rdfs:label: Article Shape
sh:targetClass: schema:Article
sh:property:
  - sh:path: schema:headline
    sh:minCount: 1
    sh:message: Article must have a headline.
---

# Article Shape
`;

const GOOD = `---
'@type': schema:Article
schema:headline: Good
---

# Good

Links to [Other](Other.md).
`;

const OTHER = `---
'@type': schema:Article
schema:headline: Other
---

# Other
`;

/** Already broken before any edit: no headline. */
const BROKEN = `---
'@type': schema:Article
---

# Broken
`;

function writeWiki(): string {
  const root = Deno.makeTempDirSync({ prefix: "wiki-edit-" });
  const pages: Record<string, string> = {
    "Article_Shape.md": ARTICLE_SHAPE,
    "Good.md": GOOD,
    "Other.md": OTHER,
    "Broken.md": BROKEN,
  };
  Deno.mkdirSync(join(root, "wiki"));
  Deno.writeTextFileSync(join(root, "wiki.yml"), "wiki:\n  input: [wiki]\n");
  for (const [name, content] of Object.entries(pages)) {
    Deno.writeTextFileSync(join(root, "wiki", name), content);
  }
  return root;
}

function cleanup(root: string): void {
  try {
    Deno.removeSync(root, { recursive: true });
  } catch {
    // Windows keeps a handle open long enough to lose this race occasionally.
  }
}

function read(root: string, rel: string): string {
  return Deno.readTextFileSync(join(root, ...rel.split("/")));
}

function exists(root: string, rel: string): boolean {
  try {
    Deno.statSync(join(root, ...rel.split("/")));
    return true;
  } catch {
    return false;
  }
}

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
    const headless = GOOD.replace("schema:headline: Good\n", "");
    const edit = {
      ops: [{
        op: "replace" as const,
        path: "wiki/Good.md",
        content: headless,
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
    assertEquals(read(root, "wiki/Good.md"), headless);
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

Deno.test("ops this version cannot apply are a clear usage error", async () => {
  const root = writeWiki();
  try {
    const wiki = Wiki.load(root);
    const error = await assertRejects(
      () =>
        wiki.edit({
          ops: [{
            op: "move",
            path: "wiki/Good.md",
            from: "wiki/Good.md",
            to: "wiki/Moved.md",
            // deno-lint-ignore no-explicit-any
          } as any],
        }),
      EditUsageError,
    );
    assert(error.message.includes("not yet supported"), error.message);
    await assertRejects(
      // deno-lint-ignore no-explicit-any
      () => wiki.edit({ ops: [{ op: "frobnicate" } as any] }),
      EditUsageError,
    );
    await assertRejects(() => wiki.edit({ ops: [] }), EditUsageError);
  } finally {
    cleanup(root);
  }
});

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

async function runEdit(
  root: string,
  args: readonly string[],
  stdin: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const child = new Deno.Command(Deno.execPath(), {
    args: ["run", "--quiet", "--allow-all", CLI_ENTRY, "edit", ...args],
    cwd: root,
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  const writer = child.stdin.getWriter();
  await writer.write(new TextEncoder().encode(stdin));
  await writer.close();
  const { code, stdout, stderr } = await child.output();
  return {
    code,
    stdout: DECODER.decode(stdout),
    stderr: DECODER.decode(stderr),
  };
}

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
          content: GOOD.replace("schema:headline: Good\n", ""),
        }],
      });
      assertEquals(
        (await runEdit(root, ["--apply"], breaking)).code,
        EXIT_FAILURE,
      );
      assertEquals(read(root, "wiki/Good.md"), GOOD);

      assertEquals((await runEdit(root, [], "not json")).code, EXIT_USAGE);
      const unsupported = JSON.stringify({
        ops: [{ op: "move", from: "wiki/Good.md", to: "wiki/G.md" }],
      });
      const usage = await runEdit(root, [], unsupported);
      assertEquals(usage.code, EXIT_USAGE);
      assert(usage.stderr.includes("not yet supported"), usage.stderr);

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
