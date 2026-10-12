---
type: TechArticle
headline: Deno API Reference
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

`buildSite` returns the pages (title, rendered `html`, `outline`, `backlink_slugs`, resolved `wiki_ids`) with route and wiki-id indexes. `renderWikiMarkdown`, `renderOutlineTitle`, `renderLayout`, `renderPageLayout`, `buildPageHtml`, and `buildIndexHtml` render individual pieces; `buildAssetManifest` and `iterAssetFiles` cover assets. `Config`, path and link helpers, and `exportFrontmatter` are re-exported alongside for convenience. This repository's own docs theme, `docs/build.ts`, is built on this entrypoint.

The CLI still owns the artifact contract — `wiki build` and `wiki serve` are the supported default frontends, and a theme is a downstream program.

## RDF/XML output

RDF/XML parsing remains supported for `.rdf` and `.xml` wiki inputs. RDF/XML serialization is deferred: export requests for XML fail clearly, and the SPARQL service returns `406 Not Acceptable` for an RDF/XML `Accept` header. Other RDF output formats remain available.

## Related

- [Wiki Programmatic API](Wiki_Programmatic_API.md)
- [TypeScript API Reference](TypeScript_API_Reference.md)
- [Python API Reference](Python_API_Reference.md)
- [wiki](wiki.md) — command reference
