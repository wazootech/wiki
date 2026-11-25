import { join } from "@std/path";
import {
  assert,
  assertEquals,
  assertFalse,
  assertStringIncludes,
} from "@std/assert";
import { removeFrontmatterKeys } from "../src/wiki/fix.ts";
import { Wiki } from "../src/wiki/wiki.ts";
import { XSD_DATETIME } from "../src/wiki/rdf.ts";
import {
  cleanup,
  commit,
  exportWiki,
  gitWiki,
  runCli,
  snapshot,
  write,
} from "./derived_metadata_support.ts";

// ---------------------------------------------------------------------------
// Lint
// ---------------------------------------------------------------------------

Deno.test("lint.redundant_frontmatter is off by default and warns when on", async () => {
  const root = gitWiki();
  try {
    write(
      root,
      "wiki/Repeats.md",
      "---\ntype: Article\nheadline: Repeats\n---\n\n# Repeats\n",
    );
    write(
      root,
      "wiki/Differs.md",
      "---\ntype: Article\nheadline: Chosen Title\n---\n\n# Differs\n",
    );
    commit(root, "create", "2026-02-03T04:05:06Z");

    const quiet = await Wiki.load(root).lint();
    assertFalse(
      quiet.warnings.some((issue) => issue.code === "redundant_frontmatter"),
    );

    write(
      root,
      "wiki.yml",
      "wiki:\n  input: [wiki]\nlint:\n  redundant_frontmatter: warning\n",
    );
    const report = await Wiki.load(root).lint();
    const found = report.warnings.filter((issue) =>
      issue.code === "redundant_frontmatter"
    );
    assertEquals(found.length, 1, JSON.stringify(report.warnings));
    assertEquals(found[0]!.route, "Repeats");
    assertStringIncludes(
      found[0]!.message,
      "In Repeats.md: frontmatter 'headline' repeats the derived " +
        'schema:headline ("Repeats")',
    );
    assert(report.ok);
    assertFalse((await Wiki.load(root).lint(null, { strict: true })).ok);

    const cli = await runCli(root, ["lint", "-v"]);
    assertStringIncludes(cli.stderr, "repeats the derived");
  } finally {
    cleanup(root);
  }
});

// ---------------------------------------------------------------------------
// Byte-preserving removal
// ---------------------------------------------------------------------------

Deno.test("removal cuts only the entry's lines and keeps every other byte", () => {
  const before = "---\r\n# a leading comment\r\n'@type': schema:Article\r\n" +
    'headline: "Quoted Title" # same as the H1\r\n' +
    "name: 'single quoted'\r\n" +
    "summary: >-\r\n  folded\r\n  text\r\n" +
    "keywords: [b, a]\r\n---\r\n\r\n# Quoted Title\r\n\r\nBody  \r\n";
  const removed = removeFrontmatterKeys(before, ["headline", "summary"]);
  assertEquals(removed.removed, ["headline", "summary"]);
  assertEquals(removed.skipped, []);
  assertEquals(
    removed.content,
    "---\r\n# a leading comment\r\n'@type': schema:Article\r\n" +
      "name: 'single quoted'\r\n" +
      "keywords: [b, a]\r\n---\r\n\r\n# Quoted Title\r\n\r\nBody  \r\n",
  );
});

Deno.test("removal keeps a byte order mark and the last entry's newline", () => {
  const before = "\uFEFF---\ntype: Article\nheadline: Title\n---\n# Title\n";
  assertEquals(
    removeFrontmatterKeys(before, ["headline"]).content,
    "\uFEFF---\ntype: Article\n---\n# Title\n",
  );
});

Deno.test("an entry that cannot be cut cleanly is skipped, not mangled", () => {
  const flow = "---\n{type: Article, headline: Title}\n---\n";
  assertEquals(removeFrontmatterKeys(flow, ["headline"]).content, flow);
  assertEquals(
    removeFrontmatterKeys(flow, ["headline"]).skipped[0]!.reason,
    "the frontmatter is not a block mapping",
  );

  const anchored = "---\ntype: Article\nheadline: &t Title\nname: *t\n---\n";
  const result = removeFrontmatterKeys(anchored, ["headline"]);
  assertEquals(result.content, anchored);
  assertEquals(result.removed, []);
  assertStringIncludes(result.skipped[0]!.reason, "anchor");

  const none = "No frontmatter.\n";
  assertEquals(removeFrontmatterKeys(none, ["headline"]).content, none);
});

// ---------------------------------------------------------------------------
// `wiki fix`
// ---------------------------------------------------------------------------

Deno.test("wiki fix previews by default and removes only redundant fields with --apply", async () => {
  const root = gitWiki();
  try {
    const repeats = "---\r\n# kept comment\r\ntype: Article\r\n" +
      "headline: 'Repeats'\r\n" +
      "dateCreated: 2026-02-03T04:05:06Z\r\n" +
      "dateModified: 2026-02-03\r\n" +
      'description: "Kept, quoted"\r\n---\r\n\r\n# Repeats\r\n\r\nBody.\r\n';
    const differs =
      "---\ntype: Article\nheadline: Chosen Title\n---\n\n# Differs\n";
    write(root, "wiki/Repeats.md", repeats);
    write(root, "wiki/Differs.md", differs);
    commit(root, "create", "2026-02-03T04:05:06Z");
    const before = snapshot(join(root, "wiki"));

    const preview = await runCli(root, ["fix"]);
    assertEquals(preview.code, 0, preview.stderr);
    assertStringIncludes(preview.stdout, "wiki/Repeats.md");
    assertStringIncludes(
      preview.stdout,
      "Would remove 2 redundant fields from 1 file.",
    );
    assertFalse(preview.stdout.includes("Differs"));
    assertEquals(snapshot(join(root, "wiki")), before);

    const verbose = await runCli(root, ["fix", "--dry-run", "-v"]);
    assertStringIncludes(
      verbose.stdout,
      'wiki/Repeats.md: headline (schema:headline = "Repeats")',
    );
    assertStringIncludes(
      verbose.stdout,
      'wiki/Repeats.md: dateCreated (schema:dateCreated = "2026-02-03T04:05:06Z")',
    );
    assertEquals(snapshot(join(root, "wiki")), before);

    const conflicting = await runCli(root, ["fix", "--apply", "--dry-run"]);
    assertEquals(conflicting.code, 2);

    const applied = await runCli(root, ["fix", "--apply"]);
    assertEquals(applied.code, 0, applied.stderr);
    assertStringIncludes(
      applied.stdout,
      "Removed 2 redundant fields from 1 file.",
    );
    assertEquals(
      Deno.readTextFileSync(join(root, "wiki", "Repeats.md")),
      "---\r\n# kept comment\r\ntype: Article\r\n" +
        "dateModified: 2026-02-03\r\n" +
        'description: "Kept, quoted"\r\n---\r\n\r\n# Repeats\r\n\r\nBody.\r\n',
    );
    assertEquals(
      Deno.readTextFileSync(join(root, "wiki", "Differs.md")),
      differs,
    );

    const again = await runCli(root, ["fix"]);
    assertStringIncludes(again.stdout, "No redundant frontmatter.");
  } finally {
    cleanup(root);
  }
});

Deno.test("wiki fix limits itself to the files it is given", async () => {
  const root = gitWiki();
  try {
    const one = "---\ntype: Article\nheadline: One\n---\n\n# One\n";
    const two = "---\ntype: Article\nheadline: Two\n---\n\n# Two\n";
    write(root, "wiki/One.md", one);
    write(root, "wiki/Two.md", two);
    commit(root, "create", "2026-02-03T04:05:06Z");
    const result = await runCli(root, ["fix", "--apply", "wiki/One.md"]);
    assertEquals(result.code, 0, result.stderr);
    assertEquals(
      Deno.readTextFileSync(join(root, "wiki", "One.md")),
      "---\ntype: Article\n---\n\n# One\n",
    );
    assertEquals(Deno.readTextFileSync(join(root, "wiki", "Two.md")), two);
  } finally {
    cleanup(root);
  }
});

Deno.test("wiki fix is rejected when a JSON Schema still requires the field", async () => {
  const root = gitWiki();
  try {
    write(
      root,
      "schemas/article.json",
      JSON.stringify({
        type: "object",
        required: ["headline"],
        properties: { headline: { type: "string" } },
      }),
    );
    write(
      root,
      "wiki/Article_Shape.md",
      "---\ntype: sh:NodeShape\nsh:targetClass: schema:Article\n" +
        "wazoo:jsonSchema: schemas/article.json\n---\n",
    );
    const page = "---\ntype: Article\nheadline: Page\n---\n\n# Page\n";
    write(root, "wiki/Page.md", page);
    commit(root, "create", "2026-02-03T04:05:06Z");

    const report = await Wiki.load(root).fix(null, { apply: true });
    assertEquals(report.status, "rejected");
    assertEquals(Deno.readTextFileSync(join(root, "wiki", "Page.md")), page);

    const cli = await runCli(root, ["fix", "--apply"]);
    assertEquals(cli.code, 1);
    assertStringIncludes(cli.stderr, "Not written");
  } finally {
    cleanup(root);
  }
});

Deno.test("wiki export includes derived values; explicit keys stay as written", async () => {
  const root = exportWiki();
  try {
    const dict = await runCli(root, ["export", "wiki/Page.md"]);
    assertEquals(dict.code, 0, dict.stderr);
    const page = JSON.parse(dict.stdout).rdf;
    assertEquals(page["schema:headline"], "Page Title");
    assertEquals(page["schema:dateCreated"], "2026-02-03T04:05:06Z");
    assertEquals(page["schema:dateModified"], "2026-02-03T04:05:06Z");

    const chosen = JSON.parse(
      (await runCli(root, ["export", "wiki/Chosen.md"])).stdout,
    ).rdf;
    assertEquals(chosen.headline, "Chosen");
    assertFalse("schema:headline" in chosen);
    assertEquals(chosen["schema:dateCreated"], "2026-02-03T04:05:06Z");

    const turtle = await runCli(root, ["export", "-f", "nt", "wiki/Page.md"]);
    assertEquals(turtle.code, 0, turtle.stderr);
    assertStringIncludes(
      turtle.stdout,
      '<https://schema.org/headline> "Page Title"',
    );
    assertStringIncludes(
      turtle.stdout,
      '<https://schema.org/dateModified> "2026-02-03T04:05:06Z"^^' +
        `<${XSD_DATETIME}>`,
    );

    const all = JSON.parse((await runCli(root, ["export"])).stdout) as Array<
      { name: string; rdf: Record<string, unknown> }
    >;
    assertEquals(
      all.map((item) => [item.name, item.rdf["schema:headline"] ?? null]),
      [["Chosen.md", null], ["Page.md", "Page Title"]],
    );
  } finally {
    cleanup(root);
  }
});

Deno.test("wiki file show reports derived values beside the frontmatter", async () => {
  const root = exportWiki();
  try {
    const report = await Wiki.load(root).show("wiki/Page.md");
    assertEquals(report.frontmatter?.["schema:headline"], undefined);
    assertEquals(report.derived, {
      "schema:headline": "Page Title",
      "schema:dateCreated": "2026-02-03T04:05:06Z",
      "schema:dateModified": "2026-02-03T04:05:06Z",
    });
    assertEquals(report.dateSource, "git");
    const jsonld = JSON.stringify(report.jsonld);
    assertStringIncludes(jsonld, "Page Title");
    assertStringIncludes(jsonld, "2026-02-03T04:05:06Z");

    const chosen = await Wiki.load(root).show("wiki/Chosen.md");
    assertFalse("schema:headline" in chosen.derived);

    const text = await runCli(root, ["file", "show", "wiki/Page.md"]);
    assertEquals(text.code, 0, text.stderr);
    assertStringIncludes(
      text.stdout,
      "derived:\n  schema:headline: Page Title (from H1)\n" +
        "  schema:dateCreated: 2026-02-03T04:05:06Z (from git)\n",
    );
    const field = await runCli(root, [
      "file",
      "show",
      "wiki/Page.md",
      "--field",
      "schema:headline",
    ]);
    assertEquals(field.code, 0, field.stderr);
    assertEquals(field.stdout.trim(), "Page Title");
  } finally {
    cleanup(root);
  }
});
