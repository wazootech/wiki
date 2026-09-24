/**
 * The RDF substrate: terms, graphs, and the serialization dialects the engine
 * is contracted to.
 *
 * `rdflib` is three things to the Python engine, and the port needs all three:
 * a term model, a graph container, and an IO library. The reasoning spike
 * verified the first two (`@wazoo/sparql-engine`), but its IO coverage is one
 * format deep — it parses Turtle and nothing else — and neither
 * `@zazuko/env` nor `@zazuko/env-node` provides what the plan assumed
 * (see `probes/rdf-io/FINDINGS.md`). So IO is assembled here, deliberately, in
 * one module, with the choices written down:
 *
 * | format | parse | write |
 * |---|---|---|
 * | Turtle, TriG, N-Triples, N-Quads, RDF/XML, JSON-LD | `@zazuko/env-node` | — |
 * | Turtle (` ```turtle ` blocks, `.ttl`) | `@wazoo/sparql-engine` | — |
 * | N-Triples | — | this module, ported from rdflib's `NTSerializer` |
 * | N-Quads | — | this module, ported from `format.py`'s hand-rolled writer |
 * | Turtle, N3, TriG | — | `n3.js` |
 * | JSON-LD | — | `@zazuko/env-node` |
 * | RDF/XML | — | **unassigned**; throws rather than pretending |
 *
 * Two hazards shape the code below, both measured rather than assumed:
 *
 * - **A missing serializer is not an error.** `@zazuko/env`'s `serialize`
 *   returns canonical N-Quads when it cannot find one, so a typo or a missing
 *   registration looks like success. Every path here goes through
 *   {@link serializeRdf}, which answers a format it does not know with a
 *   thrown {@link UnsupportedFormatError}.
 * - **The two N-Triples dialects are different.** rdflib's NT serializer
 *   escapes a newline as `\n`; `Literal.n3()`, which `format.py`'s hand-rolled
 *   N-Quads writer uses, switches to a triple-quoted literal and leaves the
 *   newline raw. They are separate functions here for that reason, each ported
 *   from its own source, because one of them writes the on-disk cache and the
 *   other writes user-facing exports.
 */

import { dataFactory, parseTurtleQuads } from "@wazoo/sparql-engine";
import env from "@zazuko/env-node";
import { Readable } from "node:stream";
import { Writer } from "n3";
import type { BlankNode, Literal, NamedNode, Quad, Term } from "@rdfjs/types";

export type { BlankNode, Literal, NamedNode, Quad, Term };

/** The RDF, RDFS, and XSD vocabularies the loaders need. */
export const RDF_NS = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
export const XSD_NS = "http://www.w3.org/2001/XMLSchema#";
export const RDF_TYPE = `${RDF_NS}type`;
export const RDF_FIRST = `${RDF_NS}first`;
export const RDF_REST = `${RDF_NS}rest`;
export const RDF_NIL = `${RDF_NS}nil`;
export const XSD_STRING = `${XSD_NS}string`;
export const XSD_BOOLEAN = `${XSD_NS}boolean`;
export const XSD_INTEGER = `${XSD_NS}integer`;
export const XSD_DECIMAL = `${XSD_NS}decimal`;
export const XSD_DOUBLE = `${XSD_NS}double`;
export const XSD_DATETIME = `${XSD_NS}dateTime`;
export const XSD_DATE = `${XSD_NS}date`;

/** The RDF/JS data factory the whole port builds terms with. */
export const factory = dataFactory;

/** A node that can be a subject or object. */
export function namedNode(iri: string): NamedNode {
  return dataFactory.namedNode(iri);
}

/** A blank node, optionally with a stable label. */
export function blankNode(label?: string): BlankNode {
  return label === undefined
    ? dataFactory.blankNode()
    : dataFactory.blankNode(label);
}

/** Options for {@link literal}: at most one of `language` and `datatype`. */
export interface LiteralOptions {
  readonly language?: string;
  readonly datatype?: string;
}

/**
 * A literal.
 *
 * RDF/JS gives every literal a datatype (`xsd:string` by default), while
 * rdflib distinguishes a "plain" literal from an `xsd:string`-typed one. The
 * distinction survives: the unit tests compare against rdflib's own output, and
 * both encoders below treat `xsd:string` as suffix-free, which is what makes
 * them agree.
 */
export function literal(value: string, options: LiteralOptions = {}): Literal {
  if (options.language !== undefined) {
    return dataFactory.literal(value, options.language);
  }
  if (options.datatype !== undefined) {
    return dataFactory.literal(value, dataFactory.namedNode(options.datatype));
  }
  return dataFactory.literal(value);
}

/** Build a triple. */
export function triple(
  subject: Term,
  predicate: NamedNode,
  object: Term,
): Quad {
  return dataFactory.quad(subject, predicate, object);
}

/** Build a quad in a named graph. */
export function quad(
  subject: Term,
  predicate: NamedNode,
  object: Term,
  graph: NamedNode,
): Quad {
  return dataFactory.quad(subject, predicate, object, graph);
}

// ---------------------------------------------------------------------------
// Formats
// ---------------------------------------------------------------------------

/** The format names the Python engine passes to rdflib. */
export type RdfFormat =
  | "turtle"
  | "ttl"
  | "n3"
  | "trig"
  | "nt"
  | "nquads"
  | "xml"
  | "json-ld";

/** Normalize the aliases rdflib accepts, so `ttl` and `jsonld` both work. */
export function normalizeFormat(format: string): RdfFormat {
  switch (format.toLowerCase()) {
    case "turtle":
    case "ttl":
      return "turtle";
    case "n3":
      return "n3";
    case "trig":
      return "trig";
    case "nt":
    case "ntriples":
    case "n-triples":
      return "nt";
    case "nquads":
    case "n-quads":
      return "nquads";
    case "xml":
    case "rdf/xml":
      return "xml";
    case "json-ld":
    case "jsonld":
      return "json-ld";
    default:
      throw new UnsupportedFormatError(format);
  }
}

/** The media type a normalized format maps to in the `@zazuko` registries. */
export function mediaTypeFor(format: RdfFormat): string {
  switch (format) {
    case "turtle":
    case "ttl":
      return "text/turtle";
    case "n3":
      return "text/n3";
    case "trig":
      return "application/trig";
    case "nt":
      return "application/n-triples";
    case "nquads":
      return "application/n-quads";
    case "xml":
      return "application/rdf+xml";
    case "json-ld":
      return "application/ld+json";
  }
}

/** Raised for a format the engine does not implement. */
export class UnsupportedFormatError extends Error {
  constructor(format: string, direction: "parse" | "serialize" = "serialize") {
    super(`Unsupported ${direction} format: ${format}`);
    this.name = "UnsupportedFormatError";
  }
}

/** Every format the engine can parse. */
export function canParse(format: string): boolean {
  try {
    return env.formats.parsers.get(mediaTypeFor(normalizeFormat(format))) !==
      undefined;
  } catch {
    return false;
  }
}

/**
 * Every format the engine can write.
 *
 * `xml` is absent on purpose: no library in the chosen stack has an RDF/XML
 * writer, and the phase-5 probe deliberately left it unassigned rather than
 * papering over it with N-Quads.
 */
export function canSerialize(format: string): boolean {
  try {
    return normalizeFormat(format) !== "xml";
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Term rendering
// ---------------------------------------------------------------------------

/** Escape a string for N-Triples, copying rdflib's `NTSerializer._quote_encode`. */
function quoteLiteralNt(value: string): string {
  return `"${
    value
      .replaceAll("\\", "\\\\")
      .replaceAll("\n", "\\n")
      .replaceAll('"', '\\"')
      .replaceAll("\r", "\\r")
  }"`;
}

/** The datatype suffix rdflib writes, or `""` for a plain literal. */
function literalSuffix(node: Literal): string {
  const language = node.language;
  if (language !== "") return `@${language}`;
  const datatype = node.datatype.value;
  if (datatype === XSD_STRING) return "";
  return `^^<${datatype}>`;
}

/**
 * Render a term the way rdflib's `NTSerializer` does.
 *
 * Tabs and other control characters are left raw, on purpose: rdflib does not
 * escape them, and the disk cache is compared against rdflib's own output.
 */
export function ntTerm(node: Term): string {
  switch (node.termType) {
    case "NamedNode":
      return `<${node.value}>`;
    case "BlankNode":
      return `_:${node.value}`;
    case "Literal":
      return `${quoteLiteralNt(node.value)}${literalSuffix(node)}`;
    default:
      return `<${node.value}>`;
  }
}

/**
 * Render a literal the way rdflib's `Literal.n3()` does.
 *
 * The difference from {@link ntTerm} is the whole point of having both: a value
 * containing a newline is written triple-quoted with the newline left raw, so
 * the rendered string spans lines. `format.py`'s N-Quads writer is built on
 * `n3()`, so its output has that shape.
 */
export function n3Term(node: Term): string {
  switch (node.termType) {
    case "NamedNode":
      return `<${node.value}>`;
    case "BlankNode":
      return `_:${node.value}`;
    case "Literal":
      return `${quoteLiteralN3(node.value)}${literalSuffix(node)}`;
    default:
      return `<${node.value}>`;
  }
}

/** rdflib's `Literal._quote_encode`. */
function quoteLiteralN3(value: string): string {
  if (value.includes("\n")) {
    let encoded = value.replaceAll("\\", "\\\\");
    if (value.includes('"""')) encoded = encoded.replaceAll('"""', '\\"\\"\\"');
    // A trailing quote would otherwise read as the closing delimiter.
    if (encoded.endsWith('"') && !encoded.endsWith('\\"')) {
      encoded = `${encoded.slice(0, -1)}\\"`;
    }
    return `"""${encoded.replaceAll("\r", "\\r")}"""`;
  }
  return `"${
    value
      .replaceAll("\\", "\\\\")
      .replaceAll('"', '\\"')
      .replaceAll("\r", "\\r")
  }"`;
}

/**
 * Render triples as N-Triples, the way rdflib's `NTSerializer` does.
 *
 * This writes the `.wiki/cache/*.nt` file, so its bytes are the contract.
 */
export function serializeNt(quads: readonly Quad[]): string {
  return quads
    .map((item) =>
      `${ntTerm(item.subject)} ${ntTerm(item.predicate)} ${
        ntTerm(item.object)
      } .`
    )
    .join("\n") + (quads.length > 0 ? "\n" : "");
}

/**
 * Render triples as N-Quads, the way `format.py`'s hand-rolled writer does.
 *
 * That function is `f"{s.n3()} {p.n3()} {o.n3()} ."` per triple, so it is
 * N-Triples spelled with `n3()` — which is why a multi-line literal looks
 * different here than in {@link serializeNt}.
 */
export function serializeNquads(quads: readonly Quad[]): string {
  return quads
    .map((item) =>
      `${n3Term(item.subject)} ${n3Term(item.predicate)} ${
        n3Term(item.object)
      } .`
    )
    .join("\n") + (quads.length > 0 ? "\n" : "");
}

/**
 * Render a dataset as N-Quads, carrying each quad's graph.
 *
 * Distinct from {@link serializeNquads} on purpose: this is the *formal*
 * N-Quads dialect used for the `.wiki/cache/*.nq` file, whereas the engine's
 * `export --format nquads` path is the hand-rolled `n3()` writer above. Both
 * round-trip; only the export path has an oracle byte contract.
 */
export function serializeNquadsDataset(quads: readonly Quad[]): string {
  return quads
    .map((item) => {
      const graph = item.graph.termType === "DefaultGraph"
        ? ""
        : ` ${ntTerm(item.graph)}`;
      return `${ntTerm(item.subject)} ${ntTerm(item.predicate)} ${
        ntTerm(item.object)
      }${graph} .`;
    })
    .join("\n") + (quads.length > 0 ? "\n" : "");
}

// ---------------------------------------------------------------------------
// Parsing and serializing
// ---------------------------------------------------------------------------

/**
 * Parse Turtle with the store's own parser.
 *
 * Used for ` ```turtle ` blocks and `.ttl` files so a block parses exactly as
 * the query engine would see it; the other formats go through the registry
 * below, because the store's parser is Turtle-only.
 */
export function parseTurtle(text: string): Quad[] {
  return parseTurtleQuads(text) as unknown as Quad[];
}

/** Parse RDF in any registered format. */
export async function parseRdf(text: string, format: string): Promise<Quad[]> {
  const normalized = normalizeFormat(format);
  const parser = env.formats.parsers.get(mediaTypeFor(normalized));
  if (parser === undefined) throw new UnsupportedFormatError(format, "parse");
  // deno-lint-ignore no-explicit-any -- rdf-parse takes a Node Readable
  const stream = parser.import(Readable.from([text]) as any);
  if (stream === null) throw new UnsupportedFormatError(format, "parse");
  const dataset = await env.dataset().import(stream);
  return [...dataset] as unknown as Quad[];
}

/**
 * Prefix bindings a serializer may abbreviate IRIs with.
 *
 * Both shapes are accepted because `Context.namespaces` is a `Map` and
 * `Record` is what a caller writes inline; the dispatch is on `Symbol.iterator`
 * rather than `instanceof Map`, which does not narrow a `ReadonlyMap`.
 */
export type PrefixTable =
  | ReadonlyMap<string, string>
  | Readonly<Record<string, string>>;

function prefixObject(
  prefixes: PrefixTable | undefined,
): Record<string, string> {
  if (prefixes === undefined) return {};
  const iterable = prefixes as Iterable<readonly [string, string]>;
  if (typeof iterable[Symbol.iterator] === "function") {
    return Object.fromEntries(iterable);
  }
  return { ...(prefixes as Readonly<Record<string, string>>) };
}

/**
 * Serialize triples in any format the engine can write.
 *
 * Always consulted instead of a library's own `serialize`, because a miss there
 * is silent (see the module doc). An unassigned format raises.
 */
export async function serializeRdf(
  quads: readonly Quad[],
  format: string,
  options: { prefixes?: PrefixTable } = {},
): Promise<string> {
  const normalized = normalizeFormat(format);
  if (normalized === "nt") return serializeNt(quads);
  if (normalized === "nquads") return serializeNquads(quads);
  if (normalized === "xml") throw new UnsupportedFormatError(format);

  if (normalized === "json-ld") {
    if (env.formats.serializers.get(mediaTypeFor(normalized)) === undefined) {
      throw new UnsupportedFormatError(format);
    }
    return await env.dataset(quads as Quad[])
      .serialize({ format: mediaTypeFor(normalized) as never });
  }

  // Turtle, N3 and TriG: n3.js, because the registry's Turtle writer emits
  // N-Triples under a Turtle media type.
  return await new Promise<string>((resolve, reject) => {
    const writer = new Writer({
      format: normalized === "trig"
        ? "TriG"
        : normalized === "n3"
        ? "N3"
        : "Turtle",
      prefixes: prefixObject(options.prefixes),
    });
    writer.addQuads(quads as never[]);
    writer.end((error: Error | null, result: string) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
}

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
      if (subject !== null && item.subject.value !== subject.value) continue;
      if (predicate !== null && item.predicate.value !== predicate.value) {
        continue;
      }
      if (object !== null && item.object.value !== object.value) continue;
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
