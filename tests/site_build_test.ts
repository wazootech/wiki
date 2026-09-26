import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from "@std/assert";
import { Config } from "../src/wiki/config.ts";
import { BuildError } from "../src/wiki/errors.ts";
import { Path } from "../src/wiki/fspath.ts";
import { AuditReport } from "../src/wiki/schemas/reports.ts";
import { buildSite } from "../src/wiki/site/build.ts";
import { buildStaticSite } from "../src/wiki/site/publish.ts";
import { Wiki } from "../src/wiki/wiki.ts";

function tempRoot(): Path {
  return new Path(Deno.makeTempDirSync({ prefix: "wiki-site-build-" }));
}

function write(root: Path, relative: string, content: string): Path {
  const path = root.joinpath(...relative.split("/"));
  Deno.mkdirSync(path.parent.toString(), { recursive: true });
  Deno.writeTextFileSync(path.toString(), content);
  return path;
}

function cleanup(root: Path): void {
  Deno.removeSync(root.toString(), { recursive: true });
}

Deno.test("buildSite globally sorts pages and filters excluded documents", () => {
  const root = tempRoot();
  try {
    write(root, "wiki-z/Zulu.md", "# Zulu\n");
    write(root, "wiki-a/Alpha.md", "# Alpha\n");
    write(root, "wiki-a/drafts/Hidden.md", "# Hidden\n");
    const config = Config.forRoot(root, {
      wiki: {
        input: [root.joinpath("wiki-z"), root.joinpath("wiki-a")],
        exclude: ["wiki-a/drafts/**"],
      },
    });

    const site = buildSite(config);

    assertEquals(site.pages.map((page) => page.file_slug), ["Alpha", "Zulu"]);
    assertEquals(site.pages_by_route.has("drafts/Hidden"), false);
  } finally {
    cleanup(root);
  }
});

Deno.test("buildSite maps Markdown links and data documents to canonical routes", () => {
  const root = tempRoot();
  try {
    const wikiDir = root.joinpath("wiki");
    write(
      root,
      "wiki/People/Ethan_Davidson.md",
      "---\nid: wiki:Ethan_Davidson\nheadline: Ethan Davidson\n---\n\n" +
        "# Ethan Davidson\n\nSee [Princeton](../Places/Princeton.md).\n",
    );
    write(
      root,
      "wiki/Places/Princeton.yaml",
      "id: wiki:Princeton\nname: Princeton\ntype: schema:Place\n",
    );
    const config = Config.forRoot(root, {
      wiki: { input: [wikiDir] },
      site: { base_url: "/manual", url_style: "file" },
    });

    const site = buildSite(config);
    const ethan = site.pages_by_route.get("People/Ethan_Davidson");
    const princeton = site.pages_by_route.get("Places/Princeton");

    assert(ethan !== undefined);
    assert(princeton !== undefined);
    assertEquals(ethan.title, "Ethan Davidson");
    assertEquals(princeton.title, "Princeton");
    assert(ethan.wiki_ids.includes("wiki:Ethan_Davidson"));
    assertStringIncludes(
      ethan.html,
      'href="/manual/Places/Princeton.html"',
    );
  } finally {
    cleanup(root);
  }
});

Deno.test("buildStaticSite writes selected layouts, routes, and filtered assets", async () => {
  const root = tempRoot();
  try {
    write(
      root,
      "wiki.yaml",
      "wiki:\n  input: [wiki]\n  assets: [assets]\n" +
        "  exclude: [assets/private/**]\n" +
        "site:\n  base_url: /wiki\n  url_style: dir\n" +
        "  layout: layouts/default.html\n",
    );
    write(
      root,
      "layouts/default.html",
      '<html><head>%wiki.head%</head><body data-base="%wiki.base_url%">%wiki.body%</body></html>',
    );
    write(
      root,
      "layouts/article.html",
      '<article data-layout="article">%wiki.body%</article>',
    );
    write(
      root,
      "wiki/index.md",
      "# Home\n\nWelcome to the manual.\n",
    );
    write(
      root,
      "wiki/People/Ethan.md",
      "---\nheadline: Ethan\n'wazoo:layout': layouts/article.html\n---\n\n" +
        "# Ethan\n\nRead [Princeton](../Places/Princeton.md).\n",
    );
    write(root, "wiki/Places/Princeton.md", "# Princeton\n");
    const css = "/* keep formatting */\nbody { color: navy; }\n";
    write(root, "assets/site.css", css);
    write(root, "assets/private/secret.css", "body { display: none; }\n");
    write(root, "_site/manual/stale.txt", "stale output\n");
    const wiki = new Wiki(Config.load(root.joinpath("wiki.yaml")));
    const output = root.joinpath("_site");

    const result = await buildStaticSite(wiki, {
      output_dir: output,
      base_url: "/manual/",
      url_style: "file",
      skip_preflight: true,
    });

    assert(result.ok);
    assertEquals(result.page_count, 3);
    assertEquals(result.asset_count, 1);
    const ethanHtml = Deno.readTextFileSync(
      output.joinpath("manual/People/Ethan.html").toString(),
    );
    assertStringIncludes(ethanHtml, 'data-layout="article"');
    assertStringIncludes(
      ethanHtml,
      'href="/manual/Places/Princeton.html"',
    );
    assertEquals(
      Deno.readTextFileSync(
        output.joinpath("manual/assets/site.css").toString(),
      ),
      css,
    );
    assertEquals(
      output.joinpath("manual/assets/private/secret.css").exists(),
      false,
    );
    assertEquals(output.joinpath("manual/stale.txt").exists(), false);
    assertEquals(
      Deno.readTextFileSync(
        output.joinpath("manual/index.html").toString(),
      ).includes("All Pages"),
      false,
    );
  } finally {
    cleanup(root);
  }
});

Deno.test("output collisions are reported before the previous site is cleaned", async () => {
  const root = tempRoot();
  try {
    write(root, "wiki/Page.md", "# Page\n");
    write(root, "wiki/assets/foo.md", "# Conflicting route\n");
    write(root, "assets/foo/index.html", "asset\n");
    const config = Config.forRoot(root, {
      wiki: {
        input: [root.joinpath("wiki")],
        assets: [root.joinpath("assets")],
      },
    });
    const output = root.joinpath("_site");
    write(root, "_site/wiki/keep.txt", "previous site\n");

    const result = await buildStaticSite(new Wiki(config), {
      output_dir: output,
      skip_preflight: true,
    });

    assertEquals(result.ok, false);
    assert(
      result.preflight?.errors.some((issue) =>
        issue.code === "output_collision"
      ),
    );
    assertEquals(
      Deno.readTextFileSync(output.joinpath("wiki/keep.txt").toString()),
      "previous site\n",
    );
  } finally {
    cleanup(root);
  }
});

Deno.test("build refuses to clean an output path that is the source tree", async () => {
  const root = tempRoot();
  try {
    const source = write(root, "wiki/Keep.md", "# Keep\n");
    const wiki = new Wiki(
      Config.forRoot(root, { wiki: { input: [root.joinpath("wiki")] } }),
    );

    await assertRejects(
      () =>
        buildStaticSite(wiki, {
          output_dir: root,
          skip_preflight: true,
        }),
      BuildError,
      "refusing to clean build output path",
    );

    assertEquals(Deno.readTextFileSync(source.toString()), "# Keep\n");
  } finally {
    cleanup(root);
  }
});

Deno.test("build render flags are forwarded, while failed preflight preserves output", async () => {
  const root = tempRoot();
  try {
    write(root, "wiki/Page.md", "# Page\n");
    const wiki = new Wiki(
      Config.forRoot(root, { wiki: { input: [root.joinpath("wiki")] } }),
    );
    const output = root.joinpath("_site");
    write(root, "_site/wiki/keep.txt", "previous site\n");
    const received: unknown[] = [];
    wiki.render = (_files, options) => {
      received.push(options);
      return Promise.resolve({
        ok: true,
        updated_count: 0,
        error_count: 0,
        stale_files: [],
        render_errors: [],
      });
    };
    wiki.preflight = () =>
      Promise.resolve(
        new AuditReport({
          ok: false,
          errors: [{
            code: "fixture",
            message: "failed checks",
            severity: "error",
          }],
        }),
      );

    const result = await buildStaticSite(wiki, {
      output_dir: output,
      render_first: true,
      reload_graph: true,
      disk_cache: true,
    });

    assertEquals(received, [{ reload: true, cache: true }]);
    assertEquals(result.ok, false);
    assertEquals(result.preflight?.errors[0]?.message, "failed checks");
    assertEquals(
      Deno.readTextFileSync(output.joinpath("wiki/keep.txt").toString()),
      "previous site\n",
    );
  } finally {
    cleanup(root);
  }
});
