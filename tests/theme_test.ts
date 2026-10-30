import { join } from "@std/path";
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
  buildThemedSite,
  Config,
  escapeHtml,
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
  substitute,
  type TocItem,
  type VirtualPage,
  type WikiSite,
} from "../src/wiki/theme.ts";
import { Wiki } from "../src/wiki/mod.ts";
import { cleanup, fixtureConfig, tempRoot, write } from "./theme_support.ts";

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

Deno.test("theme entrypoint lets a theme supply its own layout tokens", () => {
  const root = tempRoot();
  try {
    const template = write(
      root,
      "layouts/tokens.html",
      "<html><head>%wiki.head%</head>\n" +
        '<body data-base="%wiki.base_url%" data-slug="%wiki.slug%">' +
        "%wiki.toc%%wiki.body%</body></html>",
    );

    // Defaults: the three built-in slots render exactly as before and an
    // unknown slot is left verbatim. An empty map changes nothing.
    const defaults = renderLayout("T", "/manual", "<p>body</p>", template);
    assertStringIncludes(defaults, "<title>T - Wiki CLI</title>");
    assertStringIncludes(defaults, 'data-base="/manual"');
    assertStringIncludes(defaults, "<p>body</p>");
    assertStringIncludes(
      defaults,
      '<body data-base="/manual" data-slug="%wiki.slug%">%wiki.toc%',
    );
    assertEquals(
      defaults,
      renderLayout("T", "/manual", "<p>body</p>", template, new Map()),
    );

    // Extra tokens fill the theme's own slots.
    const withExtra = renderLayout(
      "T",
      "/manual",
      "<p>body</p>",
      template,
      new Map([
        ["%wiki.slug%", "Home"],
        ["%wiki.toc%", "<nav>toc</nav>"],
      ]),
    );
    assertStringIncludes(withExtra, 'data-slug="Home"');
    assertStringIncludes(withExtra, "<nav>toc</nav>");
    assert(!withExtra.includes("%wiki."));

    // An extra token wins over a built-in one on collision.
    const overridden = renderLayout(
      "T",
      "/manual",
      "<p>body</p>",
      template,
      new Map([["%wiki.base_url%", "/elsewhere"]]),
    );
    assertStringIncludes(overridden, 'data-base="/elsewhere"');
    assert(!overridden.includes('data-base="/manual"'));
    assertStringIncludes(overridden, "<title>T - Wiki CLI</title>");
  } finally {
    cleanup(root);
  }
});

Deno.test("theme entrypoint forwards extra layout tokens to pages", () => {
  const root = tempRoot();
  try {
    const config = fixtureConfig(root);
    const site = buildSite(config);
    const home = site.pages_by_route.get("Home")!;
    const template = write(
      root,
      "layouts/page.html",
      '<article data-slug="%wiki.slug%">%wiki.body%</article>',
    );

    const rendered = renderPageLayout(
      home,
      "/manual",
      template,
      new Map([["%wiki.slug%", home.file_slug]]),
    );
    assertStringIncludes(rendered, '<article data-slug="Home">');
    assertStringIncludes(rendered, 'href="/manual/Other.html"');

    // Without the map the theme's slot stays literal, as before.
    assertStringIncludes(
      renderPageLayout(home, "/manual", template),
      'data-slug="%wiki.slug%"',
    );
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

Deno.test("buildThemedSite owns the flow while the theme owns the vocabulary", async () => {
  const root = tempRoot();
  try {
    write(
      root,
      "theme/layouts/theme.html",
      "<html><head>%wiki.head%</head>" +
        '<body data-kind="%wiki.page_kind%" data-extra="%wiki.extra%">' +
        "%wiki.toc%%wiki.body%%wiki.metadata_pane%</body></html>",
    );
    write(
      root,
      "theme/layouts/redirect.html",
      '<html><head><meta http-equiv="refresh" content="0; url=' +
        '%wiki.redirect_url%"></head><body>moved</body></html>',
    );
    write(
      root,
      "wiki/Home.md",
      "---\nid: wiki:Home\ntype: schema:TechArticle\n---\n\n" +
        "# Home\n\n## Section\n\nSee [Other](Other.md).\n",
    );
    write(root, "wiki/Other.md", "# Other\n");
    write(
      root,
      "wiki/Legacy.md",
      "---\nredirect_to: Home\n---\n\n# Legacy\n",
    );
    write(root, "assets/site.css", "body { color: navy; }\n");
    const config = Config.forRoot(root, {
      wiki: { input: [join(root, "wiki")], assets: [join(root, "assets")] },
      site: { base_url: "/manual", url_style: "dir" },
    });
    const output = join(root, "_site");

    const written = await buildThemedSite(config, output, {
      dir: join(root, "theme"),
      layout: "layouts/theme.html",
      redirect_layout: "layouts/redirect.html",
      title_suffix: " - Custom",
      tokens: (context) => {
        const redirectTo = context.page === null
          ? ""
          : String(context.page.frontmatter.redirect_to ?? "");
        return new Map([
          [
            "%wiki.extra%",
            context.page === null ? "index" : context.page.file_slug,
          ],
          [
            "%wiki.redirect_url%",
            redirectTo === ""
              ? ""
              : pageUrl(context.baseUrl, redirectTo, context.urlStyle),
          ],
        ]);
      },
      metadata: {
        highlight: (text, view) =>
          `<mark data-view="${view.id}">${escapeHtml(text)}</mark>`,
        note: false,
      },
    });

    assertEquals(written, 4);
    const indexHtml = Deno.readTextFileSync(
      join(output, "manual", "index.html"),
    );
    assertStringIncludes(indexHtml, 'data-kind="index"');
    assertStringIncludes(indexHtml, 'data-extra="index"');
    assertStringIncludes(indexHtml, "<title>All Pages - Custom</title>");
    assert(!indexHtml.includes('href="/manual/Legacy/"'));

    const homeHtml = Deno.readTextFileSync(
      join(output, "manual", "Home", "index.html"),
    );
    assertStringIncludes(homeHtml, 'data-kind="article"');
    assertStringIncludes(homeHtml, 'data-extra="Home"');
    assertStringIncludes(homeHtml, "<title>Home - Custom</title>");
    assertStringIncludes(homeHtml, 'class="toc"');
    assertStringIncludes(homeHtml, 'href="/manual/Other/"');
    // The theme's highlighter replaces the default escaping, and the deferred
    // xml view is not offered.
    assertStringIncludes(homeHtml, '<mark data-view="json-ld-compacted">');
    assert(!homeHtml.includes("RDF/XML serialization is deferred."));
    assert(!homeHtml.includes('value="xml"'));
    // Every shell token the layout names is filled.
    assert(!homeHtml.includes("%wiki."));

    const legacyHtml = Deno.readTextFileSync(
      join(output, "manual", "Legacy", "index.html"),
    );
    assertStringIncludes(legacyHtml, "url=/manual/Home/");
    assertEquals(
      Deno.readTextFileSync(join(output, "manual", "assets", "site.css")),
      "body { color: navy; }\n",
    );

    // Substitution leaves a token the theme never filled verbatim.
    assertEquals(
      substitute("<p>%wiki.unfilled%</p>", new Map()),
      "<p>%wiki.unfilled%</p>",
    );
  } finally {
    cleanup(root);
  }
});
