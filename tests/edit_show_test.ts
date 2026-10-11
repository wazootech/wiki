/**
 * `wiki show` / `wiki refs` — the read side of the write interface (wiki#355,
 * slice 2).
 *
 * The contract an agent leans on: `show`'s hash is exactly what an edit's
 * `expect` accepts, headings carry file line numbers, links resolve to paths,
 * and `refs` agrees with the link index about who links where.
 */

import { fromFileUrl, join } from "@std/path";
import { assert, assertEquals, assertThrows } from "@std/assert";

import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE } from "../src/wiki/cli.ts";
import { contentHash, EditUsageError } from "../src/wiki/edit.ts";
import { Wiki } from "../src/wiki/wiki.ts";

const CLI_ENTRY = fromFileUrl(new URL("../src/wiki/cli.ts", import.meta.url));
const DECODER = new TextDecoder();

const ALPHA = `---
'@type': schema:Article
schema:headline: Alpha
schema:keywords:
  - one
  - two
---

# Alpha

Links to [Beta](Beta.md) and [Gamma](Gamma.md), and to [Beta](Beta.md) again.

## Details

\`\`\`md
# Not a heading
\`\`\`

### Deeper
`;

const BETA = `---
'@type': schema:Article
schema:headline: Beta
---

# Beta

Back to [Alpha](Alpha.md).
`;

const GAMMA = `---
'@type': schema:Article
schema:headline: Gamma
---

# Gamma
`;

function writeWiki(): string {
  const root = Deno.makeTempDirSync({ prefix: "wiki-show-" });
  Deno.mkdirSync(join(root, "wiki"));
  Deno.writeTextFileSync(join(root, "wiki.yml"), "wiki:\n  input: [wiki]\n");
  for (
    const [name, content] of Object.entries({
      "Alpha.md": ALPHA,
      "Beta.md": BETA,
      "Gamma.md": GAMMA,
    })
  ) {
    Deno.writeTextFileSync(join(root, "wiki", name), content);
  }
  return root;
}

Deno.test("show reports frontmatter, JSON-LD, outline, links, and hash", async () => {
  const root = writeWiki();
  try {
    const wiki = Wiki.load(join(root, "wiki.yml"));
    const report = await wiki.show("wiki/Alpha.md");

    assertEquals(report.path, "wiki/Alpha.md");
    assertEquals(report.route, "Alpha");
    assertEquals(
      report.hash,
      contentHash(Deno.readFileSync(join(root, "wiki", "Alpha.md"))),
    );
    assertEquals(report.frontmatter?.["schema:headline"], "Alpha");
    assertEquals(report.frontmatter?.["schema:keywords"], ["one", "two"]);
    assert(report.jsonld !== null, "frontmatter compiles to JSON-LD");
    assert(
      JSON.stringify(report.jsonld).includes("Alpha"),
      "the JSON-LD carries the headline",
    );

    // The fenced `# Not a heading` is code, and lines count the frontmatter.
    assertEquals(
      report.headings.map((h) => [h.level, h.text, h.slug, h.line]),
      [
        [1, "Alpha", "alpha", 9],
        [2, "Details", "details", 13],
        [3, "Deeper", "deeper", 19],
      ],
    );
    // First-link order, deduplicated.
    assertEquals(report.links, [
      { route: "Beta", path: "wiki/Beta.md" },
      { route: "Gamma", path: "wiki/Gamma.md" },
    ]);
  } finally {
    Deno.removeSync(root, { recursive: true });
  }
});

Deno.test("show's hash is accepted as an edit's expect", async () => {
  const root = writeWiki();
  try {
    const wiki = Wiki.load(join(root, "wiki.yml"));
    const { hash } = await wiki.show("wiki/Gamma.md");
    const report = await wiki.edit({
      ops: [{
        op: "replace",
        path: "wiki/Gamma.md",
        content: GAMMA.replace("# Gamma", "# Gamma\n\nMore."),
        expect: hash,
      }],
    });
    assertEquals(report.status, "dry_run");
  } finally {
    Deno.removeSync(root, { recursive: true });
  }
});

Deno.test("refs lists inbound and outbound pages", () => {
  const root = writeWiki();
  try {
    const wiki = Wiki.load(join(root, "wiki.yml"));
    const beta = wiki.refs("wiki/Beta.md");
    assertEquals(beta.inbound, [{ route: "Alpha", path: "wiki/Alpha.md" }]);
    assertEquals(beta.outbound, [{ route: "Alpha", path: "wiki/Alpha.md" }]);

    const gamma = wiki.refs("wiki/Gamma.md");
    assertEquals(gamma.inbound, [{ route: "Alpha", path: "wiki/Alpha.md" }]);
    assertEquals(gamma.outbound, []);
  } finally {
    Deno.removeSync(root, { recursive: true });
  }
});

Deno.test("show and refs reject paths that are not wiki documents", async () => {
  const root = writeWiki();
  try {
    const wiki = Wiki.load(join(root, "wiki.yml"));
    assertThrows(() => wiki.refs("wiki/Missing.md"), EditUsageError);
    assertThrows(() => wiki.refs("wiki.yml"), EditUsageError);
    let threw = false;
    try {
      await wiki.show("wiki/Missing.md");
    } catch (error) {
      threw = error instanceof EditUsageError;
    }
    assert(threw, "show rejects a missing page with EditUsageError");
  } finally {
    Deno.removeSync(root, { recursive: true });
  }
});

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

Deno.test(
  "wiki show and wiki refs: output formats and exit codes",
  { permissions: { run: true, read: true, write: true } },
  async () => {
    const root = writeWiki();
    try {
      const json = await runCli(root, ["show", "wiki/Alpha.md", "--json"]);
      assertEquals(json.code, EXIT_OK, json.stderr);
      const parsed = JSON.parse(json.stdout);
      assertEquals(parsed.version, 1);
      assertEquals(parsed.route, "Alpha");

      const text = await runCli(root, ["show", "wiki/Alpha.md"]);
      assertEquals(text.code, EXIT_OK, text.stderr);
      assert(text.stdout.includes("hash: "));
      assert(text.stdout.includes("## Details (line 13)"));

      const field = await runCli(root, [
        "show",
        "wiki/Alpha.md",
        "--field",
        "schema:headline",
      ]);
      assertEquals(field.code, EXIT_OK, field.stderr);
      assertEquals(field.stdout.trim(), "Alpha");

      const listField = await runCli(root, [
        "show",
        "wiki/Alpha.md",
        "--field=schema:keywords",
        "--json",
      ]);
      assertEquals(JSON.parse(listField.stdout), ["one", "two"]);

      const unset = await runCli(root, [
        "show",
        "wiki/Alpha.md",
        "--field",
        "schema:author",
      ]);
      assertEquals(unset.code, EXIT_FAILURE);

      const refs = await runCli(root, ["refs", "wiki/Gamma.md", "--json"]);
      assertEquals(refs.code, EXIT_OK, refs.stderr);
      assertEquals(JSON.parse(refs.stdout).inbound, [
        { route: "Alpha", path: "wiki/Alpha.md" },
      ]);

      assertEquals((await runCli(root, ["show"])).code, EXIT_USAGE);
      assertEquals(
        (await runCli(root, ["show", "wiki/Missing.md"])).code,
        EXIT_USAGE,
      );
      assertEquals(
        (await runCli(root, ["refs", "wiki/Gamma.md", "--field", "x"])).code,
        EXIT_USAGE,
        "--field belongs to show only",
      );
      const help = await runCli(root, ["show", "--help"]);
      assertEquals(help.code, EXIT_OK);
      assert(help.stdout.includes("Usage: wiki show"));
    } finally {
      Deno.removeSync(root, { recursive: true });
    }
  },
);
