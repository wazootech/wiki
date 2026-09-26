import { parseTurtleQuads } from "@wazoo/sparql-engine/parser";
import { termKey } from "@wazoo/sparql-engine";
import type { Quad, Term } from "@rdfjs/types";
import { OWL2RLFallback } from "./infer.ts";

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

const assertedPath = Deno.args[0];
const pythonPath = Deno.args[1];
const asserted = loadNt(assertedPath);
const pythonClosure = loadNt(pythonPath);

const t0 = performance.now();
const reasoner = new OWL2RLFallback();
reasoner.load(asserted.quads);
const tLoad = Math.round(performance.now() - t0);

const tInferStart = performance.now();
const diag = reasoner.inferWithDiagnostics(asserted.quads);
const tInfer = Math.round(performance.now() - tInferStart);

const engineClosureKeys = new Set(asserted.keySet);
for (const q of reasoner.getStaticClosure()) engineClosureKeys.add(quadToKey(q));
for (const q of diag.quads) engineClosureKeys.add(quadToKey(q));

const onlyEngine: string[] = [];
const onlyPython: string[] = [];
for (const k of engineClosureKeys) if (!pythonClosure.keySet.has(k)) onlyEngine.push(k);
for (const k of pythonClosure.keySet) if (!engineClosureKeys.has(k)) onlyPython.push(k);
const isBnodeKey = (k: string) => k.startsWith("_:") || k.includes("genid") || /<ndfd/.test(k);
const onlyEngineNamed = onlyEngine.filter((k) => !isBnodeKey(k));
const onlyPythonNamed = onlyPython.filter((k) => !isBnodeKey(k));

console.log(JSON.stringify({
  engine: "fallback-infer.ts",
  asserted: asserted.quads.length,
  pythonClosure: pythonClosure.keySet.size,
  fallbackClosure: engineClosureKeys.size,
  staticClosure: reasoner.getStaticClosure().length,
  inferredNew: diag.quads.length,
  inconsistencies: diag.inconsistencies.map((r) => r.rule ?? r.id),
  onlyEngine: { named: onlyEngineNamed.length, bnode: onlyEngine.length - onlyEngineNamed.length },
  onlyPython: { named: onlyPythonNamed.length, bnode: onlyPython.length - onlyPythonNamed.length },
  timingMs: { load: tLoad, infer: tInfer, total: tLoad + tInfer },
  ruleChecks: Object.fromEntries(checks.map(([name, k]) => [name, engineClosureKeys.has(k)])),
}, null, 2));

console.log("\n--- ONLY-FALLBACK named triples (missing in python closure) ---");
for (const k of onlyEngineNamed) console.log(k);
console.log("\n--- ONLY-PYTHON named triples (missing in fallback closure) ---");
for (const k of onlyPythonNamed) console.log(k);