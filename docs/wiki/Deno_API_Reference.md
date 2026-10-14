---
type: TechArticle
description: Public Deno and TypeScript API for the Wiki engine.
---

# Deno API Reference

The native Wiki engine is a Deno/TypeScript library published as [`@wazoo/wiki` on JSR](https://jsr.io/@wazoo/wiki). Its source entrypoint is `src/wiki/mod.ts`.

## Install

Import the package directly in a Deno project:

```ts
import { Wiki } from "jsr:@wazoo/wiki";
```

Install the `wiki` command globally from JSR (`--min-dep-age 0` bypasses Deno's 24-hour dependency age policy, which otherwise resolves a just-published version to the previous one):

```bash
deno install --global --allow-all --name wiki --min-dep-age 0 jsr:@wazoo/wiki/cli
```

The `wazootech-wiki` npm package ships the `wiki` command for npm consumers, bundling the Deno runtime; it exports no library API. See [TypeScript API Reference](TypeScript_API_Reference.md).

## Load a wiki

```ts
import { Wiki } from "jsr:@wazoo/wiki";

const wiki = Wiki.load("docs/wiki.yml");
```

`Wiki.load` accepts a config file or a directory containing one. The optional `wikiInputs` setting overrides the configured `wiki.input` paths.

## Validate and query

```ts
const report = await wiki.check(undefined, { strict: true });
if (!report.ok) {
  const [errors] = report.messages();
  throw new Error(errors.join("\n"));
}

const result = await wiki.query(
  "SELECT ?name WHERE { ?person <https://schema.org/name> ?name }",
  { format: "json" },
);
console.log(result);
```

`check` and `lint` return typed reports. `query` returns the selected result format as a string. Use `Wiki.withRuntime(...)` for per-session site URL overrides.

## Edit pages

```ts
const page = await wiki.show("wiki/Budget_Ledger.md");
const report = await wiki.edit({
  ops: [{
    op: "set",
    path: "wiki/Budget_Ledger.md",
    field: "schema:description",
    value: "Every Wazoo spend, one page per purchase.",
    expect: page.hash,
  }],
}, { apply: true });
console.log(report.status); // "applied", "rejected", or "conflict"
```

`edit` validates before it writes and writes all files or none; `show` and `refs` read a page and its links. See [wiki edit](wiki_edit.md).

## Build and export

```ts
const built = await wiki.build("_site", { baseUrl: "/wiki" });
if (!built.ok) throw new Error(built.error_message ?? "Build failed");

const exported = await wiki.export(undefined, { format: "json-ld" });
if (!exported.ok) throw new Error(exported.error_message ?? "Export failed");
```

The library also exposes graph and dataset loading, Markdown formatting and rendering, link analysis and repair, source management, local serving, and wiki scaffolding. The generated package reference will be available on [JSR](https://jsr.io/@wazoo/wiki) after the first release.

## Custom themes

The built-in `wiki build` produces the default HTML. When a published site needs a different frontend, build it in TypeScript against the `@wazoo/wiki/theme` entrypoint instead of deep-importing engine internals:

```ts
import { Wiki } from "jsr:@wazoo/wiki";
import { buildSite, buildStaticSite } from "jsr:@wazoo/wiki/theme";

const wiki = Wiki.load("wiki.yml");

// Drive the whole build: writes pages, assets, and an index to a directory.
const result = await buildStaticSite(wiki, { output_dir: "_site" });

// Or assemble the site and render each page yourself.
const site = buildSite(wiki.config);
for (const page of site.pages) {
  console.log(page.title, page.file_slug, page.html);
}
```

`buildSite` returns the pages (title, rendered `html`, `outline`, `backlink_slugs`, resolved `wiki_ids`) with route and wiki-id indexes. `renderWikiMarkdown`, `renderOutlineTitle`, `renderLayout`, `renderPageLayout`, `buildPageHtml`, and `buildIndexHtml` render individual pieces; `buildAssetManifest` and `iterAssetFiles` cover assets. `Config`, path and link helpers, and `exportFrontmatter` are re-exported alongside for convenience. This repository's own docs theme, `docs/build.ts`, is a thin theme over `buildThemedSite`.

### Publishing with a custom theme

`buildStaticSite` renders the built-in layout. A theme that ships its own layouts drives the same flow with `buildThemedSite`, which owns page walking, the page shell (table of contents, infobox, backlinks, categories, metadata panels), `%wiki.*%` substitution, the output tree, and asset copying. The theme supplies its layouts, its assets, and the values specific to its design:

```ts
import { buildThemedSite, METADATA_VIEWS } from "jsr:@wazoo/wiki/theme";

await buildThemedSite(wiki.config, "_site", {
  dir: "theme", // where layouts/ and assets/ live
  layout: "layouts/article.html", // default: layouts/wikipedia.html
  redirect_layout: "layouts/redirect.html", // used by redirect_to pages
  title_suffix: " - My Wiki", // default: " - Wiki"
  tokens: (context) =>
    // extra or overriding %wiki.*% values
    new Map([["%wiki.edit_link%", editLink(context.page)]]),
  metadata: {
    views: METADATA_VIEWS, // default: every view except xml
    selected_view: "turtle", // default: json-ld-compacted
    note: false, // default: true
    highlight: (text, view) => highlightRdf(text, view.lexer),
  },
});
```

The engine fills the shell slots a theme layout commonly uses: `%wiki.base_url%`, `%wiki.url_style%`, `%wiki.pages%`, `%wiki.title%`, `%wiki.slug%`, `%wiki.source%`, `%wiki.layout_stem%`, `%wiki.page_kind%`, `%wiki.body%`, `%wiki.toc%`, `%wiki.backlinks%`, `%wiki.infobox%`, `%wiki.categories%`, `%wiki.metadata_pane%`, `%wiki.metadata_tool%`, `%wiki.metadata_tab%`, `%wiki.type_label%`, `%wiki.layout_label%`, and `%wiki.head%`. `tokens` is called for every page and once for the index (`context.page` is `null`); its result is merged over those values, so returning a shell key overrides it. A slot neither the engine nor `tokens` fills is left verbatim, so a built page can be scanned for `%wiki.` residue. This is the whole-site cousin of the `renderLayout` slot rules below, which fill only three.

A page's `wazoo:layout` frontmatter still wins when the file exists, and a page whose frontmatter sets `redirect_to` uses `redirect_layout` when the theme supplies one. `metadata.highlight` returns HTML — escape the text yourself when the grammar highlights nothing; the default escapes the whole body. The `xml` view is excluded by default because RDF/XML serialization is deferred ([RDF/XML output](#rdfxml-output)).

### Custom layout tokens

A layout file may use more `%wiki.*%` slots than the engine fills. `renderLayout` and `renderPageLayout` accept an optional `extraTokens` map for the rest, so a theme renders its own layout without reimplementing the substitution loop:

```ts
import { renderLayout } from "jsr:@wazoo/wiki/theme";

const html = renderLayout(
  page.title,
  "/wiki",
  page.html,
  "layouts/article.html",
  new Map([
    ["%wiki.toc%", tocHtml],
    ["%wiki.infobox%", infoboxHtml],
  ]),
);
```

The three built-in slots — `%wiki.base_url%`, `%wiki.head%`, and `%wiki.body%` — are always filled, so omitting `extraTokens` keeps the previous behavior and output. Keys are the exact slot spellings, for example `%wiki.toc%`. A key that collides with a built-in slot overrides it. Values are inserted verbatim and are not HTML-escaped, so escape untrusted text before putting it in the map. A `%wiki.*%` spelling absent from both the built-in set and `extraTokens` is left in the output unchanged, as `wiki build` has always done.

`renderPageLayout` forwards `extraTokens` to `renderLayout` for every page it renders, after choosing the page's `wazoo:layout` override or the default layout.

The CLI still owns the artifact contract — `wiki build` and `wiki serve` are the supported default frontends, and a theme is a downstream program.

## RDF/XML output

RDF/XML parsing remains supported for `.rdf` and `.xml` wiki inputs. RDF/XML serialization is deferred: export requests for XML fail clearly, and the SPARQL service returns `406 Not Acceptable` for an RDF/XML `Accept` header. Other RDF output formats remain available.

## Related

- [Wiki Programmatic API](Wiki_Programmatic_API.md)
- [TypeScript API Reference](TypeScript_API_Reference.md)
- [Python API Reference](Python_API_Reference.md)
- [wiki](wiki.md) — command reference
