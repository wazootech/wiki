import { InferenceEngine, loadDefaultRuleProfiles } from "npm:rdfjs-inference-engine@0.2.2";
import { parseTurtleQuads } from "@wazoo/sparql-engine/parser";
import type { Quad } from "@rdfjs/types";

const bakePath = Deno.args[0];
const outPath = Deno.args[1] ?? "./runtime.ts";

const text = Deno.readTextFileSync(bakePath);
const quads = parseTurtleQuads(text) as unknown as Quad[];
const owl2rlOnly = loadDefaultRuleProfiles().filter((p) => p.label?.startsWith("rules/owl2rl"));

const engine = new InferenceEngine();
engine.load(owl2rlOnly, quads, { selectRuntimeRules: false });
const runtime = engine.getRuntime();

const escaped = runtime
  .replace(/\\/g, "\\\\")
  .replace(/`/g, "\\`")
  .replace(/\$\{/g, "\\${");
const body = `export const WIKI_RUNTIME = \`${escaped}\`;\n`;
Deno.writeTextFileSync(outPath, body);
console.log(`wrote ${outPath} (${runtime.length} chars runtime, ${body.length} chars module)`);