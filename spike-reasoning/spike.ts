import { InferenceEngine, loadDefaultRuleProfiles } from "npm:rdfjs-inference-engine@0.2.2";
import { parseTurtleQuads } from "@wazoo/sparql-engine/parser";
import type { Quad, Term } from "@rdfjs/types";
import { OWL2RL_N3 } from "./rules.ts";

export {};

function termToKey(t: Term): string {
  if (t.termType === "Literal") {
    const dt = t.datatype?.value;
    return `"${t.value}"` + (t.language ? "@" + t.language : "") + (dt ? `^^<${dt}>` : "");
  }
  if (t.termType === "DefaultGraph") return "";
  return `<${t.value}>`;
}

function quadToKey(q: Quad): string {
  return [q.subject, q.predicate, q.object].map(termToKey).join(" ") + " .";
}

function loadNt(path: string): { quads: Quad[]; keySet: Set<string> } {
  const text = Deno.readTextFileSync(path);
  const quads = parseTurtleQuads(text) as unknown as Quad[];
  return { quads, keySet: new Set(quads.map(quadToKey)) };
}

const checks: Array<[string, string]> = [
  ["cax-sco chain Person<Human<Agent", "<https://example.org/micro/ethan> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://example.org/micro/Human> ."],
  ["cax-sco -> Agent", "<https://example.org/micro/ethan> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://schema.org/Agent> ."],
  ["scm-eqc2 Creature=Agent", "<https://example.org/micro/ethan> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://example.org/micro/Creature> ."],
  ["prp-rng wazoo:Organization", "<https://example.org/micro/wazoo> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://example.org/micro/Organization> ."],
  ["prp-inv1 wazoo employs ethan", "<https://example.org/micro/wazoo> <https://example.org/micro/employs> <https://example.org/micro/ethan> ."],
  ["prp-trp alice reportsTo carol", "<https://example.org/micro/alice> <https://example.org/micro/reportsTo> <https://example.org/micro/carol> ."],
  ["prp-spo1 ethan reportsTo bob", "<https://example.org/micro/ethan> <https://example.org/micro/reportsTo> <https://example.org/micro/bob> ."],
  ["prp-eqp1 ethan hasColleague sandra", "<https://example.org/micro/ethan> <https://example.org/micro/hasColleague> <https://example.org/micro/sandra> ."],
  ["prp-fp literal sameAs", "<https://example.org/micro/ethan> <http://www.w3.org/2002/07/owl#sameAs> <https://example.org/micro/ethan> ."],
  ["prp-key u1 sameAs u2", "<https://example.org/micro/u1> <http://www.w3.org/2002/07/owl#sameAs> <https://example.org/micro/u2> ."],
  ["prp-prp ethan memberOf parentco", "<https://example.org/micro/ethan> <https://example.org/micro/memberOf> <https://example.org/micro/parentco> ."],
  ["cax-dw zeus owl:Nothing", "<https://example.org/micro/zeus> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2002/07/owl#Nothing> ."],
];

function loadEngine(mode: string, vocabQuads: Quad[]): { engine: InferenceEngine; loadMs: number } {
  const t0 = performance.now();
  const engine = new InferenceEngine();
  if (mode === "no-fs") {
    engine.load([{ n3: OWL2RL_N3, label: "rules/owl2rl" }], vocabQuads, { selectRuntimeRules: false });
  } else {
    const owl2rlOnly = loadDefaultRuleProfiles().filter((p) => p.label?.startsWith("rules/owl2rl"));
    engine.load(owl2rlOnly, vocabQuads, { selectRuntimeRules: false });
  }
  return { engine, loadMs: Math.round(performance.now() - t0) };
}

function runSpike(engine: InferenceEngine, loadMs: number, assertedPath: string, pythonPath: string) {
  const asserted = loadNt(assertedPath);
  const pythonClosure = loadNt(pythonPath);

  const tInferStart = performance.now();
  const inferred: Quad[] = [];
  const seen = new Set(asserted.keySet);
  for (const q of engine.infer(asserted.quads)) {
    const k = quadToKey(q);
    if (!seen.has(k)) {
      seen.add(k);
      inferred.push(q);
    }
  }
  const tInfer = Math.round(performance.now() - tInferStart);

  const engineClosureKeys = new Set(asserted.keySet);
  for (const q of engine.getStaticClosure()) engineClosureKeys.add(quadToKey(q));
  for (const q of inferred) engineClosureKeys.add(quadToKey(q));

  const onlyEngine: string[] = [];
  const onlyPython: string[] = [];
  for (const k of engineClosureKeys) if (!pythonClosure.keySet.has(k)) onlyEngine.push(k);
  for (const k of pythonClosure.keySet) if (!engineClosureKeys.has(k)) onlyPython.push(k);
  const isBnodeKey = (k: string) => k.startsWith("_:") || k.includes("genid") || /<ndfd/.test(k);
  const onlyEngineBnode = onlyEngine.filter(isBnodeKey).length;
  const onlyPythonBnode = onlyPython.filter(isBnodeKey).length;
  const onlyEngineNamed = onlyEngine.filter((k) => !isBnodeKey(k));
  const onlyPythonNamed = onlyPython.filter((k) => !isBnodeKey(k));

  console.log(JSON.stringify({
    mode: Deno.args[0],
    asserted: asserted.quads.length,
    pythonClosure: pythonClosure.keySet.size,
    engineClosure: engineClosureKeys.size,
    engineInferredNew: inferred.length,
    staticClosure: engine.getStaticClosure().length,
    onlyEngine: { named: onlyEngineNamed.length, bnode: onlyEngineBnode },
    onlyPython: { named: onlyPythonNamed.length, bnode: onlyPythonBnode },
    timingMs: { load: loadMs, infer: tInfer, total: loadMs + tInfer },
    runtimeBytes: engine.getRuntime().length,
    ruleChecks: Object.fromEntries(checks.map(([name, k]) => [name, engineClosureKeys.has(k)])),
  }, null, 2));

  console.log("\n--- ONLY-ENGINE named triples (missing in python closure) ---");
  for (const k of onlyEngineNamed) console.log(k);
  console.log("\n--- ONLY-PYTHON named triples (missing in engine closure) ---");
  for (const k of onlyPythonNamed) console.log(k);
}

const mode = Deno.args[0];
const assertedPath = Deno.args[1];
const pythonPath = Deno.args[2];
const vocab = loadNt(assertedPath).quads;
const { engine, loadMs } = loadEngine(mode, vocab);
runSpike(engine, loadMs, assertedPath, pythonPath);