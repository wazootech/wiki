/**
 * The differential run again, this time against the *shipped* code.
 *
 * `probe.ts` compares a copy of the route kept inside this probe. This script
 * compares what `wiki fmt` actually calls — `src/wiki/formatter.ts`'s
 * `formatMarkdownText` — against the `deno fmt` subprocess it replaced. If the
 * cutover drifted anywhere (a config key, a tag, the html post-pass), this shows
 * it as a byte difference on a real page.
 *
 * ```sh
 * cd probes/fmt-dprint
 * deno run --config ../../deno.json -A verify-production.ts
 * ```
 *
 * `--config` is required: this probe has its own `deno.json` pinning the plugins,
 * and without the repository's config the `@std/*` imports that `src/wiki`
 * depends on do not resolve.
 */

import { Path } from "../../src/wiki/fspath.ts";
import { formatMarkdownText } from "../../src/wiki/formatter.ts";

import { denoFmtRoute, firstDifference } from "./harness.ts";

const ROOT = new URL("../../", import.meta.url);

const NINE_DOCS = [
  "docs/wiki/Dataview_Integration.md",
  "docs/wiki/Vivary.md",
  "docs/wiki/wiki.md",
  "docs/wiki/Wiki_Configuration.md",
  "docs/wiki/wiki_mcp.md",
  "docs/wiki/Wiki_Page_Layouts.md",
  "docs/wiki/wiki_render.md",
  "docs/wiki/Wiki_Skills.md",
  "docs/wiki/WikiThon.md",
];

const MICRO = [
  "parity/corpus/micro/wiki/Alice.md",
  "parity/corpus/micro/wiki/Bob.md",
  "parity/corpus/micro/wiki/Index.md",
  "parity/corpus/micro/wiki/lowercase-name.md",
];

const SHIELDING = [
  "probes/fmt-shielding/input.md",
  "probes/fmt-shielding/input-tables.md",
];

async function allDocs(): Promise<string[]> {
  const names: string[] = [];
  for await (const entry of Deno.readDir(new URL("docs/wiki", ROOT))) {
    if (entry.isFile && entry.name.endsWith(".md")) {
      names.push(`docs/wiki/${entry.name}`);
    }
  }
  return names.sort();
}

async function read(path: string): Promise<string> {
  const text = await Deno.readTextFile(new URL(path, ROOT));
  return text.startsWith("\uFEFF") ? text.slice(1) : text;
}

const groups: Array<[string, string[]]> = [
  ["micro", MICRO],
  ["docs-nine", NINE_DOCS],
  ["shielding", SHIELDING],
  ["docs-all", await allDocs()],
];

const totals = new Map<string, [number, number]>();
for (const [corpus, paths] of groups) {
  let same = 0;
  for (const path of paths) {
    const text = await read(path);
    const denoOut = await denoFmtRoute(text);
    // The production module takes a `Path` for its error messages only; the
    // formatter itself never touches the filesystem.
    const dprintOut = formatMarkdownText(text, Path.of(new URL(path, ROOT).pathname), "no");
    if (denoOut === dprintOut) {
      same++;
    } else {
      console.log(`DIFF  ${path}  —  ${firstDifference(denoOut, dprintOut)}`);
    }
  }
  totals.set(corpus, [same, paths.length]);
}

console.log("");
for (const [corpus, [same, total]] of totals) {
  console.log(`${corpus}: ${same}/${total} byte-identical to deno fmt`);
}
