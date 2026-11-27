import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { dirname, join } from "@std/path";
import { Config } from "../src/wiki/config.ts";
import { Wiki } from "../src/wiki/wiki.ts";

function write(root: string, relative: string, content: string): void {
  const path = join(root, ...relative.split("/"));
  Deno.mkdirSync(dirname(path), { recursive: true });
  Deno.writeTextFileSync(path, content);
}

function page(title: string, body = "", visibility?: string): string {
  const flag = visibility === undefined
    ? ""
    : `wazoo:visibility: ${visibility}\n`;
  return `---\ntype: TechArticle\n${flag}---\n\n# ${title}\n\n${body}\n`;
}

async function withWiki(
  files: Record<string, string>,
  run: (wiki: Wiki, root: string) => Promise<void>,
): Promise<void> {
  const root = Deno.makeTempDirSync({ prefix: "wiki-public-" });
  try {
    for (const [path, content] of Object.entries(files)) {
      write(root, path, content);
    }
    const config = Config.forRoot(root, {
      graph: { base_iri: "https://brain.example.org/" },
      site: { base_url: "" },
    });
    await run(new Wiki(config), root);
  } finally {
    Deno.removeSync(root, { recursive: true });
  }
}

const build = (wiki: Wiki, root: string, publicOnly = true) =>
  wiki.build(join(root, "_public"), { publicOnly, noCheck: true });

Deno.test("public build writes only pages marked public", async () => {
  await withWiki({
    "wiki/Open.md": page(
      "Open",
      "See [Also](Also_Open.md), [home](https://brain.example.org/), " +
        "[Also again](https://brain.example.org/Also_Open#top), " +
        "[elsewhere](https://example.com/Secret) and [here](#open).",
      "public",
    ),
    "wiki/Also_Open.md": page("Also Open", "", "public"),
    "wiki/Secret.md": page("Secret", "Hidden [Open](Open.md)."),
    "wiki/Stated_(private)[1].md": page("Stated", "", "private"),
    "assets/photo.txt": "private asset",
  }, async (wiki, root) => {
    const result = await build(wiki, root);
    assertEquals(result.error_message ?? null, null);
    const written = result.written_paths.map((path) =>
      path.replaceAll("\\", "/")
    );
    assertEquals(written.sort(), [
      "Also_Open/index.html",
      "Open/index.html",
      "index.html",
    ]);
    const index = Deno.readTextFileSync(join(root, "_public", "index.html"));
    assertStringIncludes(index, "Also Open");
    assert(!index.includes("Secret"));
    assert(!index.includes("Stated"));

    const full = await build(wiki, root, false);
    assertEquals(full.page_count, 4);
    assertEquals(full.asset_count, 1);
  });
});

Deno.test("public build publishes nothing without a flag", async () => {
  await withWiki(
    { "wiki/Secret.md": page("Secret") },
    async (wiki, root) => {
      const result = await build(wiki, root);
      assertEquals(result.ok, true);
      assertEquals(result.page_count, 0);
      assertEquals(result.written_paths, ["index.html"]);
    },
  );
});

const LEAKS: Record<string, string> = {
  "a markdown link": "[x](Secret.md)",
  "a reference link": "[x][ref]\n\n[ref]: Secret.md",
  "a wikilink": "[[Secret]]",
  "a site path": "[x](/Secret/)",
  "a full IRI": "[x](https://brain.example.org/Secret)",
  "a bare autolink": "<https://BRAIN.example.org/Secret>",
  "a protocol-relative link": "[x](//brain.example.org/Secret)",
  "an image asset": "![x](../assets/photo.png)",
  "a query block":
    "<!-- sparql:start -->\n\n```sparql\nSELECT ?s WHERE { ?s ?p ?o }\n```\n\n<!-- sparql:end -->",
};

for (const [name, body] of Object.entries(LEAKS)) {
  Deno.test(`public build refuses ${name}`, async () => {
    await withWiki({
      "wiki/Open.md": page("Open", body, "public"),
      "wiki/Secret.md": page("Secret"),
      "assets/photo.png": "private asset",
    }, async (wiki, root) => {
      const result = await build(wiki, root);
      assertEquals(result.ok, false);
      assertStringIncludes(result.error_message ?? "", "wiki/Open.md");
      assertEquals(result.written_paths, []);
    });
  });
}

Deno.test("public build refuses a misspelled visibility", async () => {
  await withWiki(
    { "wiki/Open.md": page("Open", "", "Public") },
    async (wiki, root) => {
      const result = await build(wiki, root);
      assertEquals(result.ok, false);
      assertStringIncludes(result.error_message ?? "", "wazoo:visibility");
    },
  );
});
