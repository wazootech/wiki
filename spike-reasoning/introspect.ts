import { InferenceEngine } from "npm:rdfjs-inference-engine@0.2.2";
import * as pkg from "npm:rdfjs-inference-engine@0.2.2/package.json" with { type: "json" };

console.log("version:", pkg.version);
console.log("type:", pkg.type, "| main:", pkg.main);
console.log("proto:", Object.getOwnPropertyNames(InferenceEngine.prototype).join(", "));
const e = new InferenceEngine();
console.log("own:", JSON.stringify(Object.getOwnPropertyNames(e)));