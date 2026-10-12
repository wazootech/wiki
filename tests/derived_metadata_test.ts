/**
 * Graph-derived document metadata and `wiki fix` (wiki#318, wiki#319).
 *
 * Every Git fixture is a real throwaway repository in a temp directory, with
 * committer dates pinned through `GIT_COMMITTER_DATE` so the derived values are
 * known before the commit is made.
 */

import { dirname, fromFileUrl, join } from "@std/path";
import {
  assert,
  assertEquals,
  assertFalse,
  assertStringIncludes,
} from "@std/assert";
import { firstAtxH1 } from "../src/wiki/headings.ts";
import {
  type DerivedMetadata,
  deriveMetadata,
  gitDates,
  redundantFields,
} from "../src/wiki/derived.ts";
import { removeFrontmatterKeys } from "../src/wiki/fix.ts";
import { Config } from "../src/wiki/config.ts";
import { documentDataFromPath } from "../src/wiki/parser.ts";
import { Wiki } from "../src/wiki/wiki.ts";
import { XSD_DATETIME } from "../src/wiki/rdf.ts";

const CLI_ENTRY = fromFileUrl(new URL("../src/wiki/cli.ts", import.meta.url));
const DECODER = new TextDecoder();
const SCHEMA = "https://schema.org/";

function tempRoot(): string {
  return Deno.makeTempDirSync({ prefix: "wiki-derived-" });
}

function cleanup(root: string): void {
  try {
    Deno.removeSync(root, { recursive: true });
  } catch {
    // Windows keeps a handle open long enough to lose this race occasionally.
  }
}

function write(root: string, relative: string, content: string): string {
  const path = join(root, ...relative.split("/"));
  Deno.mkdirSync(dirname(path), { recursive: true });
  Deno.writeTextFileSync(path, content);
  return path;
}

function git(root: string, args: readonly string[], date?: string): void {
  const env: Record<string, string> = {
    GIT_AUTHOR_NAME: "Wiki Tests",
    GIT_AUTHOR_EMAIL: "wiki-tests@example.invalid",
    GIT_COMMITTER_NAME: "Wiki Tests",
    GIT_COMMITTER_EMAIL: "wiki-tests@example.invalid",
  };
  if (date !== undefined) {
    env.GIT_AUTHOR_DATE = date;
    env.GIT_COMMITTER_DATE = date;
  }
  const result = new Deno.Command("git", {
    args: ["-c", "commit.gpgsign=false", ...args],
    cwd: root,
    env,
    stdout: "piped",
    stderr: "piped",
  }).outputSync();
  if (result.code !== 0) {
    throw new Error(DECODER.decode(result.stderr));
  }
}

function commit(root: string, message: string, date: string): void {
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", message], date);
}

/** A wiki at `root` whose pages live in `wiki/`, inside a fresh repository. */
function gitWiki(lint = ""): string {
  const root = tempRoot();
  write(root, "wiki.yml", `wiki:\n  input: [wiki]\n${lint}`);
  git(root, ["init", "-q", "--initial-branch=main"]);
  return root;
}

const NOTHING: DerivedMetadata = {
  headline: null,
  dateCreated: null,
  dateModified: null,
  dateSource: null,
};

async function runCli(
  root: string,
  args: readonly string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  const { code, stdout, stderr } = await new Deno.Command(Deno.execPath(), {
    args: ["run", "--quiet", "--allow-all", CLI_ENTRY, ...args],
    cwd: root,
    stdout: "piped",
    stderr: "piped",
  }).output();
  return {
    code,
    stdout: DECODER.decode(stdout),
    stderr: DECODER.decode(stderr),
  };
}

/** Every file's bytes and mtime under `dir`, for a "nothing was written" check. */
function snapshot(dir: string): Map<string, string> {
  const files = new Map<string, string>();
  const walk = (current: string) => {
    for (const entry of Deno.readDirSync(current)) {
      const path = join(current, entry.name);
      if (entry.isDirectory) {
        walk(path);
      } else {
        const stat = Deno.statSync(path);
        files.set(
          path,
          `${stat.mtime?.getTime()}:${
            Array.from(Deno.readFileSync(path)).join(",")
          }`,
        );
      }
    }
  };
  walk(dir);
  return files;
}

// ---------------------------------------------------------------------------
// H1 selection
// ---------------------------------------------------------------------------

Deno.test("the derived headline is the first ATX H1, as plain text", () => {
  assertEquals(firstAtxH1("Intro.\n\n# Title\n\n# Second\n"), "Title");
  assertEquals(firstAtxH1("## Sub\n\n# Later Title\n"), "Later Title");
  assertEquals(
    firstAtxH1("# The `wiki` *CLI* and [links](x.md) ##\n"),
    "The wiki CLI and links",
  );
  assertEquals(firstAtxH1("# Caf&eacute; \\*\n"), "Café *");
});

Deno.test("a heading inside fenced code is not the H1", () => {
  const markdown = "```md\n# Not A Title\n```\n\n# Real Title\n";
  assertEquals(firstAtxH1(markdown), "Real Title");
  assertEquals(firstAtxH1("~~~\n# Fenced\n~~~\n"), null);
});

Deno.test("no ATX H1 derives no headline", () => {
  assertEquals(firstAtxH1("Just prose.\n\n## Only H2\n"), null);
  assertEquals(firstAtxH1("Setext Title\n============\n"), null);
  assertEquals(firstAtxH1("#\n"), null);
  assertEquals(firstAtxH1(""), null);
});

// ---------------------------------------------------------------------------
// Git dates
// ---------------------------------------------------------------------------

Deno.test("Git dates are the oldest and newest committer times, in UTC", async () => {
  const root = gitWiki();
  try {
    const page = write(root, "wiki/Page.md", "# Page\n");
    // +05:30 at commit time: the derived value is the same instant in UTC.
    commit(root, "create", "2026-01-02T03:04:05+05:30");
    write(root, "wiki/Page.md", "# Page\n\nMore.\n");
    commit(root, "edit", "2026-03-04T10:00:00Z");
    write(root, "wiki/Other.md", "# Other\n");
    commit(root, "unrelated", "2026-05-06T00:00:00Z");

    assertEquals(await gitDates(page), {
      created: "2026-01-01T21:34:05Z",
      modified: "2026-03-04T10:00:00Z",
    });
    const derived = await deriveMetadata(page);
    assertEquals(derived.dateSource, "git");
    assertEquals(derived.headline, "Page");
  } finally {
    cleanup(root);
  }
});

Deno.test("Git dates follow renames back to the original file", async () => {
  const root = gitWiki();
  try {
    write(
      root,
      "wiki/Old_Name.md",
      "# Topic\n\nA page long enough to rename.\n",
    );
    commit(root, "create", "2025-06-01T12:00:00Z");
    git(root, ["mv", "wiki/Old_Name.md", "wiki/New_Name.md"]);
    commit(root, "rename", "2025-07-01T12:00:00Z");
    const page = write(
      root,
      "wiki/New_Name.md",
      "# Topic\n\nA page long enough to rename.\n\nEdited.\n",
    );
    commit(root, "edit", "2025-08-01T12:00:00Z");

    assertEquals(await gitDates(page), {
      created: "2025-06-01T12:00:00Z",
      modified: "2025-08-01T12:00:00Z",
    });
  } finally {
    cleanup(root);
  }
});

Deno.test("without usable history both dates fall back to the mtime", async () => {
  const root = gitWiki();
  try {
    write(root, "wiki/Tracked.md", "# Tracked\n");
    commit(root, "create", "2026-01-01T00:00:00Z");
    // Untracked in a repository with history.
    const untracked = write(root, "wiki/Untracked.md", "# Untracked\n");
    const mtime = new Date("2024-02-03T04:05:06.789Z");
    Deno.utimeSync(untracked, mtime, mtime);
    assertEquals(await gitDates(untracked), null);
    assertEquals(await deriveMetadata(untracked), {
      headline: "Untracked",
      dateCreated: "2024-02-03T04:05:06Z",
      dateModified: "2024-02-03T04:05:06Z",
      dateSource: "mtime",
    });
  } finally {
    cleanup(root);
  }

  // Not a repository at all.
  const plain = tempRoot();
  try {
    const page = write(plain, "Page.md", "No heading.\n");
    const mtime = new Date("2023-12-31T23:59:59Z");
    Deno.utimeSync(page, mtime, mtime);
    assertEquals(await deriveMetadata(page), {
      headline: null,
      dateCreated: "2023-12-31T23:59:59Z",
      dateModified: "2023-12-31T23:59:59Z",
      dateSource: "mtime",
    });
  } finally {
    cleanup(plain);
  }
});

Deno.test("a repository with no commits uses the mtime", async () => {
  const root = gitWiki();
  try {
    const page = write(root, "wiki/Page.md", "# Page\n");
    const mtime = new Date("2022-01-01T00:00:00Z");
    Deno.utimeSync(page, mtime, mtime);
    const derived = await deriveMetadata(page);
    assertEquals(derived.dateSource, "mtime");
    assertEquals(derived.dateCreated, "2022-01-01T00:00:00Z");
  } finally {
    cleanup(root);
  }
});

// ---------------------------------------------------------------------------
// The graph
// ---------------------------------------------------------------------------

function objects(
  graph: Awaited<ReturnType<Wiki["graph"]>>,
  subject: string,
  predicate: string,
): Array<{ value: string; datatype: string | undefined }> {
  return [...graph.match(
    { termType: "NamedNode", value: subject } as never,
    { termType: "NamedNode", value: predicate } as never,
    null,
  )].map((quad) => ({
    value: quad.object.value,
    datatype: quad.object.termType === "Literal"
      ? quad.object.datatype.value
      : undefined,
  }));
}

Deno.test("the graph carries the derived headline and Git dates", async () => {
  const root = gitWiki();
  try {
    write(root, "wiki/Page.md", "---\ntype: Article\n---\n\n# Page Title\n");
    write(root, "wiki/Untitled.md", "---\ntype: Article\n---\n\nNo H1.\n");
    commit(root, "create", "2026-02-03T04:05:06Z");
    const graph = await Wiki.load(root).graph({ infer: false, reload: true });
    const page = "https://wiki.example.org/Page";
    assertEquals(objects(graph, page, `${SCHEMA}headline`), [
      {
        value: "Page Title",
        datatype: "http://www.w3.org/2001/XMLSchema#string",
      },
    ]);
    for (const property of ["dateCreated", "dateModified"]) {
      assertEquals(objects(graph, page, `${SCHEMA}${property}`), [
        { value: "2026-02-03T04:05:06Z", datatype: XSD_DATETIME },
      ]);
    }
    assertEquals(
      objects(graph, "https://wiki.example.org/Untitled", `${SCHEMA}headline`),
      [],
    );
  } finally {
    cleanup(root);
  }
});

Deno.test("an explicit frontmatter value wins over the derived one", async () => {
  const root = gitWiki();
  try {
    write(
      root,
      "wiki/Bare.md",
      "---\ntype: Article\nheadline: Chosen\ndateModified: 2020-01-01\n---\n\n# Derived\n",
    );
    write(
      root,
      "wiki/Prefixed.md",
      "---\ntype: Article\nschema:headline: Chosen\n---\n\n# Derived\n",
    );
    commit(root, "create", "2026-02-03T04:05:06Z");
    const graph = await Wiki.load(root).graph({ infer: false, reload: true });
    for (const route of ["Bare", "Prefixed"]) {
      assertEquals(
        objects(graph, `https://wiki.example.org/${route}`, `${SCHEMA}headline`)
          .map((object) => object.value),
        ["Chosen"],
      );
    }
    // A date-only override stays a date: not duplicated, not rewritten.
    assertEquals(
      objects(graph, "https://wiki.example.org/Bare", `${SCHEMA}dateModified`),
      [{
        value: "2020-01-01",
        datatype: "http://www.w3.org/2001/XMLSchema#date",
      }],
    );
    assertEquals(
      objects(graph, "https://wiki.example.org/Bare", `${SCHEMA}dateCreated`)
        .map((object) => object.value),
      ["2026-02-03T04:05:06Z"],
    );
  } finally {
    cleanup(root);
  }
});

Deno.test("a document the graph gives no subject derives nothing", async () => {
  const root = gitWiki();
  try {
    write(root, "wiki/Untyped.md", "# Untyped\n");
    commit(root, "create", "2026-02-03T04:05:06Z");
    const graph = await Wiki.load(root).graph({ infer: false, reload: true });
    assertEquals(graph.size, 0);
  } finally {
    cleanup(root);
  }
});

Deno.test("read-only graph operations write nothing", async () => {
  const root = gitWiki();
  try {
    write(
      root,
      "wiki/Page.md",
      "---\ntype: Article\nheadline: Page\n---\n\n# Page\n",
    );
    commit(root, "create", "2026-02-03T04:05:06Z");
    write(root, "wiki/Fresh.md", "---\ntype: Article\n---\n\n# Fresh\n");
    const before = snapshot(join(root, "wiki"));
    for (
      const args of [
        ["query", "SELECT ?s WHERE { ?s ?p ?o }"],
        ["check"],
        ["lint"],
        ["render", "--check"],
        ["fix"],
        ["fix", "--dry-run", "-v"],
      ]
    ) {
      const result = await runCli(root, args);
      assert(result.code === 0, `${args.join(" ")}: ${result.stderr}`);
    }
    assertEquals(snapshot(join(root, "wiki")), before);
  } finally {
    cleanup(root);
  }
});

// ---------------------------------------------------------------------------
// Redundancy
// ---------------------------------------------------------------------------

function config(): Config {
  return new Config({ wiki: { input: ["wiki"] }, config_root: "." });
}

function dataOf(frontmatter: string): Record<string, unknown> {
  const root = tempRoot();
  try {
    return documentDataFromPath(
      write(root, "Page.md", `---\n${frontmatter}---\n\n# Ignored\n`),
    )!;
  } finally {
    cleanup(root);
  }
}

const DERIVED: DerivedMetadata = {
  headline: "Title",
  dateCreated: "2026-01-01T21:34:05Z",
  dateModified: "2026-03-04T10:00:00Z",
  dateSource: "git",
};

Deno.test("only an exact repeat of a derived value is redundant", () => {
  const exact = dataOf(
    "type: Article\nheadline: Title\ndateCreated: 2026-01-01T21:34:05Z\n" +
      "schema:dateModified: 2026-03-04T15:30:00+05:30\n",
  );
  assertEquals(
    redundantFields(exact, DERIVED, config()).map((field) => field.key),
    ["headline", "dateCreated", "schema:dateModified"],
  );

  const differing = dataOf(
    "type: Article\nheadline: Other Title\ndateCreated: 2026-01-01\n" +
      "dateModified: '2026-03-04T10:00:00Z'\n",
  );
  // A different string, a date-only value, and a quoted string: none repeats.
  assertEquals(redundantFields(differing, DERIVED, config()), []);
  assertEquals(redundantFields(exact, NOTHING, config()), []);
});

Deno.test("a property is redundant only when every key for it repeats the value", () => {
  const split = dataOf(
    "type: Article\nheadline: Title\nschema:headline: Something Else\n",
  );
  assertEquals(redundantFields(split, DERIVED, config()), []);
  const both = dataOf(
    "type: Article\nheadline: Title\nschema:headline: Title\n",
  );
  assertEquals(
    redundantFields(both, DERIVED, config()).map((field) => field.key),
    ["headline", "schema:headline"],
  );
});

Deno.test("nothing is redundant on an untyped page or one it would empty", () => {
  assertEquals(
    redundantFields(dataOf("headline: Title\n"), DERIVED, config()),
    [],
  );
  const implicit = new Config({
    wiki: { input: ["wiki"] },
    config_root: ".",
    graph: { implicit_types: ["Article"] },
  });
  assertEquals(
    redundantFields(dataOf("headline: Title\n"), DERIVED, implicit),
    [],
  );
});

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

// ---------------------------------------------------------------------------
// `wiki export` and `wiki file show`
// ---------------------------------------------------------------------------

/** One derived page and one whose frontmatter overrides the headline. */
function exportWiki(): string {
  const root = gitWiki();
  write(root, "wiki/Page.md", "---\ntype: Article\n---\n\n# Page Title\n");
  write(
    root,
    "wiki/Chosen.md",
    "---\ntype: Article\nheadline: Chosen\n---\n\n# Derived\n",
  );
  commit(root, "create", "2026-02-03T04:05:06Z");
  return root;
}

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
