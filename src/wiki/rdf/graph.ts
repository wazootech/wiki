import { dataFactory } from "@wazoo/sparql-engine";
import type { NamedNode, Quad, Term } from "@rdfjs/types";
import { quad, triple } from "./terms.ts";

// ---------------------------------------------------------------------------
// Graph containers
// ---------------------------------------------------------------------------

/**
 * A set of triples, with the operations the loaders and cache need.
 *
 * Backed by an insertion-ordered quad list plus a key set for deduplication:
 * the engine holds whole wikis (thousands of triples, not millions) and relies
 * on membership tests far more than on iteration order.
 */
export class RdfGraph {
  readonly #quads: Quad[] = [];
  readonly #keys = new Set<string>();
  readonly #graph: NamedNode | null;
  readonly #bindings = new Map<string, string>();
  /** JSON-LD `@vocab`, which decides how a bare frontmatter key is named. */
  vocab: string | null = null;

  constructor(options: { graph?: NamedNode } = {}) {
    this.#graph = options.graph ?? null;
  }

  /** The prefixes bound to this graph, in binding order. */
  get bindings(): ReadonlyMap<string, string> {
    return this.#bindings;
  }

  /** The named graph this container writes into, if any. */
  get graphName(): NamedNode | null {
    return this.#graph;
  }

  /** The number of triples. */
  get size(): number {
    return this.#quads.length;
  }

  /** Bind a prefix, as `Context.bind_namespaces` does. */
  bind(prefix: string, iri: string): void {
    this.#bindings.set(prefix, iri);
  }

  /**
   * The {@link NamespaceBinder} entry point.
   *
   * `Context.bindNamespaces` calls `set`, so a graph has to answer to that name
   * as well as to rdflib's `bind`; there is one implementation behind both.
   */
  set(prefix: string, iri: string): void {
    this.bind(prefix, iri);
  }

  /** Add a triple; adding the same triple twice is a no-op. */
  add(subject: Term, predicate: NamedNode, object: Term): void {
    const item = this.#graph === null
      ? dataFactory.quad(subject, predicate, object)
      : dataFactory.quad(subject, predicate, object, this.#graph);
    const key = quadKey(item);
    if (this.#keys.has(key)) return;
    this.#keys.add(key);
    this.#quads.push(item);
  }

  /** Add an existing quad, keeping its graph. */
  addQuad(item: Quad): void {
    const key = quadKey(item);
    if (this.#keys.has(key)) return;
    this.#keys.add(key);
    this.#quads.push(item);
  }

  /** Add every quad of another graph or dataset. */
  addAll(other: Iterable<Quad>): void {
    for (const item of other) this.addQuad(item);
  }

  /**
   * `true` when the triple is present.
   *
   * A named-graph container keys its quads *with* the graph name, so the probe
   * has to be keyed the same way — probing with a default-graph quad against a
   * named graph is a comparison that can never match, which reads as "absent"
   * for every triple in a `Dataset`.
   */
  has(subject: Term, predicate: NamedNode, object: Term): boolean {
    const item = this.#graph === null
      ? triple(subject, predicate, object)
      : quad(subject, predicate, object, this.#graph);
    return this.#keys.has(quadKey(item));
  }

  /** Match triples, with `null` meaning "any". */
  *match(
    subject: Term | null = null,
    predicate: NamedNode | null = null,
    object: Term | null = null,
  ): Generator<Quad> {
    for (const item of this.#quads) {
      if (subject !== null && termKey(item.subject) !== termKey(subject)) {
        continue;
      }
      if (
        predicate !== null && termKey(item.predicate) !== termKey(predicate)
      ) {
        continue;
      }
      if (object !== null && termKey(item.object) !== termKey(object)) continue;
      yield item;
    }
  }

  /** Every triple, in insertion order. */
  *triples(): Generator<Quad> {
    yield* this.#quads;
  }

  /** Every distinct subject. */
  *subjects(): Generator<Term> {
    const seen = new Set<string>();
    for (const item of this.#quads) {
      const key = termKey(item.subject);
      if (seen.has(key)) continue;
      seen.add(key);
      yield item.subject;
    }
  }

  /** Every distinct predicate. */
  *predicates(): Generator<NamedNode> {
    const seen = new Set<string>();
    for (const item of this.#quads) {
      const key = termKey(item.predicate);
      if (seen.has(key)) continue;
      seen.add(key);
      // RDF/JS types a predicate as `NamedNode | Variable`; a loaded wiki never
      // holds a variable, and every caller wants the IRI.
      yield item.predicate as NamedNode;
    }
  }

  /** Every distinct object. */
  *objects(): Generator<Term> {
    const seen = new Set<string>();
    for (const item of this.#quads) {
      const key = termKey(item.object);
      if (seen.has(key)) continue;
      seen.add(key);
      yield item.object;
    }
  }

  /** The triples as a plain array. */
  toArray(): Quad[] {
    return [...this.#quads];
  }

  [Symbol.iterator](): Iterator<Quad> {
    return this.#quads[Symbol.iterator]();
  }
}

/** A stable key for a quad, so the containers can deduplicate. */
function quadKey(item: Quad): string {
  return `${termKey(item.subject)}|${termKey(item.predicate)}|${
    termKey(item.object)
  }` +
    `|${item.graph.termType === "DefaultGraph" ? "" : item.graph.value}`;
}

/** A stable key for a term, including its datatype or language. */
export function termKey(node: Term): string {
  switch (node.termType) {
    case "Literal":
      return `L:${node.value}|${node.language}|${node.datatype.value}`;
    case "BlankNode":
      return `B:${node.value}`;
    case "DefaultGraph":
      return "D:";
    default:
      return `N:${node.value}`;
  }
}
