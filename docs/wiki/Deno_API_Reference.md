---
type: TechArticle
headline: Deno API Reference
description: Public Deno and TypeScript API for the Wiki engine.
---

# Deno API Reference

The native Wiki engine is a Deno/TypeScript library whose package metadata is configured as [`@wazoo/wiki` on JSR](https://jsr.io/@wazoo/wiki). The initial package has not been published yet; the first tagged release will publish it after the JSR package is linked to this repository. Its source entrypoint is `src/wiki/mod.ts`.

## Install

After the first JSR release, import the package directly in a Deno project:

```ts
import { Wiki } from "jsr:@wazoo/wiki";
```

After that release, install the `wiki` command globally from JSR:

```bash
deno install --global --allow-all --name wiki jsr:@wazoo/wiki/cli
```

The `wazootech-wiki` npm package retains the Node.js-facing CLI and TypeScript SDK for existing npm consumers; see [TypeScript API Reference](TypeScript_API_Reference.md).

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

## Build and export

```ts
const built = await wiki.build("_site", { baseUrl: "/wiki" });
if (!built.ok) throw new Error(built.error_message ?? "Build failed");

const exported = await wiki.export(undefined, { format: "json-ld" });
if (!exported.ok) throw new Error(exported.error_message ?? "Export failed");
```

The library also exposes graph and dataset loading, Markdown formatting and rendering, link analysis and repair, source management, local serving, and wiki scaffolding. The generated package reference will be available on [JSR](https://jsr.io/@wazoo/wiki) after the first release.

## RDF/XML output

RDF/XML parsing remains supported for `.rdf` and `.xml` wiki inputs. RDF/XML serialization is deferred: export requests for XML fail clearly, and the SPARQL service returns `406 Not Acceptable` for an RDF/XML `Accept` header. Other RDF output formats remain available.

## Related

- [Wiki Programmatic API](Wiki_Programmatic_API.md)
- [TypeScript API Reference](TypeScript_API_Reference.md)
- [Python API Reference (retired)](Python_API_Reference.md)
- [wiki](wiki.md) — command reference
