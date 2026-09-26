---
type: TechArticle
headline: Wiki Programmatic API
description: Stable Deno/TypeScript and npm entry points for validating, building, and querying a wiki.
---

# Wiki Programmatic API

The Deno/TypeScript engine is the single Wiki implementation. Use its in-process API for Deno applications, or the compatible npm SDK from Node.js. The `wiki` CLI remains the primary user surface.

See [Design Philosophies](Design_Philosophies.md) for the CLI/library boundary. RDF/XML input remains supported; RDF/XML output is explicitly deferred from the Deno cutover.

## Native Deno library

The Deno library is configured as [`@wazoo/wiki` on JSR](https://jsr.io/@wazoo/wiki), with `src/wiki/mod.ts` as its public entrypoint. The initial JSR package has not been published yet; the first tagged release will publish it after the package is linked to this repository in JSR settings.

```ts
import { Wiki } from "jsr:@wazoo/wiki";

const wiki = Wiki.load("docs/wiki.yml");
```

`Wiki.load` accepts a config path or a directory containing `wiki.yml` / `wiki.yaml`. The optional `wikiInputs` setting overrides `wiki.input`; installed, read-only sources are then included as part of the corpus.

### Validation reports

`Wiki.check` and `Wiki.lint` return typed `AuditReport` values. Each report has `ok`, `errors`, and `warnings`; `applyStrict()` promotes warnings to errors.

```ts
const report = await wiki.check(undefined, { strict: true });
if (!report.ok) {
  const [errors, warnings] = report.messages();
  console.error([...errors, ...warnings].join("\n"));
}
```

Pass a list of document paths as the first argument to scope an operation:

```ts
const report = await wiki.check(["docs/wiki/Getting_Started.md"]);
```

### Query and graph access

```ts
const results = await wiki.query(
  "SELECT ?name WHERE { ?person <https://schema.org/name> ?name }",
  { format: "json" },
);

const graph = await wiki.graph();
const dataset = await wiki.dataset();
```

`query` returns the chosen result format as a string. `graph()` returns the inferred union graph by default; `dataset()` exposes named graphs for source provenance. Options support inference, reload, and disk-cache control.

### Build and export

```ts
const built = await wiki.build("_site", {
  baseUrl: "/wiki",
  urlStyle: "dir",
});
if (!built.ok) throw new Error(built.error_message ?? "Build failed");

const exported = await wiki.export(undefined, { format: "json-ld" });
if (!exported.ok) {
  throw new Error(exported.error_message ?? "Export failed");
}
```

The library also exposes formatting, inline SPARQL rendering, link analysis and repair, source management, local serving, and project scaffolding. Its generated TSDoc reference will be available on [JSR](https://jsr.io/@wazoo/wiki) after the first release.

## Node.js and npm SDK

The `wazootech-wiki` npm package keeps its existing package name, `wiki` executable, CommonJS/ESM/type exports, and TypeScript SDK. The SDK invokes the Deno-backed CLI; npm users do not need system Python or a separate Deno installation. Node.js 18 or newer is required.

```bash
npm install wazootech-wiki
```

```ts
import { Wiki } from "wazootech-wiki";

const wiki = Wiki.load({ config: "docs/wiki.yml" });
const report = await wiki.check({ strict: true });

const results = await wiki.query({
  query: "SELECT ?name WHERE { ?person <https://schema.org/name> ?name }",
  format: "json",
});
```

CommonJS remains supported:

```js
const { Wiki } = require("wazootech-wiki");
```

The npm SDK preserves command result output, exit codes, timeout and cancellation options, stdin, and inherited-stdio process methods for long-running commands such as `serve` and `mcp`. See [TypeScript API Reference](TypeScript_API_Reference.md).

## Deferred RDF/XML output

The engine parses RDF/XML from `.rdf` and `.xml` wiki inputs. RDF/XML serialization is deferred from the initial Deno cutover: `export -f xml` returns an explicit unsupported-format error, and an RDF/XML `Accept` request to the SPARQL service returns `406 Not Acceptable`. The engine never substitutes a different serialization.

## Related

- [Deno API Reference](Deno_API_Reference.md)
- [TypeScript API Reference](TypeScript_API_Reference.md)
- [Python API Reference (retired)](Python_API_Reference.md)
- [Wiki CLI](wiki.md)
- [Wiki Configuration](Wiki_Configuration.md)
