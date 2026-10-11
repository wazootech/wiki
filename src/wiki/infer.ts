/**
 * OWL 2 RL deductive closure over a wiki graph.
 *
 * Port of `src/wiki/infer.py`, which is 23 lines of `owlrl`
 * (`DeductiveClosure(OWLRL_Semantics).expand(graph)`). The library swap is
 * `rdfjs-inference-engine` (the cutover record; the reasoning spike compared the two on
 * the micro OWL 2 RL suite and on the docs wiki), and it changes the shape of
 * the work rather than only the call:
 *
 * - **owlrl expands in place; the engine materializes.** The engine is given the
 *   rule text plus a vocabulary once, then answers `infer(data)` with the
 *   *newly* derived triples and `getStaticClosure()` with everything derivable
 *   from the vocabulary alone. The closure of a wiki graph is therefore
 *   `asserted ∪ staticClosure ∪ infer(asserted)`, and the loader adds only the
 *   triples that are genuinely new.
 * - **The ruleset is embedded, not read.** `owl2rl_rules.ts` is baked from the
 *   package by `scripts/bake_owl2rl_rules.ts` so the compiled binary needs no
 *   filesystem at run time — the constructor-with-runtime path was measured to
 *   drop the baked background facts, so the rule *text* is what ships.
 *
 * Two differences in the resulting triples are known and chosen, both measured
 * during the spike:
 *
 * - **Inconsistencies are reported, not materialized.** owlrl spills
 *   `owl:Nothing` / error-namespace triples into the graph; the engine derives
 *   `inconsistencies:` report resources instead. Those, and the engine's
 *   `internal:` helpers, are filtered out: they are engine bookkeeping, and
 *   `owl:Nothing` typing is not something the wiki's queries or reports ever
 *   consumed. (owlrl's literal-conflict case is the one place a caller could
 *   notice; nothing in the ported surface reads it.)
 * - **SHACL shapes survive.** The engine reifies `sh:property` lists that owlrl
 *   ignored entirely. Those reifications are kept: `check` loads shapes out of
 *   the *data* graph, so dropping them would be a silent semantic edit made on
 *   the engine's behalf. If the parity gate prefers owlrl's blind spot here, the
 *   filter belongs in this module and nowhere else.
 * - **Literal equality (`dt-eq`) is not loaded.** The bundled rule declares
 *   `"1"^^xsd:integer owl:sameAs "1.0"^^xsd:double`, and `eq-rep-o` then copies
 *   each literal onto every subject holding an equal-valued one, so one
 *   `price: 1.00` gained a second `price` and failed `sh:maxCount 1` (#367).
 *   A literal `owl:sameAs` triple can never be stored in the graph, so those
 *   alternate lexical forms were the rule's only visible effect. OWL 2 also
 *   keeps the `xsd:double` and `owl:real` value spaces disjoint, so the
 *   cross-datatype case is wrong as well as unwanted.
 */

import { InferenceEngine } from "rdfjs-inference-engine";
import type { Config } from "./config.ts";
import type { Context } from "./context.ts";
import { getLogger } from "./logging.ts";
import { OWL2RL_N3 } from "./owl2rl_rules.ts";
import { type NamedNode, type Quad, type RdfGraph, termKey } from "./rdf.ts";

const logger = getLogger("wiki.infer");

/** Namespaces the engine uses for rule bookkeeping and divergence reports. */
const ENGINE_NAMESPACES: readonly string[] = [
  "https://www.pieter.pm/rdfjs-inference-engine/ns/internal#",
  "https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#",
];

/** `true` for a quad that is engine bookkeeping rather than wiki knowledge. */
function isEngineInternal(quad: Quad): boolean {
  return ENGINE_NAMESPACES.some((namespace) =>
    quad.subject.value.startsWith(namespace) ||
    quad.predicate.value.startsWith(namespace) ||
    quad.object.value.startsWith(namespace)
  );
}

/**
 * The bundled ruleset minus `dt-eq` (see the module comment). The rule is cut
 * by its exact text, so a re-bake that changes it fails here at load instead of
 * silently bringing literal equality back.
 */
const DT_EQ_RULE = `{ ?n1 internal:term ?lt1 .
  ?n2 internal:term ?lt2 .
  ?lt1 log:notEqualTo ?lt2 .
  ?lt1 dt:datatype ?dt1 .
  ?dt1 log:notEqualTo xsd:string .
  ?dt1 log:notEqualTo rdf:langString .
  ?lt1 dt:sameValueAs ?lt2 . }
=> { ?lt1 owl:sameAs ?lt2 . } .`;

function withoutRule(rules: string, rule: string): string {
  const normalized = rules.replaceAll("\r\n", "\n");
  const parts = normalized.split(rule);
  if (parts.length !== 2) {
    throw new Error(
      `Expected exactly one dt-eq rule in the OWL 2 RL ruleset; found ${
        parts.length - 1
      }. Re-check src/wiki/infer.ts after re-baking the rules.`,
    );
  }
  return parts.join("");
}

const OWL2RL_RULES = withoutRule(OWL2RL_N3, DT_EQ_RULE);

/** A stable key for a quad, excluding the graph (the caller is one graph). */
function tripleKey(quad: Quad): string {
  return `${termKey(quad.subject)}|${termKey(quad.predicate)}|${
    termKey(quad.object)
  }`;
}

/**
 * Apply OWL 2 RL deductive closure directly to the provided graph.
 *
 * The whole graph is used as the vocabulary, which is what makes a wiki's own
 * `.ttl` axiom files drive the expansion: `Person rdfs:subClassOf Agent` in a
 * page therefore types every `Person` in the corpus as an `Agent`, exactly as
 * the in-place owlrl expansion did.
 *
 * Load, infer, and closure are all synchronous inside the engine, exactly as
 * owlrl's expansion was, so this stays synchronous: the only async work in the
 * load path is parsing, and by the time a graph exists that has happened.
 */
export function applyInference(
  graph: RdfGraph,
  // The oracle takes the context and never reads it; kept so call sites read the
  // same on both sides (`apply_inference(graph, config)`).
  _context: Context | Config,
): RdfGraph {
  try {
    const asserted = graph.toArray();
    const engine = new InferenceEngine();
    engine.load(
      [{ n3: OWL2RL_RULES, label: "rules/owl2rl" }],
      asserted,
      { selectRuntimeRules: false },
    );

    const known = new Set(asserted.map(tripleKey));
    const add = (quad: Quad): void => {
      const key = tripleKey(quad);
      if (known.has(key)) return;
      if (isEngineInternal(quad)) return;
      known.add(key);
      // RDF/JS types a predicate as `NamedNode | Variable`; a derived quad never
      // holds a variable, and every container here wants the IRI.
      graph.add(quad.subject, quad.predicate as NamedNode, quad.object);
    };

    for (const quad of engine.getStaticClosure()) add(quad);
    for (const quad of engine.infer(asserted)) add(quad);
  } catch (error) {
    // A graph that cannot be reasoned over is still a graph: the oracle logs and
    // returns it unexpanded rather than failing the command, and the wording of
    // this message is kept verbatim so stderr stays comparable.
    logger.error(`Failed to apply OWL-RL reasoning: ${String(error)}`);
  }

  return graph;
}
