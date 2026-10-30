import { namedNode, RDF_TYPE, RdfGraph } from "../rdf.ts";
import type { Config } from "../config.ts";
import type { Context } from "../context.ts";
import type { DataRecord } from "../parser.ts";
import type { DerivedMetadata } from "../derived.ts";
import { expandCurie, isPresent, isTruthy, resolveType } from "./terms.ts";
import { resolveObject } from "./object_terms.ts";
import { effectiveTypes, rdfBinding } from "./types.ts";
import { addDerived } from "./document_support.ts";

/** Options for {@link frontmatterToGraph}, mirroring the oracle's keywords. */
export interface FrontmatterGraphOptions {
  /** The page's route, used to build a subject when frontmatter has no `@id`. */
  readonly fileId?: string | null;
  /** The markdown body to fold into the content predicate. */
  readonly body?: string | null;
  readonly includeFileExtension?: boolean;
  /** The document's extension, used when `includeFileExtension` is set. */
  readonly fileExt?: string;
  readonly contentPredicate?: string | null;
  /**
   * Metadata derived from the document (wiki#318): its H1 and Git dates. Each
   * value is added only when no frontmatter key already gives the subject that
   * predicate, so an explicit value always wins.
   */
  readonly derived?: DerivedMetadata | null;
}

/** Convert a parsed frontmatter mapping into an RDF graph. */
export function frontmatterToGraph(
  data: DataRecord | null | undefined,
  context: Context | Config,
  options: FrontmatterGraphOptions = {},
): RdfGraph {
  const binding = rdfBinding(context);
  const rdfContext = binding.context;
  const contentPredicate = options.contentPredicate ?? binding.contentPredicate;
  const includeFileExtension = options.includeFileExtension ?? false;
  const fileExt = options.fileExt ?? ".md";
  const fileId = options.fileId ?? null;
  const body = options.body ?? null;

  const graph = new RdfGraph();
  rdfContext.bindNamespaces(graph);
  graph.vocab = rdfContext.vocab;

  const record: DataRecord = data ?? {};
  const types = effectiveTypes(record, context);
  if (!isTruthy(record) || types.length === 0) return graph;

  let docId = isTruthy(record["@id"]) ? record["@id"] : record["id"];
  if (!isTruthy(docId)) {
    // No `@id` and no route to derive one from: Python returns a *fresh*
    // unbound `Graph()` here rather than the graph built above. The triple set
    // is empty either way, so returning the bound graph is indistinguishable —
    // and one less place for a namespace binding to mysteriously vanish.
    if (!isTruthy(fileId)) return graph;
    docId = `${rdfContext.baseIri}${fileId}${
      includeFileExtension ? fileExt : ""
    }`;
  }

  let subjectIri = String(docId);
  if (subjectIri.includes(":")) {
    const expanded = expandCurie(subjectIri, rdfContext);
    if (expanded !== null) subjectIri = expanded;
  }
  const subject = namedNode(subjectIri);

  for (const item of types) {
    const resolved = resolveType(item, rdfContext);
    if (resolved !== null) graph.add(subject, namedNode(RDF_TYPE), resolved);
  }

  const skipKeys = new Set(["id", "type", "@type"]);
  for (const [key, value] of Object.entries(record)) {
    if (key.startsWith("@") || skipKeys.has(key)) continue;
    if (isPresent(value)) resolveObject(key, value, graph, subject, rdfContext);
  }

  if (options.derived) {
    addDerived(graph, subject, options.derived, rdfContext);
  }

  if (isTruthy(body) && isTruthy(contentPredicate)) {
    resolveObject(contentPredicate!, body, graph, subject, rdfContext);
  }

  return graph;
}
