import { IS_WINDOWS } from "../fspath.ts";
import type { NamedNode, Quad, Term } from "../rdf.ts";
import {
  blankNode,
  factory,
  literal,
  namedNode,
  type RdfGraph,
  XSD_DATETIME,
} from "../rdf.ts";
import type { Config } from "../config.ts";
import type { Context } from "../context.ts";
import { iterDocumentFiles } from "../paths.ts";
import {
  DERIVED_PROPERTIES,
  type DerivedMetadata,
  derivedPredicate,
  deriveMetadataAll,
  isDateProperty,
} from "../derived.ts";

/**
 * Fill the subject's derived properties that frontmatter left unset.
 *
 * "Unset" is decided on the graph, after every frontmatter key has resolved,
 * so any key that names the same predicate IRI counts as explicit: `headline`
 * under a schema.org `@vocab` and `schema:headline` both win.
 */
export function addDerived(
  graph: RdfGraph,
  subject: NamedNode,
  derived: DerivedMetadata,
  context: Context,
): void {
  for (const property of DERIVED_PROPERTIES) {
    const value = derived[property];
    if (value === null) continue;
    const pred = namedNode(derivedPredicate(property, context));
    if (!graph.match(subject, pred, null).next().done) continue;
    graph.add(
      subject,
      pred,
      isDateProperty(property)
        ? literal(value, { datatype: XSD_DATETIME })
        : literal(value),
    );
  }
}

/**
 * Add quads into a container, applying the *container's* graph name.
 *
 * `RdfGraph.addAll` preserves each quad's own graph, which is right for a plain
 * graph and wrong here: a document parsed on its own carries the default graph,
 * but in a dataset it must land in that source's named graph. Python gets this
 * from rdflib's context-aware store (`dataset.graph(uri) += other`); the port
 * gets it by re-adding subject/predicate/object through `add`.
 */
function addQuads(target: RdfGraph, quads: Iterable<Quad>): void {
  for (const item of quads) {
    target.add(item.subject, item.predicate as NamedNode, item.object);
  }
}

/** A stable key that accounts for case-insensitive Windows filesystem paths. */
export function pathKey(path: string): string {
  const value = path;
  return IS_WINDOWS ? value.toLowerCase() : value;
}

export function scopeTurtleBlock(
  quads: readonly Quad[],
  filePath: string,
  blockIndex: number,
): Quad[] {
  const scope = [...new TextEncoder().encode(`${filePath}:${blockIndex}`)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const blankNodes = new Map<string, ReturnType<typeof blankNode>>();
  const scopeTerm = (term: Term): Term => {
    if (term.termType !== "BlankNode") return term;
    let scoped = blankNodes.get(term.value);
    if (scoped === undefined) {
      scoped = blankNode(`wiki_${scope}_${blankNodes.size}`);
      blankNodes.set(term.value, scoped);
    }
    return scoped;
  };

  return quads.map((item) =>
    factory.quad(
      scopeTerm(item.subject) as Quad["subject"],
      item.predicate,
      scopeTerm(item.object) as Quad["object"],
      item.graph,
    )
  );
}

/** The bodies of a page's ` ```turtle ` blocks, in document order. */
export function turtleBlocks(content: string): string[] {
  return [...content.matchAll(/```turtle\s*([\s\S]*?)```/g)].map((match) =>
    match[1]!.trim()
  );
}

/** Add quads to every target graph. */
export function addQuadsTo(
  targets: readonly RdfGraph[],
  quads: Iterable<Quad>,
): void {
  const items = [...quads];
  for (const target of targets) addQuads(target, items);
}

/** File extensions rdflib is asked to parse directly, as format names. */
export const EXT_FORMAT_MAP: ReadonlyMap<string, string> = new Map([
  [".ttl", "turtle"],
  [".trig", "trig"],
  [".nt", "nt"],
  [".nq", "nquads"],
  [".rdf", "xml"],
  [".xml", "xml"],
  [".jsonld", "json-ld"],
]);

/**
 * Every document file, keyed by {@link pathKey}, with its derived metadata.
 *
 * Derived up front, not per file inside the walk, so the Git calls run
 * concurrently rather than one after another.
 */
export async function documentMetadata(
  config: Config,
): Promise<Map<string, DerivedMetadata>> {
  const files = iterDocumentFiles(config);
  const derived = await deriveMetadataAll(files);
  return new Map(files.map((file) => [pathKey(file), derived.get(file)!]));
}
