import { SH } from "../context.ts";
import type { Config } from "../config.ts";
import { loadGraph } from "../graph.ts";
import { RDF_FIRST, RDF_REST, RDF_TYPE, RdfGraph, termKey } from "../rdf.ts";

/** The two SHACL node types whose own triples are part of the shapes graph. */
const SHAPE_TYPES: ReadonlySet<string> = new Set([
  `${SH}NodeShape`,
  `${SH}PropertyShape`,
]);

/**
 * Extract the shapes a data graph declares.
 *
 * Port of `load_shapes`'s SPARQL CONSTRUCT. The query is a *selection*, not an
 * evaluation: nothing is derived, so reproducing it directly over the graph is
 * the same set of triples without depending on a SPARQL layer that phase 7
 * ports. Its five UNION branches are:
 *
 * 1. every triple whose predicate is in the `sh:` namespace;
 * 2. every triple of a node explicitly typed `sh:NodeShape`/`sh:PropertyShape`;
 * 3. every triple of a node that is the *object* of an `sh:` predicate
 *    (anonymous constraint blocks);
 * 4. every triple of a node reachable from such an object by
 *    `(rdf:rest|rdf:first)*` (the cons cells of an RDF list, including the
 *    cells of a list nested as a member of another); and
 * 5. every triple of each list *element* — the `rdf:first` of any of those
 *    nodes — because a list of property shapes holds the shapes themselves.
 *
 * Branch 5 is the one that is easy to miss and impossible to notice when it is
 * missing: the constraint block validates anyway, and only a list-valued
 * `sh:property`/`sh:in` silently loses its contents. Branch 4 follows
 * `rdf:first` as well as `rdf:rest` for the same reason one level down: a
 * sequence path nested in `sh:alternativePath` (SHACL §2.3.1.3) is a list whose
 * head is a list element, and `rdf:rest*` alone truncates it after one cell.
 */
export function loadShapes(dataGraph: RdfGraph): RdfGraph {
  const shapes = new RdfGraph();
  shapes.bind("sh", SH);

  const quads = dataGraph.toArray();

  // Objects of `sh:` predicates: nested blocks, and RDF list heads.
  const shObjects = new Set<string>();
  for (const quad of quads) {
    if (quad.predicate.value.startsWith(SH)) {
      shObjects.add(termKey(quad.object));
    }
  }

  // Branch 4: `(rdf:rest|rdf:first)*` from every list head, the head included.
  const listReachable = new Set<string>(shObjects);
  const listEdges = new Map<string, string[]>();
  for (const quad of quads) {
    if (
      quad.predicate.value !== RDF_REST && quad.predicate.value !== RDF_FIRST
    ) continue;
    const from = termKey(quad.subject);
    const list = listEdges.get(from) ?? [];
    list.push(termKey(quad.object));
    listEdges.set(from, list);
  }
  const pending = [...listReachable];
  while (pending.length > 0) {
    const node = pending.pop() as string;
    for (const next of listEdges.get(node) ?? []) {
      if (listReachable.has(next)) continue;
      listReachable.add(next);
      pending.push(next);
    }
  }

  // Branch 5: the `rdf:first` of every node on those chains.
  const listElements = new Set<string>();
  for (const quad of quads) {
    if (quad.predicate.value !== RDF_FIRST) continue;
    if (!listReachable.has(termKey(quad.subject))) continue;
    listElements.add(termKey(quad.object));
  }

  const typedShapes = new Set<string>();
  for (const quad of quads) {
    if (
      quad.predicate.value === RDF_TYPE && SHAPE_TYPES.has(quad.object.value)
    ) {
      typedShapes.add(termKey(quad.subject));
    }
  }

  for (const quad of quads) {
    const subject = termKey(quad.subject);
    if (
      quad.predicate.value.startsWith(SH) ||
      typedShapes.has(subject) ||
      shObjects.has(subject) ||
      listReachable.has(subject) ||
      listElements.has(subject)
    ) {
      shapes.addQuad(quad);
    }
  }

  return shapes;
}

/**
 * The shapes the per-file pass validates against: those the wiki declares,
 * read from the uninferred graph.
 *
 * Extracting them scans every quad in the corpus, so a caller validating
 * several files builds this once and passes it to {@link checkShaclFile}.
 */
export async function loadWikiShapes(config: Config): Promise<RdfGraph> {
  return loadShapes(await loadGraph(config, { infer: false }));
}
