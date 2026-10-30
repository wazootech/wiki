/**
 * Wiki graph loading: frontmatter-to-triple conversion, blank nodes, and the
 * named-graph dataset.
 *
 * Port of `src/wiki/graph.py`. This is the module where frontmatter stops being
 * data and becomes RDF, so most of the rules here are about *identity* — what
 * a page's subject URI is, when a nested mapping becomes a blank node, and
 * which frontmatter key resolves to which predicate:
 *
 * - A page's subject is `@id`/`id` when present (with `prefix:name` CURIEs
 *   expanded against the configured namespaces), and otherwise
 *   `{base_iri}{route}` — with the file extension appended when
 *   `graph.include_file_extension` asks for it.
 * - A nested mapping becomes a blank node, or a URI reference when it carries
 *   `@id`, or a *typed* blank node when it carries `@type`.
 * - `resolve_predicate` resolves `prefix:local` first, then `wiki.*`, then the
 *   `@vocab` fallback — and returns nothing at all when `@vocab` is configured
 *   as empty, which is how a wiki opts out of unprefixed keys entirely.
 *
 * Three port-level differences are deliberate:
 *
 * - **The loaders are async.** rdflib parses synchronously; the port's N-Triples
 *   / N-Quads / RDF-XML parsers come from `@zazuko/env-node`, whose streams are
 *   async, and the disk cache in `graph_cache.ts` is already async. Awaiting a
 *   graph build is the same call shape, one `await` further out.
 * - **`applyInference` is imported lazily.** The Python module imports `infer`
 *   inside the function, which keeps owlrl out of commands that never load a
 *   graph; the port does the same for the baked OWL 2 RL ruleset, which is
 *   ~37 KB of text no `wiki --version` should pay for.
 * - **Two value shapes cannot be reproduced exactly**, both because JavaScript
 *   has fewer number types than Python (see `numericLiteral` and
 *   `temporalLiteral`): a YAML `30.0` arrives as `30`, and a YAML date arrives
 *   as a `Date` with no record of whether the source wrote a date or a
 *   date-time. Both need the document layer to record the lexical form, and are
 *   flagged where they happen rather than papered over.
 */

import { resolve } from "@std/path";
import { RdfDataset, type RdfGraph, termKey } from "./rdf.ts";
import type { Config } from "./config.ts";
import type { GraphDescriptor } from "./schemas/sources.ts";
import { graphDescriptors, usesNamedGraphs } from "./graph/descriptors.ts";
import { documentMetadata } from "./graph/document_support.ts";
import { processInputDir } from "./graph/process.ts";
import { loadGraph, type LoadOptions } from "./graph/load_graph.ts";

export {
  graphDescriptors,
  rootGraphUri,
  sourceGraphUri,
  usesNamedGraphs,
} from "./graph/descriptors.ts";
export { kebabCase, resolvePredicate, resolveType } from "./graph/terms.ts";
export { resolveObject } from "./graph/object_terms.ts";
export { effectiveTypes } from "./graph/types.ts";
export {
  type FrontmatterGraphOptions,
  frontmatterToGraph,
} from "./graph/frontmatter.ts";
export {
  loadGraph,
  type LoadOptions,
  type RdfSource,
  rdfSources,
} from "./graph/load_graph.ts";

/** Load the right RDF query target for plain or named-graph SPARQL. */
export async function loadQueryGraph(
  config: Config,
  sparqlQuery: string,
  options: QueryGraphOptions = {},
): Promise<RdfGraph | RdfDataset> {
  if (usesNamedGraphs(sparqlQuery)) return await loadDataset(config, options);
  return await loadGraph(config, options);
}

/** Cache controls {@link loadQueryGraph} accepts, which excludes `useCache`. */
export interface QueryGraphOptions {
  readonly infer?: boolean;
  readonly reload?: boolean;
  readonly diskCache?: boolean;
}

/**
 * Load wiki sources into a read-only Dataset with stable named graphs.
 *
 * The dataset uses `defaultUnion`, so unscoped SPARQL preserves the umbrella /
 * union behaviour while `GRAPH` clauses can inspect source boundaries.
 */
export async function loadDataset(
  config: Config,
  options: LoadOptions = {},
): Promise<RdfDataset> {
  const infer = options.infer ?? true;
  const useCache = options.useCache ?? true;
  const reload = options.reload ?? false;
  const diskCache = options.diskCache ?? false;

  const {
    clearDiskDataset,
    clearProcessDataset,
    getDiskDataset,
    getProcessDataset,
    setDiskDataset,
    setProcessDataset,
  } = await import("./graph_cache.ts");

  if (reload) {
    clearProcessDataset(config, infer);
    if (diskCache) clearDiskDataset(config, infer);
  } else if (useCache) {
    const cached = getProcessDataset(config, infer);
    if (cached !== null) return cached;
    if (diskCache) {
      const cachedDisk = await getDiskDataset(config, infer);
      if (cachedDisk !== null) {
        setProcessDataset(config, infer, cachedDisk);
        return cachedDisk;
      }
    }
  }

  const dataset = new RdfDataset({ defaultUnion: true });
  config.bindNamespaces(dataset);
  dataset.vocab = config.context.vocab;
  const documentFiles = await documentMetadata(config);
  const descriptors = graphDescriptors(config);
  const sourceByPath = new Map<string, GraphDescriptor>();
  for (const descriptor of descriptors) {
    if (descriptor.kind !== "source" || descriptor.local_path === null) {
      continue;
    }
    sourceByPath.set(
      resolve(descriptor.local_path),
      descriptor,
    );
  }
  const rootDescriptor = descriptors[0]!;

  for (const inputDir of config.wiki.input) {
    const descriptor = sourceByPath.get(resolve(inputDir)) ??
      rootDescriptor;
    const graph = dataset.graph(descriptor.uri);
    config.bindNamespaces(graph);
    graph.vocab = config.context.vocab;
    await processInputDir(graph, config, inputDir, documentFiles);
  }

  if (infer) {
    const { applyInference } = await import("./infer.ts");
    // Python iterates `dataset.graphs()`, which includes the (empty) default
    // graph; the port has no default graph to expand, so only named graphs.
    for (const graph of dataset.graphs()) applyInference(graph, config);
  }

  if (useCache) setProcessDataset(config, infer, dataset);
  if (diskCache) setDiskDataset(config, infer, dataset);

  return dataset;
}

/** Basic statistics about a loaded graph, in the oracle's key order. */
export function graphStats(graph: RdfGraph | RdfDataset): {
  triples: number;
  subjects: number;
  predicates: number;
  objects: number;
} {
  const quads = [...graph];
  const subjects = new Set<string>();
  const predicates = new Set<string>();
  const objects = new Set<string>();
  for (const item of quads) {
    subjects.add(termKey(item.subject));
    predicates.add(termKey(item.predicate));
    objects.add(termKey(item.object));
  }
  return {
    triples: quads.length,
    subjects: subjects.size,
    predicates: predicates.size,
    objects: objects.size,
  };
}
