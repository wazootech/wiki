/**
 * `set`, `patch`, and typed `create` — and their verbs `wiki set`, `wiki
 * patch`, and `wiki new` (wiki#355, slice 3).
 *
 * The promise under test is fidelity: an edit changes what it names and leaves
 * every other byte alone (comments, key order, `12.00`, line endings, a page's
 * own formatting), and a new page is honest about what its type requires.
 */

import { assert, assertEquals, assertRejects } from "@std/assert";
import { EditUsageError } from "../src/wiki/edit.ts";
import { findSections } from "../src/wiki/headings.ts";
import { Wiki } from "../src/wiki/wiki.ts";
import {
  cleanup,
  LEDGER,
  PAGE,
  read,
  writeWiki,
} from "./edit_body_verbs_support.ts";

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
