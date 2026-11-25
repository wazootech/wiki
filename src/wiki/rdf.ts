/**
 * The RDF substrate: terms, graphs, and the serialization dialects the engine
 * is contracted to.
 *
 * `rdflib` is three things to the Python engine, and the port needs all three:
 * a term model, a graph container, and an IO library. The reasoning spike
 * verified the first two (`@wazoo/sparql-engine`), but it writes no
 * serialization at all — it parses Turtle, TriG, N-Triples, and N-Quads and
 * emits nothing — and neither
 * `@zazuko/env` nor `@zazuko/env-node` provides what the plan assumed
 * (see `probes/rdf-io/FINDINGS.md`). So IO is assembled here, deliberately, in
 * one module, with the choices written down:
 *
 * | format | parse | write |
 * |---|---|---|
 * | Turtle, TriG, N-Triples, N-Quads, RDF/XML, JSON-LD (non-Turtle surfaces) | `@zazuko/env-node` | — |
 * | Turtle (` ```turtle ` blocks, `.ttl`) | `@wazoo/sparql-engine` | — |
 * | N-Triples | — | this module, ported from rdflib's `NTSerializer` |
 * | N-Quads | — | this module, ported from `format.py`'s hand-rolled writer |
 * | Turtle, N3, TriG | — | `n3.js` |
 * | JSON-LD | — | `@zazuko/env-node` |
 * | RDF/XML | — | **deferred from the initial cutover**; throws clearly |
 *
 * Two hazards shape the code below, both measured rather than assumed:
 *
 * - **A missing serializer is not an error.** `@zazuko/env`'s `serialize`
 *   returns canonical N-Quads when it cannot find one, so a typo or a missing
 *   registration looks like success. Every path here goes through
 *   {@link serializeRdf}, which answers an unsupported format with a
 *   thrown {@link UnsupportedFormatError}. RDF/XML serialization is an
 *   intentional first-release omission, not a silent serializer fallback.
 * - **The two N-Triples dialects are different.** rdflib's NT serializer
 *   escapes a newline as `\n`; `Literal.n3()`, which `format.py`'s hand-rolled
 *   N-Quads writer uses, switches to a triple-quoted literal and leaves the
 *   newline raw. They are separate functions here for that reason, each ported
 *   from its own source, because one of them writes the on-disk cache and the
 *   other writes user-facing exports.
 */

import type { BlankNode, Literal, NamedNode, Quad, Term } from "@rdfjs/types";
import { namedNode } from "./rdf/terms.ts";
import { RdfGraph } from "./rdf/graph.ts";

export type { BlankNode, Literal, NamedNode, Quad, Term };
export {
  blankNode,
  factory,
  literal,
  type LiteralOptions,
  namedNode,
  quad,
  RDF_FIRST,
  RDF_NIL,
  RDF_NS,
  RDF_REST,
  RDF_TYPE,
  triple,
  XSD_BOOLEAN,
  XSD_DATE,
  XSD_DATETIME,
  XSD_DECIMAL,
  XSD_DOUBLE,
  XSD_INTEGER,
  XSD_NS,
  XSD_STRING,
} from "./rdf/terms.ts";
export {
  canParse,
  canSerialize,
  mediaTypeFor,
  normalizeFormat,
  type RdfFormat,
  UnsupportedFormatError,
} from "./rdf/formats.ts";
export {
  n3Term,
  ntTerm,
  serializeNquads,
  serializeNquadsDataset,
  serializeNt,
} from "./rdf/serialize_terms.ts";
export {
  parseRdf,
  parseTurtle,
  type PrefixTable,
  serializeRdf,
} from "./rdf/serialize.ts";
export { RdfGraph, termKey } from "./rdf/graph.ts";

/**
 * A set of named graphs with a union view, standing in for
 * `rdflib.Dataset(default_union=True)`.
 *
 * The union matters: `sparql_service` and `query` read the dataset unscoped,
 * while a `GRAPH` clause addresses one named graph. Both must see the same
 * triples, so the union is derived rather than stored.
 */
export class RdfDataset implements Iterable<Quad> {
  readonly #graphs = new Map<string, RdfGraph>();
  readonly #bindings = new Map<string, string>();
  /** `true` when unscoped queries see every named graph (the Python default). */
  readonly defaultUnion: boolean;
  vocab: string | null = null;

  constructor(options: { defaultUnion?: boolean } = {}) {
    this.defaultUnion = options.defaultUnion ?? false;
  }

  /** The prefixes bound to the dataset, in binding order. */
  get bindings(): ReadonlyMap<string, string> {
    return this.#bindings;
  }

  /** Bind a prefix on the dataset (and, by inheritance, its graphs). */
  bind(prefix: string, iri: string): void {
    this.#bindings.set(prefix, iri);
  }

  /** The {@link NamespaceBinder} entry point; see `RdfGraph.set`. */
  set(prefix: string, iri: string): void {
    this.bind(prefix, iri);
  }

  /** The named graph with this IRI, created on first use. */
  graph(iri: string | NamedNode): RdfGraph {
    const key = typeof iri === "string" ? iri : iri.value;
    let graph = this.#graphs.get(key);
    if (graph === undefined) {
      graph = new RdfGraph({ graph: namedNode(key) });
      for (const [prefix, iriValue] of this.#bindings) {
        graph.bind(prefix, iriValue);
      }
      graph.vocab = this.vocab;
      this.#graphs.set(key, graph);
    }
    return graph;
  }

  /** The names of the named graphs, in creation order. */
  graphNames(): string[] {
    return [...this.#graphs.keys()];
  }

  /** The named graphs themselves, in creation order. */
  graphs(): RdfGraph[] {
    return [...this.#graphs.values()];
  }

  /** Every quad in the dataset, across all named graphs. */
  *[Symbol.iterator](): Iterator<Quad> {
    for (const graph of this.#graphs.values()) yield* graph;
  }

  /** The total number of quads. */
  get size(): number {
    let total = 0;
    for (const graph of this.#graphs.values()) total += graph.size;
    return total;
  }

  /** Add a quad to a named graph. */
  addQuad(item: Quad): void {
    const name = item.graph.termType === "DefaultGraph" ? "" : item.graph.value;
    this.graph(name).addQuad(item);
  }
}
