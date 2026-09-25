/**
 * Runs the comparison over the corpora and writes `probe-out.txt`.
 *
 * `deno run -A probe.ts` — must be run from `probes/fmt-dprint`, because the
 * corpus paths are resolved relative to the worktree root one level up.
 */

import {
  buildBareRoute,
  buildContextRoute,
  denoFmtRoute,
  firstDifference,
  type DprintRoute,
  type HostSet,
} from "./harness.ts";
import { buildFaithfulRoute } from "./route.ts";

const ROOT = new URL("../../", import.meta.url);

interface Subject {
  label: string;
  corpus: string;
  path: string;
}

async function readText(path: string): Promise<string> {
  const url = new URL(path, ROOT);
  let text = await Deno.readTextFile(url);
  // `formatMarkdown` strips a leading BOM before handing the string to the
  // formatter; both sides are fed the same stripped text so the comparison is
  // about the formatter and not about BOM handling.
  if (text.startsWith("\uFEFF")) text = text.slice(1);
  return text;
}

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

async function listAllDocs(): Promise<string[]> {
  const names: string[] = [];
  for await (const entry of Deno.readDir(new URL("docs/wiki", ROOT))) {
    if (entry.isFile && entry.name.endsWith(".md")) {
      names.push(`docs/wiki/${entry.name}`);
    }
  }
  return names.sort();
}

async function subjects(): Promise<Subject[]> {
  const groups: Array<[string, string[]]> = [
    ["micro", MICRO],
    ["docs-nine", NINE_DOCS],
    ["shielding", SHIELDING],
    ["docs-all", await listAllDocs()],
  ];
  const out: Subject[] = [];
  for (const [corpus, paths] of groups) {
    for (const path of paths) out.push({ label: path, corpus, path });
  }
  return out;
}

interface Result {
  label: string;
  corpus: string;
  identical: boolean;
  detail: string | null;
  bytesDeno: number;
  bytesDprint: number;
}

async function runRoute(
  route: DprintRoute,
  label: string,
  corpus: string,
  text: string,
): Promise<Result> {
  let denoOut: string;
  let dprintOut: string;
  try {
    denoOut = await denoFmtRoute(text);
  } catch (error) {
    return {
      label,
      corpus,
      identical: false,
      detail: `deno fmt threw: ${String(error)}`,
      bytesDeno: -1,
      bytesDprint: -1,
    };
  }
  try {
    dprintOut = route.format(label, text);
  } catch (error) {
    return {
      label,
      corpus,
      identical: false,
      detail: `dprint threw: ${String(error)}`,
      bytesDeno: new TextEncoder().encode(denoOut).length,
      bytesDprint: -1,
    };
  }
  const encoder = new TextEncoder();
  return {
    label,
    corpus,
    identical: denoOut === dprintOut,
    detail: firstDifference(denoOut, dprintOut),
    bytesDeno: encoder.encode(denoOut).length,
    bytesDprint: encoder.encode(dprintOut).length,
  };
}

/** `--hosts none` (default) or `--hosts yaml,json,typescript` / `--hosts all`. */
function selectedHosts(): HostSet {
  const index = Deno.args.indexOf("--hosts");
  const value = index >= 0 ? Deno.args[index + 1] : "none";
  if (value === "all") {
    return { yaml: true, json: true, typescript: true, css: true };
  }
  if (value === "everything") {
    return {
      yaml: true,
      json: true,
      typescript: true,
      css: true,
      markup: true,
    };
  }
  const names = value.split(",").map((name) => name.trim()).filter(Boolean);
  return {
    yaml: names.includes("yaml"),
    json: names.includes("json"),
    typescript: names.includes("typescript"),
    css: names.includes("css"),
    markup: names.includes("markup"),
  };
}

const hosts = selectedHosts();
const postPass = Deno.args.includes("--post-pass");
const tag = Deno.args.includes("--bare")
  ? "bare"
  : Deno.args.includes("--context")
  ? Object.entries(hosts).filter(([, on]) => on).map(([name]) => name).join("-") ||
    "none"
  : `faithful${postPass ? "+html" : ""}`;
const route: DprintRoute = Deno.args.includes("--bare")
  ? buildBareRoute()
  : Deno.args.includes("--context")
  ? buildContextRoute(hosts)
  : buildFaithfulRoute({ htmlFencePostPass: postPass });
const lines: string[] = [];
const results: Result[] = [];

lines.push(`route: ${tag}`);
lines.push(`resolved dprint config: ${JSON.stringify(route.resolvedConfig)}`);
lines.push(`dprint diagnostics: ${JSON.stringify(route.diagnostics)}`);

for (const subject of await subjects()) {
  const text = await readText(subject.path);
  const result = await runRoute(route, subject.label, subject.corpus, text);
  results.push(result);
  lines.push(
    `${result.identical ? "SAME" : "DIFF"}  ${result.label}${
      result.identical ? "" : `  —  ${result.detail}`
    }`,
  );
}

lines.push("");
for (const corpus of ["micro", "docs-nine", "shielding", "docs-all"]) {
  const group = results.filter((result) => result.corpus === corpus);
  const same = group.filter((result) => result.identical).length;
  lines.push(
    `${corpus}: ${same}/${group.length} byte-identical`,
  );
}

const output = lines.join("\n");
console.log(output);
await Deno.writeTextFile(
  new URL(`probe-out-${tag}.txt`, import.meta.url),
  output + "\n",
);
await Deno.writeTextFile(
  new URL(`results-${tag}.json`, import.meta.url),
  JSON.stringify(results, null, 2) + "\n",
);
