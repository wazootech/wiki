import { dirname, join } from "@std/path";
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { Config } from "../src/wiki/config.ts";
import { buildDocsSite } from "../docs/build.ts";

function tempRoot(): string {
  return Deno.makeTempDirSync({ prefix: "wiki-docs-build-" });
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

Deno.test("Wikipedia docs build preserves theme features and isolates redirect metadata", async () => {
  const root = tempRoot();
  try {
    const wikiDir = join(root, "wiki");
    write(
      root,
      "layouts/redirect.html",
      '<!doctype html><html><head><meta http-equiv="refresh" content="0; url=%wiki.redirect_url%"></head><body>Redirecting to %wiki.redirect_url%</body></html>',
    );
    write(
      root,
      "layouts/custom.html",
      '<!doctype html><html><head>%wiki.head%</head><body class="custom-layout">%wiki.title%<main>%wiki.body%</main></body></html>',
    );
    write(
      root,
      "wiki/Legacy.md",
      "---\nheadline: Legacy route\nredirect_to: Normal\n'wazoo:layout': layouts/redirect.html\n---\n\n# Legacy route\n",
    );
    write(
      root,
      "wiki/Normal.md",
      "---\nid: wiki:Normal\nheadline: Normal Page\ntype: schema:TechArticle\ncategory: Example\n---\n\n" +
        "# Normal Page\n\nSee [Destination](Destination.md).\n\n## First Section\n\n<example>source text</example>\n",
    );
    write(
      root,
      "wiki/Destination.md",
      "# Destination\n\n[Normal](Normal.md)\n",
    );
    write(
      root,
      "wiki/Custom.md",
      "---\nheadline: Custom Page\n'wazoo:layout': layouts/custom.html\n---\n\n# Custom Page\n\nCustom body.\n",
    );
    write(root, "wiki/Referrer.md", "# Referrer\n\n[Normal](Normal.md)\n");
    const asset = "body { color: navy; }\n";
    write(root, "assets/site.css", asset);
    const config = Config.forRoot(root, {
      wiki: { input: [wikiDir], assets: [join(root, "assets")] },
      site: { base_url: "/manual", url_style: "dir" },
    });
    const output = join(root, "_site");

    const written = await buildDocsSite(config, output, { repoRoot: root });

    assertEquals(written, 6);
    const redirectHtml = Deno.readTextFileSync(
      join(output, "manual/Legacy/index.html"),
    );
    assertStringIncludes(
      redirectHtml,
      'http-equiv="refresh" content="0; url=/manual/Normal/"',
    );
    const normalHtml = Deno.readTextFileSync(
      join(output, "manual/Normal/index.html"),
    );
    assert(!normalHtml.includes('http-equiv="refresh"'));
    assert(!normalHtml.includes("Redirecting to"));
    assert(!normalHtml.includes("url=/manual/Normal/"));
    assertStringIncludes(normalHtml, 'class="toc"');
    assertStringIncludes(normalHtml, 'href="#first-section"');
    assertStringIncludes(normalHtml, "<h2>Infobox</h2>");
    assertStringIncludes(normalHtml, "Example");
    assertStringIncludes(normalHtml, 'href="/manual/Destination/"');
    assertStringIncludes(normalHtml, 'id="catlinks"');
    assertStringIncludes(normalHtml, "Backlinks");
    assertStringIncludes(
      normalHtml,
      "Raw Markdown source code of the document",
    );
    assertStringIncludes(normalHtml, 'value="json-ld-compacted"');
    assertStringIncludes(normalHtml, 'value="turtle"');
    assertStringIncludes(
      normalHtml,
      'href="https://github.com/wazootech/wiki/blob/main/wiki/Normal.md"',
    );
    assertStringIncludes(normalHtml, "RDF/XML serialization is deferred.");
    assert(!normalHtml.includes('value="xml"'));
    assert(!normalHtml.includes("metadata-format-panel-xml"));
    assertStringIncludes(
      normalHtml,
      "&lt;example&gt;source text&lt;/example&gt;",
    );

    const indexHtml = Deno.readTextFileSync(join(output, "manual/index.html"));
    assertStringIncludes(indexHtml, "Normal Page");
    assert(!indexHtml.includes('href="/manual/Legacy/"'));
    assertStringIncludes(indexHtml, 'data-categories="TechArticle"');
    const customHtml = Deno.readTextFileSync(
      join(output, "manual/Custom/index.html"),
    );
    assertStringIncludes(customHtml, 'class="custom-layout"');
    assertStringIncludes(customHtml, "Custom body.");
    assertEquals(
      Deno.readTextFileSync(join(output, "manual/assets/site.css")),
      asset,
    );
  } finally {
    cleanup(root);
  }
});
