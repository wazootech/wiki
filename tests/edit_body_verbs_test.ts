/**
 * `set`, `patch`, and typed `create` — and their verbs `wiki set`, `wiki
 * patch`, and `wiki new` (wiki#355, slice 3).
 *
 * The promise under test is fidelity: an edit changes what it names and leaves
 * every other byte alone (comments, key order, `12.00`, line endings, a page's
 * own formatting), and a new page is honest about what its type requires.
 */

import { fromFileUrl, join } from "@std/path";
import { assert, assertEquals, assertRejects } from "@std/assert";

import {
  EXIT_CONFLICT,
  EXIT_FAILURE,
  EXIT_OK,
  EXIT_USAGE,
} from "../src/wiki/cli.ts";
import { contentHash, EditUsageError } from "../src/wiki/edit.ts";
import { findSections } from "../src/wiki/headings.ts";
import { Wiki } from "../src/wiki/wiki.ts";

const CLI_ENTRY = fromFileUrl(new URL("../src/wiki/cli.ts", import.meta.url));
const DECODER = new TextDecoder();

/** Shaped like `wazootech/memory`'s `PurchaseShape.md`. */
const PURCHASE_SHAPE = `---
'@type': sh:NodeShape
rdfs:label: PurchaseShape
sh:targetClass: schema:Purchase
sh:property:
  - sh:path: schema:name
    sh:minCount: 1
    sh:maxCount: 1
    sh:datatype: xsd:string
  - sh:path: schema:price
    sh:minCount: 1
    sh:maxCount: 1
    sh:datatype: xsd:double
  - sh:path: schema:priceCurrency
    sh:minCount: 1
    sh:pattern: ^[A-Z]{3}$
  - sh:path: schema:url
    sh:maxCount: 1
---

# PurchaseShape
`;

const LEDGER = `---
'@type': schema:Purchase
# Keep this entry's price in sync with the invoice.
schema:name: DeepSeek API key
schema:price: 12.00
schema:priceCurrency: USD
---

# DeepSeek API key

Prepaid credits.

## Change log

- 2026-09-14 — Created.

\`\`\`md
## Change log
\`\`\`

## Notes

### Change log

Nested.
`;

function writeWiki(extra: Record<string, string> = {}): string {
  const root = Deno.makeTempDirSync({ prefix: "wiki-body-verbs-" });
  Deno.mkdirSync(join(root, "wiki"));
  Deno.writeTextFileSync(join(root, "wiki.yml"), "wiki:\n  input: [wiki]\n");
  const pages: Record<string, string> = {
    "PurchaseShape.md": PURCHASE_SHAPE,
    "DeepSeek_(payment).md": LEDGER,
    ...extra,
  };
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

async function runCli(
  root: string,
  args: readonly string[],
  stdin = "",
): Promise<{ code: number; stdout: string; stderr: string }> {
  const child = new Deno.Command(Deno.execPath(), {
    args: ["run", "--quiet", "--allow-all", CLI_ENTRY, ...args],
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

const PAGE = "wiki/DeepSeek_(payment).md";

Deno.test("findSections ignores headings inside fenced code", () => {
  const sections = findSections(
    LEDGER.split("---").slice(2).join("---"),
    "Change log",
  );
  // The `## Change log` inside the fence is not a heading; the H3 is.
  assertEquals(sections.map((section) => section.level), [2, 3]);
});

Deno.test("set keeps comments, key order, and scalar spelling", async () => {
  const root = writeWiki();
  try {
    const wiki = Wiki.load(root);
    const report = await wiki.edit({
      ops: [{
        op: "set",
        path: PAGE,
        field: "schema:price",
        yaml: "13.50",
      }, {
        op: "set",
        path: PAGE,
        field: "schema:url",
        yaml: "https://platform.deepseek.com",
      }],
    }, { apply: true });
    assertEquals(report.status, "applied", JSON.stringify(report.introduced));
    const text = read(root, PAGE);
    assert(text.includes("# Keep this entry's price in sync"), text);
    assert(text.includes("schema:price: 13.50\n"), text);
    const order = [
      "schema:name",
      "schema:price",
      "schema:priceCurrency",
      "schema:url",
    ]
      .map((key) => text.indexOf(`${key}:`));
    assertEquals([...order].sort((a, b) => a - b), order);
    assertEquals(text.split("---")[2], LEDGER.split("---")[2]);
  } finally {
    cleanup(root);
  }
});

Deno.test("set with value null removes the field", async () => {
  const root = writeWiki();
  try {
    const wiki = Wiki.load(root);
    // Removing a required field is rejected: PurchaseShape needs a price.
    const rejected = await wiki.edit({
      ops: [{ op: "set", path: PAGE, field: "schema:price", value: null }],
    }, { apply: true });
    assertEquals(rejected.status, "rejected");
    assertEquals(read(root, PAGE), LEDGER);

    const removed = await wiki.edit({
      ops: [{
        op: "set",
        path: PAGE,
        field: "schema:url",
        yaml: "https://x.example",
      }],
    }, { apply: true });
    assertEquals(removed.status, "applied");
    const unset = await wiki.edit({
      ops: [{ op: "set", path: PAGE, field: "schema:url", value: null }],
    }, { apply: true });
    assertEquals(unset.status, "applied");
    assertEquals(read(root, PAGE), LEDGER);
  } finally {
    cleanup(root);
  }
});

Deno.test("set keeps CRLF line endings", async () => {
  const crlf = LEDGER.replaceAll("\n", "\r\n");
  const root = writeWiki({ "DeepSeek_(payment).md": crlf });
  try {
    const wiki = Wiki.load(root);
    const report = await wiki.edit({
      ops: [{ op: "set", path: PAGE, field: "schema:price", yaml: "14.00" }],
    }, { apply: true });
    assertEquals(report.status, "applied");
    const text = read(root, PAGE);
    assert(!/[^\r]\n/.test(text), "a bare LF crept in");
    assertEquals(text, crlf.replace("12.00", "14.00"));
  } finally {
    cleanup(root);
  }
});

Deno.test("patch appends under a heading, skipping fenced lookalikes", async () => {
  const root = writeWiki();
  try {
    const wiki = Wiki.load(root);
    const ambiguous = await assertRejects(
      () =>
        wiki.edit({
          ops: [{
            op: "patch",
            path: PAGE,
            target: { heading: "Change log" },
            mode: "append",
            content: "- x",
          }],
        }),
      EditUsageError,
    );
    assert(ambiguous.message.includes("2 headings match"), ambiguous.message);
    assert(ambiguous.message.includes("#change-log-1"), ambiguous.message);

    const report = await wiki.edit({
      ops: [{
        op: "patch",
        path: PAGE,
        target: { heading: "change-log" },
        mode: "append",
        content: "- 2026-10-10 — Repriced.\n",
      }],
    }, { apply: true });
    assertEquals(report.status, "applied");
    // The section runs to the next H2, so the fenced lookalike sits inside it
    // and the entry lands after the fence; a `#` scan would stop at the fence.
    assertEquals(
      read(root, PAGE),
      LEDGER.replace(
        "## Change log\n```\n",
        "## Change log\n```\n\n- 2026-10-10 — Repriced.\n",
      ),
    );
  } finally {
    cleanup(root);
  }
});

Deno.test("patch prepends, replaces, and reports a missing heading", async () => {
  const root = writeWiki();
  try {
    const wiki = Wiki.load(root);
    const replaced = await wiki.edit({
      ops: [{
        op: "patch",
        path: PAGE,
        target: { heading: "Notes" },
        mode: "replace",
        content: "Rewritten.",
      }, {
        op: "patch",
        path: PAGE,
        target: { body: true },
        mode: "append",
        content: "Trailer.",
      }],
    }, { apply: true });
    assertEquals(replaced.status, "applied");
    const text = read(root, PAGE);
    assert(text.endsWith("## Notes\n\nRewritten.\n\nTrailer.\n"), text);
    assert(!text.includes("### Change log"), text);

    await assertRejects(
      () =>
        wiki.edit({
          ops: [{
            op: "patch",
            path: PAGE,
            target: { heading: "Nope" },
            mode: "prepend",
            content: "x",
          }],
        }),
      EditUsageError,
      "no heading matches",
    );
  } finally {
    cleanup(root);
  }
});

Deno.test("a typed create scaffolds required fields first and an H1", async () => {
  const root = writeWiki();
  try {
    const wiki = Wiki.load(root);
    const report = await wiki.edit({
      ops: [{
        op: "create",
        path: "wiki/Neon_(payment).md",
        type: "schema:Purchase",
        frontmatter: {
          "schema:url": "https://neon.com",
          "schema:priceCurrency": "USD",
          "schema:price": 5.5,
          "schema:name": "Neon plan",
        },
        body: "Monthly plan.",
      }],
    }, { apply: true });
    assertEquals(report.status, "applied", JSON.stringify(report.introduced));
    assertEquals(
      read(root, "wiki/Neon_(payment).md"),
      [
        "---",
        '"@type": schema:Purchase',
        "schema:name: Neon plan",
        "schema:price: 5.5",
        "schema:priceCurrency: USD",
        "schema:url: https://neon.com",
        "---",
        "",
        "# Neon plan",
        "",
        "Monthly plan.",
        "",
      ].join("\n"),
    );
    const check = await Wiki.load(root).check();
    assert(check.ok, JSON.stringify(check.errors));
  } finally {
    cleanup(root);
  }
});

Deno.test(
  "wiki new, set, and patch map statuses to exit codes",
  { permissions: { run: true, read: true, write: true } },
  async () => {
    const root = writeWiki();
    try {
      // Missing schema:price: rejected, the report names it, nothing written.
      const missing = await runCli(root, [
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
        "new",
        "wiki/Neon_plan.md",
        "--set",
        "schema:name=x",
      ]);
      assertEquals(again.code, EXIT_CONFLICT, again.stderr);

      const stale = await runCli(root, [
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
        ["patch", PAGE, "--heading", "Notes", "--append", "--apply"],
        "From stdin.\n",
      );
      assertEquals(patched.code, EXIT_OK, patched.stderr);
      assert(read(root, PAGE).endsWith("Nested.\n\nFrom stdin.\n"));

      const twoModes = await runCli(root, [
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
        "patch",
        PAGE,
        "--heading",
        "Change log",
        "--append",
        "--content",
        "x",
      ]);
      assertEquals(ambiguous.code, EXIT_USAGE);
      assertEquals((await runCli(root, ["set", PAGE])).code, EXIT_USAGE);
      assertEquals((await runCli(root, ["new", "--help"])).code, EXIT_OK);
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
