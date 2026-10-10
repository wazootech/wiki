/**
 * `wiki mv` and `wiki rm` — the graph verbs (wiki#355, slice 4).
 *
 * The promises under test: a move leaves no link behind (body links in every
 * style, frontmatter `wiki:` CURIEs, and the page's own relative links), a
 * finding the moved page already had is not blamed on the move, and a delete
 * never leaves a link dangling unless asked to prune it.
 */

import { fromFileUrl, join } from "@std/path";
import { assert, assertEquals } from "@std/assert";

import { EXIT_CONFLICT, EXIT_FAILURE, EXIT_OK } from "../src/wiki/cli.ts";
import { contentHash } from "../src/wiki/edit.ts";
import {
  pruneLinksTo,
  rewriteLinkTargets,
  rewriteMetadataRefs,
} from "../src/wiki/link_fix.ts";
import { Wiki } from "../src/wiki/wiki.ts";
import { LinkIndex } from "../src/wiki/wiki_links.ts";

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

function article(title: string, body = ""): string {
  return `---\n'@type': schema:Article\nschema:headline: ${title}\n---\n\n# ${title}\n${
    body === "" ? "" : `\n${body}\n`
  }`;
}

function writeWiki(pages: Record<string, string>): string {
  const root = Deno.makeTempDirSync({ prefix: "wiki-graph-verbs-" });
  Deno.writeTextFileSync(join(root, "wiki.yml"), "wiki:\n  input: [wiki]\n");
  for (const [name, content] of Object.entries(pages)) {
    const path = join(root, "wiki", ...name.split("/"));
    Deno.mkdirSync(join(path, ".."), { recursive: true });
    Deno.writeTextFileSync(path, content);
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

async function runCli(
  root: string,
  args: readonly string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  const output = await new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", CLI_ENTRY, "-c", join(root, "wiki.yml"), ...args],
    cwd: root,
    stdout: "piped",
    stderr: "piped",
  }).output();
  return {
    code: output.code,
    stdout: DECODER.decode(output.stdout),
    stderr: DECODER.decode(output.stderr),
  };
}

Deno.test("rewriteLinkTargets keeps each link's own style", () => {
  const content = [
    "See [Beta](Beta.md), [b](./Beta.md#Early_life), [[Beta]], [[Beta|the b]],",
    "[[Beta#Bio]], [self](#Top), [Gamma](Gamma.md), and `[code](Beta.md)`.",
  ].join("\n");
  const out = rewriteLinkTargets(
    content,
    "Alpha",
    new Map([["Beta", "people/Beta_(person)"]]),
  );
  assertEquals(
    out,
    [
      "See [Beta](people/Beta_%28person%29.md), " +
      "[b](./people/Beta_%28person%29.md#Early_life), " +
      "[[people/Beta_(person)]], [[people/Beta_(person)|the b]],",
      "[[people/Beta_(person)#Bio]], [self](#Top), [Gamma](Gamma.md), and `[code](Beta.md)`.",
    ].join("\n"),
  );
});

Deno.test("a page moving directories re-derives its own relative links", () => {
  const content = "Up to [Index](../Home.md) and [Peer](Peer.md).";
  const out = rewriteLinkTargets(
    content,
    "sub/Page",
    new Map([["sub/Page", "Page"]]),
    "Page",
  );
  assertEquals(out, "Up to [Index](Home.md) and [Peer](sub/Peer.md).");
});

Deno.test("rewriteMetadataRefs is token-exact and leaves @id alone", () => {
  const yaml = [
    "---",
    "'@id': wiki:Beta",
    "schema:knows: wiki:Beta",
    "schema:about: [wiki:Beta.md#Bio, wiki:Beta_Two]",
    'schema:creator: "https://w.example/Beta"',
    "schema:url: https://w.example/Beta/sub",
    "---",
    "",
  ].join("\n");
  const out = rewriteMetadataRefs(yaml, [
    { from: "wiki:Beta", to: "wiki:Gamma" },
    { from: "https://w.example/Beta", to: "https://w.example/Gamma" },
  ]);
  assertEquals(
    out,
    [
      "---",
      "'@id': wiki:Beta",
      "schema:knows: wiki:Gamma",
      "schema:about: [wiki:Gamma.md#Bio, wiki:Beta_Two]",
      'schema:creator: "https://w.example/Gamma"',
      "schema:url: https://w.example/Beta/sub",
      "---",
      "",
    ].join("\n"),
  );
});

Deno.test("pruneLinksTo leaves each link's label", () => {
  const out = pruneLinksTo(
    "A [Beta](Beta.md) and [[Beta|b]] and [[Beta]] and [Gamma](Gamma.md).",
    "Alpha",
    new Set(["Beta"]),
  );
  assertEquals(out, "A Beta and b and Beta and [Gamma](Gamma.md).");
});

Deno.test("mv moves the page and repoints every link to it", async () => {
  const root = writeWiki({
    "Alpha.md":
      `---\n'@type': schema:Article\nschema:headline: Alpha\nschema:knows: wiki:Beta\n---\n\n# Alpha\n\nSee [Beta](Beta.md#Bio) and [[Beta]].\n`,
    "Beta.md": article("Beta", "## Bio\n\nBack to [Alpha](Alpha.md)."),
    "sub/Deep.md": article("Deep", "Up to [Beta](../Beta.md)."),
  });
  try {
    const wiki = Wiki.load(root);
    const report = await wiki.edit({
      ops: [{
        op: "move",
        from: "wiki/Beta.md",
        to: "wiki/people/Beta.md",
        expect: contentHash(read(root, "wiki/Beta.md")),
      }],
    }, { apply: true });
    assertEquals(report.status, "applied", JSON.stringify(report.introduced));
    assertEquals(report.introduced, []);
    assert(!exists(root, "wiki/Beta.md"));
    assert(
      read(root, "wiki/people/Beta.md").includes("[Alpha](../Alpha.md)"),
    );
    const alpha = read(root, "wiki/Alpha.md");
    assert(alpha.includes("[Beta](people/Beta.md#Bio)"), alpha);
    assert(alpha.includes("[[people/Beta]]"), alpha);
    assert(alpha.includes("schema:knows: wiki:people/Beta"), alpha);
    assert(
      read(root, "wiki/sub/Deep.md").includes("[Beta](../people/Beta.md)"),
    );

    const index = LinkIndex.fromConfig(Wiki.load(root).config);
    assertEquals(index.backlinksTo("Beta"), []);
    assertEquals(
      index.brokenLinks().filter((issue) =>
        issue.issue_kind !== "missing_asset"
      ),
      [],
    );
  } finally {
    cleanup(root);
  }
});

Deno.test("a finding the moved page already had is not blamed on the move", async () => {
  const root = writeWiki({
    "Article_Shape.md": ARTICLE_SHAPE,
    // No headline (a SHACL violation) and a broken link (a lint warning).
    "Broken.md":
      `---\n'@type': schema:Article\n---\n\n# Broken\n\nSee [Nowhere](Nowhere.md).\n`,
    "Linker.md": article("Linker", "To [Broken](Broken.md)."),
  });
  try {
    const report = await Wiki.load(root).edit({
      ops: [{ op: "move", from: "wiki/Broken.md", to: "wiki/Still_Broken.md" }],
    }, { apply: true });
    assertEquals(report.introduced, []);
    assertEquals(report.status, "applied");
    assert(read(root, "wiki/Linker.md").includes("(Still_Broken.md)"));
  } finally {
    cleanup(root);
  }
});

Deno.test("a move onto an existing page is a conflict that writes nothing", async () => {
  const root = writeWiki({
    "Alpha.md": article("Alpha", "See [Beta](Beta.md)."),
    "Beta.md": article("Beta"),
  });
  try {
    const cli = await runCli(root, [
      "mv",
      "wiki/Beta.md",
      "wiki/Alpha.md",
      "--apply",
    ]);
    assertEquals(cli.code, EXIT_CONFLICT, cli.stderr);
    assertEquals(read(root, "wiki/Beta.md"), article("Beta"));

    const stale = await runCli(root, [
      "mv",
      "wiki/Beta.md",
      "wiki/Gamma.md",
      "--expect",
      contentHash("something else"),
      "--apply",
    ]);
    assertEquals(stale.code, EXIT_CONFLICT, stale.stderr);
    assert(exists(root, "wiki/Beta.md"));
    assert(!exists(root, "wiki/Gamma.md"));
  } finally {
    cleanup(root);
  }
});

Deno.test("rm refuses while pages link in, then prunes on request", async () => {
  const root = writeWiki({
    "Alpha.md": article("Alpha", "See [the beta](Beta.md) and [[Beta]]."),
    "Beta.md": article("Beta"),
  });
  try {
    const refused = await runCli(root, ["rm", "wiki/Beta.md", "--apply"]);
    assertEquals(refused.code, EXIT_FAILURE, refused.stderr);
    assert(refused.stderr.includes("Alpha links to Beta"), refused.stderr);
    assert(exists(root, "wiki/Beta.md"));

    const json = await runCli(root, ["rm", "wiki/Beta.md", "--json"]);
    const report = JSON.parse(json.stdout);
    assertEquals(report.status, "rejected");
    assertEquals(report.introduced[0].code, "dangling_links");
    assertEquals(report.introduced[0].path, "wiki/Alpha.md");

    const pruned = await runCli(root, [
      "rm",
      "wiki/Beta.md",
      "--prune-links",
      "--apply",
    ]);
    assertEquals(pruned.code, EXIT_OK, pruned.stderr);
    assert(!exists(root, "wiki/Beta.md"));
    assertEquals(
      read(root, "wiki/Alpha.md"),
      article("Alpha", "See the beta and Beta."),
    );
  } finally {
    cleanup(root);
  }
});

Deno.test("rm of an unlinked page needs no flag", async () => {
  const root = writeWiki({
    "Alpha.md": article("Alpha"),
    "Beta.md": article("Beta", "To [Alpha](Alpha.md)."),
  });
  try {
    const cli = await runCli(root, ["rm", "wiki/Beta.md", "--apply"]);
    assertEquals(cli.code, EXIT_OK, cli.stderr);
    assert(!exists(root, "wiki/Beta.md"));
  } finally {
    cleanup(root);
  }
});
