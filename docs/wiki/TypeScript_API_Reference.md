---
type: TechArticle
description: How TypeScript callers reach the Wiki engine, and why the npm package no longer exports a Wiki class.
---

# TypeScript API Reference

TypeScript callers **embed the library**. There is no wrapper to install and no subprocess to spawn.

```ts
import { Wiki } from "jsr:@wazoo/wiki";

const wiki = Wiki.load("docs/wiki.yml");
const report = await wiki.check({ strict: true });
```

Every operation is a typed method on the library's `Wiki` class: `check`, `lint`, `format`, `fix`, `render`, `build`, `export`, `link`, `edit`, `show`, `refs`, `query`, `graph`, `dataset`, `graphs`, `serve`, `install`, `update`, and `remove`, plus the static `Wiki.init` and `Wiki.load`. `mcp` and `upgrade` are CLI commands, not methods. Report-producing calls return structured results rather than captured text.

## The npm package is command-only

`wazootech-wiki` on npm ships the `wiki` **executable** and bundles the Deno runtime so that npm users need neither Python nor a system Deno. It exposes no `Wiki` class.

This is a deliberate change, not an omission. The package previously exported a `Wiki` SDK whose methods each spawned the packaged CLI and returned an exit code plus captured stdout/stderr. Because the engine is Deno-only, a wrapper could do no better than that: it could not share a process, a cache, or a type. Every method became an argument array and an exit code — a strictly weaker interface than the library the npm consumer could have imported.

Embedding is the supported path for TypeScript and JavaScript. The command is the supported path for shells, CI, and languages that cannot embed JavaScript; generating typed clients for those languages from the JSON Schema the command already emits is planned work.

## Custom themes

Embedding `jsr:@wazoo/wiki` is the path for programmatic use of the engine. For a published site with a frontend other than the built-in `wiki build` output, embed the theme entrypoint `jsr:@wazoo/wiki/theme`, which exports the static-site build surface (`buildSite`, `buildStaticSite`, `buildThemedSite`, the Markdown and layout renderers, and the asset and path helpers). See the [Deno API Reference](Deno_API_Reference.md).

## Related

- [Wiki Programmatic API](Wiki_Programmatic_API.md) — usage guide and design rationale
- [Deno API Reference](Deno_API_Reference.md) — full engine surface
- [Wiki CLI](wiki.md) — command reference
