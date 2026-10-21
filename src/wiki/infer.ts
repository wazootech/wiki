/**
 * OWL 2 RL deductive closure over a wiki graph.
 *
 * Port of `src/wiki/infer.py`, which is 23 lines of `owlrl`
 * (`DeductiveClosure(OWLRL_Semantics).expand(graph)`). The engine is
 * `@wazoo/reasoner`, a semi-naive OWL 2 RL materializer that keeps `owl:sameAs`
 * as a union-find. It replaced `rdfjs-inference-engine` after matching it triple
 * for triple on the parity corpora (wazootech/reasoner `test:parity`).
 *
 * The closure is `asserted ∪ derived`, and the loader adds only the triples
 * that are genuinely new. Two differences from owlrl are known and chosen:
 *
 * - **Inconsistencies are reported, not materialized.** owlrl spills
 *   `owl:Nothing` / error-namespace triples into the graph; the reasoner lists
 *   them through `inconsistencies()` instead, and nothing in the wiki reads
 *   `owl:Nothing` typing.
 * - **The `"application"` closure view.** It leaves out what a graph store has
 *   no use for: literal subjects, reflexive `owl:sameAs`, complement-class
 *   skolems, and types whose class is a blank node. It also never derives the
 *   alternate lexical forms that `dt-eq` produced (#367), so one `price: 1.00`
 *   cannot gain a second `price` and fail `sh:maxCount 1`.
 */

import { Reasoner } from "@wazoo/reasoner";
import type { Config } from "./config.ts";
import type { Context } from "./context.ts";
import { getLogger } from "./logging.ts";
import {
  type NamedNode,
  type Quad,
  type RdfGraph,
  termKey,
  triple,
} from "./rdf.ts";

const logger = getLogger("wiki.infer");

/** A stable key for a quad, excluding the graph (the caller is one graph). */
function tripleKey(quad: Quad): string {
  return `${termKey(quad.subject)}|${termKey(quad.predicate)}|${
    termKey(quad.object)
  }`;
}

/**
 * Apply OWL 2 RL deductive closure directly to the provided graph.
 *
 * Reasoning is synchronous, exactly as owlrl's expansion was, so this stays
 * synchronous. A wiki's own axiom files still drive the expansion:
 * `Person rdfs:subClassOf Agent` in a page types every `Person` in the corpus
 * as an `Agent`, as the in-place owlrl expansion did.
 */
export function applyInference(
  graph: RdfGraph,
  // The oracle takes the context and never reads it; kept so call sites read the
  // same on both sides (`apply_inference(graph, config)`).
  _context: Context | Config,
): RdfGraph {
  try {
    // A dataset's named graph holds quads that carry their graph term; the
    // reasoner ignores the graph term (#382). `graph.add` below puts each
    // derived triple back into this graph.
    const asserted = graph.toArray().map((item) =>
      triple(item.subject, item.predicate as NamedNode, item.object)
    );
    const reasoner = new Reasoner();
    reasoner.add(asserted);
    reasoner.run();

    const known = new Set(asserted.map(tripleKey));
    for (const quad of reasoner.closure("application")) {
      const key = tripleKey(quad);
      if (known.has(key)) continue;
      known.add(key);
      // RDF/JS types a predicate as `NamedNode | Variable`; a derived quad never
      // holds a variable, and every container here wants the IRI.
      graph.add(quad.subject, quad.predicate as NamedNode, quad.object);
    }
  } catch (error) {
    // A graph that cannot be reasoned over is still a graph: the oracle logs and
    // returns it unexpanded rather than failing the command, and the wording of
    // this message is kept verbatim so stderr stays comparable.
    logger.error(`Failed to apply OWL-RL reasoning: ${String(error)}`);
  }

  return graph;
}
