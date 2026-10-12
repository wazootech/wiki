import { dirname, join } from "@std/path";
import {
  assert,
  assertEquals,
  assertStringIncludes,
  assertThrows,
} from "@std/assert";
import {
  buildAssetManifest,
  buildIndexHtml,
  buildPageHtml,
  buildSite,
  buildStaticSite,
  Config,
  exportFrontmatter,
  isExternalLink,
  isFile,
  iterAssetFiles,
  METADATA_VIEWS,
  pageOutputPath,
  pageUrl,
  pathExists,
  relativeWithin,
  renderLayout,
  renderOutlineTitle,
  renderPageLayout,
  renderWikiMarkdown,
  resolvePageRoute,
  type TocItem,
  type VirtualPage,
  type WikiSite,
} from "../src/wiki/theme.ts";
import { Wiki } from "../src/wiki/mod.ts";

function tempRoot(): string {
  return Deno.makeTempDirSync({ prefix: "wiki-theme-" });
}

function write(root: string, relative: string, content: string): string {
  const path = join(root, ...relative.split("/"));
  Deno.mkdirSync(dirname(path), { recursive: true });
  Deno.writeTextFileSync(path, content);
  return path;
}

function cleanup(root: string): void {
  Deno.removeSync(root, { recursive: true });
}

function fixtureConfig(root: string): Config {
  write(
    root,
    "wiki/Home.md",
    "---\nheadline: Home\n---\n\n# Home\n\n## Getting Started\n\nSee [Other](Other.md).\n",
  );
  write(root, "wiki/Other.md", "# Other\n");
  write(root, "assets/site.css", "body { color: navy; }\n");
  return Config.forRoot(root, {
    wiki: { input: [join(root, "wiki")], assets: [join(root, "assets")] },
    site: { base_url: "/manual", url_style: "file" },
  });
}

Deno.test("theme entrypoint assembles a site from the published surface", () => {
  const root = tempRoot();
  try {
    const config = fixtureConfig(root);

    const site: WikiSite = buildSite(config);
    assertEquals(site.pages.map((page) => page.file_slug), ["Home", "Other"]);
    const home: VirtualPage = site.pages_by_route.get("Home")!;
    assertEquals(home.title, "Home");
    assertStringIncludes(home.html, 'href="/manual/Other.html"');
    const outline: readonly TocItem[] = home.outline;
    assertEquals(outline.map((item) => item.slug), ["getting-started"]);
  } finally {
    cleanup(root);
  }
});

Deno.test("theme entrypoint renders markdown, titles, and layouts", () => {
  const root = tempRoot();
  try {
    const config = fixtureConfig(root);
    const site = buildSite(config);
    const home = site.pages_by_route.get("Home")!;

    assertStringIncludes(
      renderWikiMarkdown("See [Other](Other.md)", "/manual", "file", "Home"),
      'href="/manual/Other.html"',
    );
    assertEquals(
      renderOutlineTitle("Home", "/manual", "file", "Home"),
      "Home",
    );

    const shell = renderLayout("T", "/manual", "<p>body</p>", null);
    assertStringIncludes(shell, "<p>body</p>");
    assertStringIncludes(
      renderPageLayout(home, "/manual", null),
      'href="/manual/Other.html"',
    );
    assertStringIncludes(
      buildPageHtml(home, "/manual", null),
      'href="/manual/Other.html"',
    );
    assertStringIncludes(buildIndexHtml(site, "/manual", "file", null), "Home");
  } finally {
    cleanup(root);
  }
});

Deno.test("theme entrypoint exposes paths, assets, and link helpers", () => {
  const root = tempRoot();
  try {
    const config = fixtureConfig(root);
    const out = join(root, "_out");

    const manifest = buildAssetManifest(config, out, "/manual");
    assertEquals(manifest.length, 1);
    assertEquals(manifest[0]!.public_url, "/manual/assets/site.css");
    assertEquals(iterAssetFiles(config).length, 1);

    assertEquals(pageUrl("/manual", "Home", "file"), "/manual/Home.html");
    assertEquals(pageOutputPath(out, "Home", "file"), join(out, "Home.html"));

    assert(isExternalLink("https://example.test"));
    assert(!isExternalLink("Other.md"));
    assertEquals(resolvePageRoute("Home", "Other.md"), "Other");
    assert(METADATA_VIEWS.length > 0);

    assert(isFile(join(root, "wiki", "Home.md")));
    assert(!pathExists(join(root, "missing")));
    assertStringIncludes(
      relativeWithin(join(root, "wiki", "Home.md"), join(root, "wiki")),
      "Home.md",
    );
    assertThrows(() => relativeWithin(root, join(root, "wiki")));
  } finally {
    cleanup(root);
  }
});

Deno.test("theme entrypoint drives a full static build", async () => {
  const root = tempRoot();
  try {
    write(
      root,
      "wiki.yaml",
      "wiki:\n  input: [wiki]\n  assets: [assets]\n" +
        "site:\n  base_url: /wiki\n  url_style: dir\n" +
        "  layout: layouts/default.html\n",
    );
    write(
      root,
      "layouts/default.html",
      '<html><head>%wiki.head%</head><body data-base="%wiki.base_url%">%wiki.body%</body></html>',
    );
    write(root, "wiki/index.md", "# Home\n\nWelcome.\n");
    write(root, "wiki/People/Ethan.md", "# Ethan\n");
    write(root, "assets/site.css", "body { color: navy; }\n");
    const wiki = new Wiki(Config.load(join(root, "wiki.yaml")));
    const output = join(root, "_site");

    const result = await buildStaticSite(wiki, {
      output_dir: output,
      skip_preflight: true,
    });

    assert(result.ok);
    assertEquals(result.page_count, 2);
    assertEquals(result.asset_count, 1);
    assert(pathExists(join(output, "wiki", "index.html")));
    assertStringIncludes(
      Deno.readTextFileSync(
        join(output, "wiki", "People", "Ethan", "index.html"),
      ),
      "Ethan",
    );
    assert(pathExists(join(output, "wiki", "assets", "site.css")));
  } finally {
    cleanup(root);
  }
});

Deno.test("theme entrypoint exports frontmatter", async () => {
  const root = tempRoot();
  try {
    const config = fixtureConfig(root);
    const result = await exportFrontmatter(config);
    assert(result.ok);
  } finally {
    cleanup(root);
  }
});
