---
type: TechArticle
headline: Wiki Programmatic API
description: Stable Deno/TypeScript and npm entry points for validating, building, and querying a wiki.
---

# Wiki Programmatic API

The Deno/TypeScript engine is the single Wiki implementation. Use its in-process API for Deno and TypeScript applications. The npm package exposes a runtime/bootstrap API that locates the Deno runtime and builds the `wiki` command; it does not export a `Wiki` class. The `wiki` CLI remains the primary user surface.

See [Design Philosophies](Design_Philosophies.md) for the CLI/library boundary. RDF/XML input remains supported; RDF/XML output is explicitly deferred from the Deno cutover.

## Native Deno library

The Deno library is configured as [`@wazoo/wiki` on JSR](https://jsr.io/@wazoo/wiki), with `src/wiki/mod.ts` as its public entrypoint. The initial JSR package has not been published yet; the first tagged release will publish it after the package is linked to this repository in JSR settings.

```ts
import { Wiki } from "jsr:@wazoo/wiki";

const wiki = Wiki.load("docs/wiki.yml");
```

`Wiki.load` accepts a config path or a directory containing `wiki.yml` / `wiki.yaml`. The optional `wikiInputs` setting overrides `wiki.input`; installed, read-only sources are then included as part of the corpus.

### Validation reports

`Wiki.check` and `Wiki.lint` are asynchronous and return `Promise<AuditReport>` values. Each report has `ok`, `errors`, and `warnings`; `applyStrict()` promotes warnings to errors. When enabled, `lint.heading_levels` uses the in-process ESLint Markdown rule engine; route-aware links, CURIE resolution, and the remaining Wiki policies stay in Wiki.

```ts
const lintReport = await wiki.lint(undefined, { strict: true });
const report = await wiki.check(undefined, { strict: true });
const [lintErrors, lintWarnings] = lintReport.messages();
const [errors, warnings] = report.messages();
if (!lintReport.ok || !report.ok) {
  console.error(
    [...lintErrors, ...lintWarnings, ...errors, ...warnings].join("\n"),
  );
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

## The `wazootech-wiki` npm package: command only

The npm package publishes the `wiki` command and nothing else. It bundles the Deno runtime, so npm users need neither system Python nor a separate Deno installation; Node.js 18 or newer is the only requirement. Until the first tagged Deno release, the currently published npm package still runs the Python CLI.

```bash
npm install -g wazootech-wiki
```

```bash
wiki -c docs/wiki.yml check --strict
```

### Why there is no npm `Wiki` class

This package previously exported a `Wiki` SDK whose every method spawned the CLI and returned an exit code plus captured output strings. That was a second, weaker path to work the library already does in process: a subprocess boundary discards the typed reports that make embedding worthwhile, and it forced TS and Node users to treat the library as a program to be invoked rather than code to be called.

TypeScript callers embed the library (above). Callers in languages that cannot embed JavaScript use the command, and a generated client for those languages is planned work.

## Deferred RDF/XML output

The engine parses RDF/XML from `.rdf` and `.xml` wiki inputs. RDF/XML serialization is deferred from the initial Deno cutover: `export -f xml` returns an explicit unsupported-format error, and an RDF/XML `Accept` request to the SPARQL service returns `406 Not Acceptable`. The engine never substitutes a different serialization.

## Related

- [Deno API Reference](Deno_API_Reference.md)
- [TypeScript API Reference](TypeScript_API_Reference.md)
- [Python API Reference](Python_API_Reference.md)
- [Wiki CLI](wiki.md)
- [Wiki Configuration](Wiki_Configuration.md)
