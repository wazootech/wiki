/**
 * Port of `tests/test_wiki_links.py`.
 *
 * The Python file's last test asserts through `build_site`, which is phase 8;
 * the backlink half of it is asserted here directly, and the `Backlink_slugs`
 * assertion arrives with the site module.
 *
 * The exact-message test at the end was produced by a differential run against
 * the pinned oracle over the fixture it builds: same records, same order, same
 * `match_start` offsets, byte for byte. Two oracle behaviours it pins that are
 * easy to "fix" by accident:
 *
 * - a wikilink inside a fenced code block *is* reported (only inline spans are
 *   protected), and
 * - a markdown link that climbs out of the wiki is a `missing_document`, not an
 *   error about escaping — routing, not sanity-checking, decides.
 */

import { dirname, join } from "@std/path";
import { pathExists } from "../src/wiki/fspath.ts";
import { assert, assertEquals } from "@std/assert";
import { Config } from "../src/wiki/config.ts";

import { LinkIndex } from "../src/wiki/wiki_links.ts";

function tempRoot(): string {
  return Deno.makeTempDirSync({ prefix: "wiki-links-" });
}

function cleanup(root: string): void {
  try {
    Deno.removeSync(root, { recursive: true });
  } catch {
    // Windows keeps a handle open long enough to lose this race occasionally.
  }
}

/** Write a file below `root`, creating parent directories. */
function write(root: string, relative: string, content: string): string {
  const target = join(root, ...relative.split("/"));
  Deno.mkdirSync(dirname(target), { recursive: true });
  Deno.writeTextFileSync(target, content);
  return target;
}

function configFor(root: string): Config {
  return new Config({
    wiki: {
      input: [join(root, "wiki")],
      ...(pathExists(join(root, "assets"))
        ? { assets: [join(root, "assets")] }
        : {}),
    },
    config_root: root,
  });
}

Deno.test("a wikilink produces a backlink", () => {
  const root = tempRoot();
  try {
    write(root, "wiki/Alpha.md", "# Alpha\n\nSee [[Beta]].");
    write(root, "wiki/Beta.md", "# Beta\n\nContent.");
    const index = LinkIndex.fromConfig(configFor(root));
    assertEquals(index.backlinksTo("Beta"), ["Alpha"]);
  } finally {
    cleanup(root);
  }
});

Deno.test("a markdown link produces a backlink", () => {
  const root = tempRoot();
  try {
    write(root, "wiki/Alpha.md", "# Alpha\n\nSee [Beta](Beta.md).");
    write(root, "wiki/Beta.md", "# Beta\n\nContent.");
    const index = LinkIndex.fromConfig(configFor(root));
    assertEquals(index.backlinksTo("Beta"), ["Alpha"]);
  } finally {
    cleanup(root);
  }
});

Deno.test("an asset link is not a page backlink", () => {
  const root = tempRoot();
  try {
    write(root, "assets/logo.png", "png");
    write(root, "wiki/Page.md", "# Page\n\n![img](../assets/logo.png)");
    const index = LinkIndex.fromConfig(configFor(root));
    assertEquals(index.backlinksTo("logo"), []);
  } finally {
    cleanup(root);
  }
});

Deno.test("broken links come back from the index", () => {
  const root = tempRoot();
  try {
    write(root, "wiki/Page.md", "# Page\n\n[[Missing]].");
    const issues = LinkIndex.fromConfig(configFor(root)).brokenLinks();
    assert(issues.some((issue) => issue.issue_kind === "missing_document"));
  } finally {
    cleanup(root);
  }
});

Deno.test("a heading fragment is checked against the target's slugs", () => {
  const root = tempRoot();
  try {
    write(
      root,
      "wiki/Alpha.md",
      "[[Beta#Real Heading]]\n\n[[Beta#Absent One]]",
    );
    write(root, "wiki/Beta.md", "# Beta\n\n## Real Heading\n");
    const issues = LinkIndex.fromConfig(configFor(root)).brokenLinks();
    assertEquals(issues.length, 1);
    assertEquals(issues[0]?.issue_kind, "missing_heading");
    assertEquals(issues[0]?.raw_target, "Beta#Absent One");
  } finally {
    cleanup(root);
  }
});

Deno.test("the link audit matches the oracle, record for record", () => {
  const root = tempRoot();
  try {
    write(root, "assets/logo.png", "png");
    write(
      root,
      "wiki/Alpha.md",
      "---\ntype: TechArticle\n---\n" +
        "# Alpha\n\n" +
        "[[Missing]]\n\n" +
        "[[Beta#Nowhere]]\n\n" +
        "[[Beta#Real Heading]]\n\n" +
        "[Beta](Beta.md)\n\n" +
        "![img](../assets/logo.png)\n\n" +
        "`[[NotALink]]`\n\n" +
        "```\n[[AlsoNotALink]]\n```\n\n" +
        "[asset missing](../assets/nope.png)\n\n" +
        "[outside](../../elsewhere.md)\n",
    );
    write(
      root,
      "wiki/Beta.md",
      "---\ntype: TechArticle\n---\n# Beta\n\n## Real Heading\n\nBody.\n",
    );
    write(
      root,
      "wiki/Meta.md",
      "---\ntype: TechArticle\nrelated: wiki:Absent\nalso:\n  - wiki:Beta\n" +
        "image: ../assets/nope.png\nthumbnails:\n  - ../assets/logo.png\n---\n# Meta\n",
    );
    write(root, "outside.md", "# Outside\n");

    const config = configFor(root);
    const index = LinkIndex.fromConfig(config);
    assertEquals(index.backlinksTo("Beta"), ["Alpha"]);
    assertEquals(index.backlinksTo("Missing"), ["Alpha"]);
    assertEquals(index.backlinksTo("Alpha"), []);

    const issues = index.brokenLinks();
    assertEquals(
      issues.map((issue) => [
        issue.source_route,
        issue.link_kind,
        issue.raw_target,
        issue.issue_kind,
        issue.match_start,
        issue.full_match,
      ]),
      [
        ["Alpha", "WikiLink", "Missing", "missing_document", 35, "[[Missing]]"],
        [
          "Alpha",
          "WikiLink",
          "Beta#Nowhere",
          "missing_heading",
          48,
          "[[Beta#Nowhere]]",
        ],
        [
          "Alpha",
          "WikiLink",
          "AlsoNotALink",
          "missing_document",
          154,
          "[[AlsoNotALink]]",
        ],
        [
          "Alpha",
          "Asset link",
          "../assets/nope.png",
          "missing_asset",
          176,
          "[asset missing](../assets/nope.png)",
        ],
        [
          "Alpha",
          "Markdown link",
          "../../elsewhere.md",
          "missing_document",
          213,
          "[outside](../../elsewhere.md)",
        ],
        [
          "Meta",
          "Metadata reference",
          "wiki:Absent",
          "missing_document",
          null,
          null,
        ],
        [
          "Meta",
          "Frontmatter asset",
          "../assets/nope.png",
          "missing_asset",
          null,
          null,
        ],
      ],
    );
    assertEquals(issues.map((issue) => issue.message), [
      "In Alpha: Broken WikiLink [Missing] points to non-existent document.",
      "In Alpha: Broken WikiLink [Beta#Nowhere] points to missing heading '#nowhere'.",
      "In Alpha: Broken WikiLink [AlsoNotALink] points to non-existent document.",
      "In Alpha.md: Broken asset link [../assets/nope.png] points to missing asset: ../assets/nope.png.",
      "In Alpha: Broken Markdown link [../../elsewhere.md] points to non-existent document.",
      "In Meta: Broken Metadata reference [wiki:Absent] points to non-existent wiki document.",
      "In Meta.md: Broken frontmatter asset [../assets/nope.png] points to missing asset: ../assets/nope.png.",
    ]);
  } finally {
    cleanup(root);
  }
});

Deno.test("the file filter scopes which pages are audited", () => {
  const root = tempRoot();
  try {
    write(root, "wiki/Alpha.md", "[[Missing]]");
    write(root, "wiki/Beta.md", "[[AlsoMissing]]");
    const index = LinkIndex.fromConfig(configFor(root));
    assertEquals(index.brokenLinks().length, 2);
    assertEquals(
      index.brokenLinks(new Set(["Alpha"])).map((issue) => issue.raw_target),
      ["Missing"],
    );
  } finally {
    cleanup(root);
  }
});
