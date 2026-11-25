/**
 * Graph-derived document metadata and `wiki fix` (wiki#318, wiki#319).
 *
 * Every Git fixture is a real throwaway repository in a temp directory, with
 * committer dates pinned through `GIT_COMMITTER_DATE` so the derived values are
 * known before the commit is made.
 */

import { join } from "@std/path";
import { assert, assertEquals } from "@std/assert";
import { firstAtxH1 } from "../src/wiki/headings.ts";
import {
  deriveMetadata,
  gitDates,
  redundantFields,
} from "../src/wiki/derived.ts";
import { Config } from "../src/wiki/config.ts";
import { Wiki } from "../src/wiki/wiki.ts";
import { XSD_DATETIME } from "../src/wiki/rdf.ts";
import {
  cleanup,
  commit,
  config,
  dataOf,
  DERIVED,
  git,
  gitWiki,
  NOTHING,
  objects,
  runCli,
  SCHEMA,
  snapshot,
  tempRoot,
  write,
} from "./derived_metadata_support.ts";

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
