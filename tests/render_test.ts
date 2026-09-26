import { dirname, join } from "@std/path";
import { assert, assertEquals, assertStringIncludes } from "@std/assert";

import { Wiki } from "../src/wiki/wiki.ts";

function tempRoot(): string {
  return Deno.makeTempDirSync({ prefix: "wiki-render-" });
}

function write(root: string, relative: string, content: string): string {
  const path = join(root, ...relative.split("/"));
  Deno.mkdirSync(dirname(path), { recursive: true });
  Deno.writeTextFileSync(path, content);
  return path;
}

function writeWiki(root: string, report: string): string {
  write(
    root,
    "wiki.yaml",
    'wiki:\n  input: [wiki]\ngraph:\n  context:\n    "@vocab": https://schema.org/\n    schema: https://schema.org/\n    wiki: https://wiki.example.org/\n',
  );
  write(
    root,
    "wiki/Alice.md",
    "---\ntype: schema:Person\nname: Alice\n---\n# Alice\n",
  );
  return write(root, "wiki/Report.md", report);
}

function cleanup(root: string): void {
  Deno.removeSync(root, { recursive: true });
}

const VISIBLE_BLOCK = [
  "<!-- sparql:start -->",
  "```sparql",
  "SELECT ?name WHERE { ?person <https://schema.org/name> ?name }",
  "```",
  "<!-- sparql:end -->",
].join("\n");

Deno.test("render --check finds stale blocks without writing, then render is idempotent", async () => {
  const root = tempRoot();
  try {
    const original = `# Report\n\n${VISIBLE_BLOCK}\n`;
    const page = writeWiki(root, original);
    const wiki = Wiki.load(root);

    const stale = await wiki.render(null, { check: true, noInference: true });
    assertEquals(stale.ok, false);
    assertEquals(stale.updated_count, 0);
    assertEquals(stale.stale_files.length, 1);
    assertEquals(Deno.readTextFileSync(page), original);

    const rendered = await wiki.render(null, { noInference: true });
    assertEquals(rendered.ok, true);
    assertEquals(rendered.updated_count, 1);
    const updated = Deno.readTextFileSync(page);
    assertStringIncludes(updated, "| name |");
    assertStringIncludes(updated, "| Alice |");

    const clean = await wiki.render(null, { check: true, noInference: true });
    assertEquals(clean.ok, true);
    assertEquals(clean.stale_files, []);
  } finally {
    cleanup(root);
  }
});

Deno.test("render check tolerates formatter padding in existing tables", async () => {
  const root = tempRoot();
  try {
    const report = [
      "# Report",
      "",
      "<!-- sparql:start -->",
      "```sparql",
      "SELECT ?name WHERE { ?person <https://schema.org/name> ?name }",
      "```",
      "| name   |",
      "| ------- |",
      "| Alice |",
      "",
      "<!-- sparql:end -->",
      "",
    ].join("\n");
    writeWiki(root, report);
    const wiki = Wiki.load(root);
    const result = await wiki.render(null, { check: true, noInference: true });

    assertEquals(result.ok, true);
    assertEquals(result.stale_files, []);
  } finally {
    cleanup(root);
  }
});

Deno.test("render preserves hidden query comment structure and query fence bytes", async () => {
  const root = tempRoot();
  try {
    const report = [
      "# Report",
      "<!-- sparql:start",
      "```sparql",
      "SELECT ?name WHERE { ?person <https://schema.org/name> ?name }",
      "```",
      "-->",
      "",
      "<!-- sparql:end -->",
      "",
    ].join("\n");
    const page = writeWiki(root, report);
    const wiki = Wiki.load(root);
    const result = await wiki.render(null, { noInference: true });
    const updated = Deno.readTextFileSync(page);

    assertEquals(result.ok, true);
    assert(updated.includes("<!-- sparql:start\n```sparql\n"));
    assert(updated.includes("```\n-->\n\n"));
    assertStringIncludes(updated, "| Alice |");
  } finally {
    cleanup(root);
  }
});

Deno.test("render retains a bad query and reports it without writing", async () => {
  const root = tempRoot();
  try {
    const original =
      "<!-- sparql:start -->\n```sparql\nINVALID QUERY\n```\n<!-- sparql:end -->\n";
    const page = writeWiki(root, original);
    const wiki = Wiki.load(root);
    const result = await wiki.render(null, { noInference: true });

    assertEquals(result.ok, false);
    assertEquals(result.error_count, 1);
    assertEquals(result.updated_count, 0);
    assertEquals(Deno.readTextFileSync(page), original);
    assertStringIncludes(result.render_errors[0]!, "Report.md");
  } finally {
    cleanup(root);
  }
});
