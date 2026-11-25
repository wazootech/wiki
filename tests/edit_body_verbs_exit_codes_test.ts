import { join } from "@std/path";
import { assert, assertEquals } from "@std/assert";
import {
  EXIT_CONFLICT,
  EXIT_FAILURE,
  EXIT_OK,
  EXIT_USAGE,
} from "../src/wiki/cli.ts";
import { contentHash } from "../src/wiki/edit.ts";
import { Wiki } from "../src/wiki/wiki.ts";
import {
  ARTICLE_SHAPE,
  cleanup,
  HISTORY,
  LEDGER,
  PAGE,
  patchLog,
  read,
  runCli,
  writeWiki,
} from "./edit_body_verbs_support.ts";

Deno.test(
  "wiki new, set, and patch map statuses to exit codes",
  { permissions: { run: true, read: true, write: true } },
  async () => {
    const root = writeWiki();
    try {
      // Missing schema:price: rejected, the report names it, nothing written.
      const missing = await runCli(root, [
        "file",
        "new",
        "wiki/",
        "--type",
        "schema:Purchase",
        "--set",
        "schema:name=Neon plan",
        "--set",
        "schema:priceCurrency=USD",
        "--apply",
        "--json",
      ]);
      assertEquals(missing.code, EXIT_FAILURE, missing.stderr);
      assertEquals(JSON.parse(missing.stdout).missing, ["schema:price"]);
      assert(missing.stderr.includes("missing required fields: schema:price"));

      const created = await runCli(root, [
        "file",
        "new",
        "wiki/",
        "--type",
        "schema:Purchase",
        "--set",
        "schema:name=Neon plan",
        "--set",
        "schema:price=5.00",
        "--set",
        "schema:priceCurrency=USD",
        "--apply",
      ]);
      assertEquals(created.code, EXIT_OK, created.stderr);
      assert(read(root, "wiki/Neon_plan.md").includes("schema:price: 5.00\n"));

      const again = await runCli(root, [
        "file",
        "new",
        "wiki/Neon_plan.md",
        "--set",
        "schema:name=x",
      ]);
      assertEquals(again.code, EXIT_CONFLICT, again.stderr);

      const stale = await runCli(root, [
        "file",
        "set",
        PAGE,
        "schema:price",
        "1.00",
        "--expect",
        contentHash("not the file"),
        "--apply",
      ]);
      assertEquals(stale.code, EXIT_CONFLICT, stale.stderr);
      assertEquals(read(root, PAGE), LEDGER);

      const set = await runCli(root, [
        "file",
        "set",
        PAGE,
        "schema:price",
        "1.00",
        "--expect",
        contentHash(LEDGER),
        "--apply",
      ]);
      assertEquals(set.code, EXIT_OK, set.stderr);
      assert(read(root, PAGE).includes("schema:price: 1.00\n"));

      const patched = await runCli(
        root,
        ["file", "patch", PAGE, "--heading", "Notes", "--append", "--apply"],
        "From stdin.\n",
      );
      assertEquals(patched.code, EXIT_OK, patched.stderr);
      assert(read(root, PAGE).endsWith("Nested.\n\nFrom stdin.\n"));

      const twoModes = await runCli(root, [
        "file",
        "patch",
        PAGE,
        "--body",
        "--append",
        "--prepend",
        "--content",
        "x",
      ]);
      assertEquals(twoModes.code, EXIT_USAGE);
      const ambiguous = await runCli(root, [
        "file",
        "patch",
        PAGE,
        "--heading",
        "Change log",
        "--append",
        "--content",
        "x",
      ]);
      assertEquals(ambiguous.code, EXIT_USAGE);
      assertEquals(
        (await runCli(root, ["file", "set", PAGE])).code,
        EXIT_USAGE,
      );
      assertEquals(
        (await runCli(root, ["file", "new", "--help"])).code,
        EXIT_OK,
      );
    } finally {
      cleanup(root);
    }
  },
);

Deno.test("an unformatted page is not reformatted by an unrelated set", async () => {
  // Two blank lines before the H1: `wiki fmt` would collapse them.
  const messy = LEDGER.replace("---\n\n# DeepSeek", "---\n\n\n# DeepSeek");
  const root = writeWiki({ "DeepSeek_(payment).md": messy });
  try {
    const wiki = Wiki.load(root);
    const report = await wiki.edit({
      ops: [{ op: "set", path: PAGE, field: "schema:price", yaml: "2.00" }],
    }, { apply: true });
    assertEquals(report.status, "applied");
    assertEquals(read(root, PAGE), messy.replace("12.00", "2.00"));
  } finally {
    cleanup(root);
  }
});

Deno.test("patch keeps a list tight when appending an item to it", async () => {
  assertEquals(
    await patchLog("append", "- 2026-10-10 — Test entry.\n"),
    HISTORY.replace(
      "- 2026-09-15 — Tightened.\n",
      "- 2026-09-15 — Tightened.\n- 2026-10-10 — Test entry.\n",
    ),
  );
});

Deno.test("patch keeps a list tight when prepending an item to it", async () => {
  assertEquals(
    await patchLog("prepend", "- 2026-09-01 — Drafted."),
    HISTORY.replace(
      "## Log\n\n- 2026-09-14",
      "## Log\n\n- 2026-09-01 — Drafted.\n- 2026-09-14",
    ),
  );
});

Deno.test("patch separates blocks that are not items of the same list", async () => {
  // A paragraph after a list, and an ordered item after `-` items (a new list in
  // CommonMark), both keep the blank line.
  assertEquals(
    await patchLog("append", "Done."),
    HISTORY.replace(
      "- 2026-09-15 — Tightened.\n",
      "- 2026-09-15 — Tightened.\n\nDone.\n",
    ),
  );
  assertEquals(
    await patchLog("append", "1. First."),
    HISTORY.replace(
      "- 2026-09-15 — Tightened.\n",
      "- 2026-09-15 — Tightened.\n\n1. First.\n",
    ),
  );
});

Deno.test(
  "file new leaves a headline out of the frontmatter when the H1 supplies it (#402)",
  { permissions: { run: true, read: true, write: true } },
  async () => {
    const root = writeWiki({ "ArticleShape.md": ARTICLE_SHAPE });
    try {
      for (
        const key of ["headline", "schema:headline"]
      ) {
        const created = await runCli(root, [
          "file",
          "new",
          "wiki/",
          "--type",
          "schema:Article",
          "--set",
          `${key}=Scaffold Probe`,
          "--set",
          "description=probe",
          "--apply",
        ]);
        assertEquals(created.code, EXIT_OK, created.stderr);
        const page = read(root, "wiki/Scaffold_Probe.md");
        assert(page.includes("\n# Scaffold Probe\n"), page);
        assert(!page.includes("headline:"), page);
        assert(page.includes("description: probe\n"), page);
        // The fixture's ledger page already fails its shape; only the
        // scaffolded page is under test.
        const check = await Wiki.load(root).check();
        const probe = JSON.stringify(check.errors).includes("Scaffold_Probe");
        assert(!probe, JSON.stringify(check.errors));
        const lint = await runCli(root, ["lint", "--strict"]);
        assert(!lint.stderr.includes("repeats the derived"), lint.stderr);
        Deno.removeSync(join(root, "wiki", "Scaffold_Probe.md"));
      }
    } finally {
      cleanup(root);
    }
  },
);

Deno.test(
  "file new keeps name, and a headline that differs from the H1 (#402)",
  { permissions: { run: true, read: true, write: true } },
  async () => {
    const root = writeWiki();
    try {
      const named = await runCli(root, [
        "file",
        "new",
        "wiki/",
        "--set",
        "name=Plain Name",
        "--apply",
      ]);
      assertEquals(named.code, EXIT_OK, named.stderr);
      assert(read(root, "wiki/Plain_Name.md").includes("name: Plain Name\n"));

      // `name` outranks nothing here: headline is the first title key, so a
      // second headline-spelled key that differs from it is a real statement.
      const differs = await runCli(root, [
        "file",
        "new",
        "wiki/",
        "--set",
        "headline=First",
        "--set",
        "schema:headline=Second",
        "--apply",
      ]);
      assertEquals(differs.code, EXIT_OK, differs.stderr);
      const page = read(root, "wiki/First.md");
      assert(page.includes("\n# First\n"), page);
      assert(page.includes("schema:headline: Second\n"), page);
      assert(!page.includes("\nheadline:"), page);
    } finally {
      cleanup(root);
    }
  },
);
