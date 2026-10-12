/**
 * Derived document metadata (#318): H1 title, Git dates, redundant frontmatter,
 * and `wiki fix`.
 */

import { dirname, join } from "@std/path";
import { assert, assertEquals, assertFalse } from "@std/assert";
import { Config } from "../src/wiki/config.ts";
import { firstH1, removeFrontmatterKeys } from "../src/wiki/derived.ts";
import { loadGraph } from "../src/wiki/graph.ts";
import { clearAllProcessGraphs } from "../src/wiki/graph_cache.ts";
import { runLint } from "../src/wiki/audit.ts";
import { fixRedundantFrontmatter } from "../src/wiki/redundant.ts";
import { namedNode, XSD_DATETIME } from "../src/wiki/rdf.ts";

const SCHEMA = "https://schema.org/";
const XSD_STRING = "http://www.w3.org/2001/XMLSchema#string";

function write(root: string, relative: string, content: string): string {
  const target = join(root, ...relative.split("/"));
  Deno.mkdirSync(dirname(target), { recursive: true });
  Deno.writeTextFileSync(target, content);
  return target;
}

function git(root: string, date: string | null, ...args: string[]): void {
  const env: Record<string, string> = { GIT_CONFIG_NOSYSTEM: "1" };
  if (date !== null) {
    env.GIT_COMMITTER_DATE = date;
    env.GIT_AUTHOR_DATE = date;
  }
  const result = new Deno.Command("git", {
    args: [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.org",
      "-c",
      "commit.gpgsign=false",
      ...args,
    ],
    cwd: root,
    env,
    stdout: "null",
    stderr: "piped",
  }).outputSync();
  if (!result.success) {
    throw new Error(new TextDecoder().decode(result.stderr));
  }
}

function commit(root: string, date: string, message: string): void {
  git(root, null, "add", "-A");
  git(root, date, "commit", "-q", "-m", message);
}

function withRoot(fn: (root: string) => void | Promise<void>) {
  return async () => {
    const root = Deno.makeTempDirSync({ prefix: "wiki-derived-" });
    clearAllProcessGraphs();
    try {
      await fn(root);
    } finally {
      try {
        Deno.removeSync(root, { recursive: true });
      } catch {
        // Windows may hold the Git index briefly.
      }
    }
  };
}

function configFor(root: string): Config {
  return new Config({
    wiki: { input: [join(root, "wiki")] },
    lint: { redundant_frontmatter: "warning" },
    config_root: root,
  });
}

async function objects(
  root: string,
  predicate: string,
): Promise<Array<{ value: string; datatype: string | undefined }>> {
  const graph = await loadGraph(configFor(root));
  return [...graph.match(null, namedNode(SCHEMA + predicate))].map((quad) => ({
    value: quad.object.value,
    datatype: "datatype" in quad.object
      ? (quad.object as { datatype: { value: string } }).datatype.value
      : undefined,
  }));
}

const PAGE = "---\ntype: Article\n---\n# Hello World\n\nBody.\n";

Deno.test("firstH1 takes the first ATX H1 outside fenced code", () => {
  assertEquals(
    firstH1("```\n# not a title\n```\n\n# Real\n\n# Later\n"),
    "Real",
  );
  assertEquals(firstH1("## Only H2\n"), null);
  assertEquals(firstH1("no headings"), null);
});

Deno.test(
  "headline and Git dates are derived into the graph without touching the file",
  withRoot(async (root) => {
    git(root, null, "init", "-q");
    const file = write(root, "wiki/Hello.md", PAGE);
    commit(root, "2026-01-02T03:04:05+02:00", "add");
    Deno.writeTextFileSync(file, PAGE + "\nMore.\n");
    commit(root, "2026-03-04T10:00:00Z", "edit");
    const before = Deno.readTextFileSync(file);

    assertEquals(await objects(root, "headline"), [
      { value: "Hello World", datatype: XSD_STRING },
    ]);
    // The oldest commit is 01:04:05Z; the newest is the edit.
    assertEquals(await objects(root, "dateCreated"), [
      { value: "2026-01-02T01:04:05Z", datatype: XSD_DATETIME },
    ]);
    assertEquals(await objects(root, "dateModified"), [
      { value: "2026-03-04T10:00:00Z", datatype: XSD_DATETIME },
    ]);
    assertEquals(Deno.readTextFileSync(file), before);
  }),
);

Deno.test(
  "rename history is followed for dateCreated",
  withRoot(async (root) => {
    git(root, null, "init", "-q");
    write(root, "wiki/Old.md", PAGE);
    commit(root, "2026-01-01T00:00:00Z", "add");
    git(root, null, "mv", "wiki/Old.md", "wiki/New.md");
    commit(root, "2026-02-01T00:00:00Z", "rename");

    assertEquals(
      (await objects(root, "dateCreated")).map((o) => o.value),
      ["2026-01-01T00:00:00Z"],
    );
  }),
);

Deno.test(
  "without history the file modification time is used for both dates",
  withRoot(async (root) => {
    const file = write(root, "wiki/Hello.md", PAGE);
    const when = new Date("2026-05-06T07:08:09Z");
    Deno.utimeSync(file, when, when);
    // A temp dir has no `.git` above it, so there is no history to find.
    const created = (await objects(root, "dateCreated")).map((o) => o.value);
    const modified = (await objects(root, "dateModified")).map((o) => o.value);
    assertEquals(created, ["2026-05-06T07:08:09Z"]);
    assertEquals(modified, ["2026-05-06T07:08:09Z"]);
  }),
);

Deno.test(
  "explicit frontmatter wins and is not duplicated",
  withRoot(async (root) => {
    write(
      root,
      "wiki/Hello.md",
      "---\ntype: Article\nheadline: Custom\nschema:dateCreated: 2020-01-01T00:00:00Z\n---\n# Hello World\n",
    );
    assertEquals((await objects(root, "headline")).map((o) => o.value), [
      "Custom",
    ]);
    assertEquals((await objects(root, "dateCreated")).length, 1);
    assertEquals(
      (await objects(root, "dateCreated"))[0]!.value.startsWith("2020-01-01"),
      true,
    );
  }),
);

Deno.test(
  "a page with no H1 derives no headline",
  withRoot(async (root) => {
    write(root, "wiki/Hello.md", "---\ntype: Article\n---\nJust prose.\n");
    assertEquals(await objects(root, "headline"), []);
  }),
);

Deno.test(
  "redundant values warn, differing values do not, fix previews then applies",
  withRoot(async (root) => {
    git(root, null, "init", "-q");
    const redundant = write(
      root,
      "wiki/Same.md",
      "---\ntype: Article\n# keep this comment\nheadline: Same Title\ndateCreated: 2026-01-01T00:00:00Z\nauthor: Ada\n---\n# Same Title\n\nBody.\n",
    );
    const differing = write(
      root,
      "wiki/Other.md",
      "---\ntype: Article\nheadline: Different\n---\n# Other Title\n",
    );
    commit(root, "2026-01-01T00:00:00Z", "add");
    const config = configFor(root);

    const report = await runLint(config);
    const messages = report.warnings.map((w) => w.message);
    assert(
      messages.some((m) => m.includes("Same.md") && m.includes("headline")),
    );
    assert(messages.some((m) => m.includes("dateCreated")));
    assertFalse(messages.some((m) => m.includes("Other.md")));

    const before = Deno.readTextFileSync(redundant);
    const otherBefore = Deno.readTextFileSync(differing);
    const preview = fixRedundantFrontmatter(config, null, { apply: false });
    assertEquals(preview.applied, false);
    assertEquals(preview.files.length, 1);
    assertEquals(Deno.readTextFileSync(redundant), before);

    const applied = fixRedundantFrontmatter(config, null, { apply: true });
    assertEquals(applied.files.length, 1);
    assertEquals(
      Deno.readTextFileSync(redundant),
      "---\ntype: Article\n# keep this comment\nauthor: Ada\n---\n# Same Title\n\nBody.\n",
    );
    assertEquals(Deno.readTextFileSync(differing), otherBefore);
    assertEquals(
      fixRedundantFrontmatter(config, null, { apply: true }).files,
      [],
    );
  }),
);

Deno.test("removeFrontmatterKeys keeps CRLF, quoting, and the body", () => {
  const input =
    '---\r\ntype: Article\r\nheadline: "Quoted"   # why\r\nlist:\r\n  - a\r\n---\r\n# Quoted\r\n';
  assertEquals(
    removeFrontmatterKeys(input, new Set(["headline"])),
    "---\r\ntype: Article\r\nlist:\r\n  - a\r\n---\r\n# Quoted\r\n",
  );
  assertEquals(
    removeFrontmatterKeys("# no frontmatter\n", new Set(["x"])),
    "# no frontmatter\n",
  );
});
