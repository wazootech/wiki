import { isFile, pathExists, sortedTreePaths } from "../fspath.ts";
import { extname } from "@std/path";
import type { Quad } from "../rdf.ts";
import { parseRdf, parseTurtle, RdfGraph } from "../rdf.ts";
import type { Config } from "../config.ts";
import { readTextTolerant } from "../parser.ts";
import { iterDocumentFiles, routeForDocumentFile } from "../paths.ts";
import {
  documentMetadata,
  EXT_FORMAT_MAP,
  pathKey,
  turtleBlocks,
} from "./document_support.ts";
import { processInputDir } from "./process.ts";

/**
 * One hand-written RDF source in the wiki: a page's ` ```turtle ` block, or an
 * RDF data file under `wiki.input` (`.ttl`, `.trig`, `.nt`, `.nq`, `.rdf`,
 * `.xml`, `.jsonld`).
 */
export interface RdfSource {
  readonly path: string;
  /** The page's route, for a block; `null` for a data file. */
  readonly route: string | null;
  /** The block's 1-based position in its page; `null` for a data file. */
  readonly block: number | null;
  /** The source's own triples, blank nodes as the parser labelled them. */
  readonly quads: readonly Quad[];
}

/**
 * Every RDF source the graph loads besides frontmatter, parsed on its own.
 *
 * A source that does not parse is skipped: loading the graph already warns
 * about it, and a linter has nothing to say about triples it cannot read.
 */
export async function rdfSources(config: Config): Promise<RdfSource[]> {
  const documentFiles = new Set(iterDocumentFiles(config).map(pathKey));
  const sources: RdfSource[] = [];
  for (const inputDir of config.wiki.input) {
    if (!pathExists(inputDir)) continue;
    for (const filePath of sortedTreePaths(inputDir)) {
      if (!isFile(filePath) || config.isExcluded(filePath)) continue;
      const extension = extname(filePath).toLowerCase();
      try {
        if (documentFiles.has(pathKey(filePath))) {
          if (extension !== ".md") continue;
          const route = routeForDocumentFile(config, filePath);
          const blocks = turtleBlocks(readTextTolerant(filePath));
          for (const [index, text] of blocks.entries()) {
            try {
              sources.push({
                path: filePath,
                route,
                block: index + 1,
                quads: parseTurtle(text),
              });
            } catch {
              // Reported by the graph loader.
            }
          }
          continue;
        }
        const format = EXT_FORMAT_MAP.get(extension);
        if (format === undefined) continue;
        sources.push({
          path: filePath,
          route: null,
          block: null,
          quads: await parseRdf(readTextTolerant(filePath), format),
        });
      } catch {
        // Reported by the graph loader.
      }
    }
  }
  return sources;
}

/** Load asserted triples from all wiki sources without inference. */
async function buildGraphFromWiki(config: Config): Promise<RdfGraph> {
  const graph = new RdfGraph();
  config.bindNamespaces(graph);
  graph.vocab = config.context.vocab;

  const documentFiles = await documentMetadata(config);
  for (const inputDir of config.wiki.input) {
    await processInputDir(graph, config, inputDir, documentFiles);
  }

  return graph;
}

/** Shared cache controls for {@link loadGraph} and {@link loadDataset}. */
export interface LoadOptions {
  readonly infer?: boolean;
  readonly useCache?: boolean;
  readonly reload?: boolean;
  readonly diskCache?: boolean;
}

/**
 * Load wiki sources into a Graph, reusing the in-process cache when possible.
 *
 * Multiple calls in the same process (many SPARQL blocks, query + render, SHACL
 * checks, serve requests) share one graph build unless `reload` is set.
 */
export async function loadGraph(
  config: Config,
  options: LoadOptions = {},
): Promise<RdfGraph> {
  const infer = options.infer ?? true;
  const useCache = options.useCache ?? true;
  const reload = options.reload ?? false;
  const diskCache = options.diskCache ?? false;

  const {
    clearDiskGraph,
    clearProcessGraph,
    getDiskGraph,
    getProcessGraph,
    setDiskGraph,
    setProcessGraph,
  } = await import("../graph_cache.ts");

  if (reload) {
    clearProcessGraph(config, infer);
    if (diskCache) clearDiskGraph(config, infer);
  } else if (useCache) {
    const cached = getProcessGraph(config, infer);
    if (cached !== null) return cached;
    if (diskCache) {
      const cachedDisk = await getDiskGraph(config, infer);
      if (cachedDisk !== null) {
        setProcessGraph(config, infer, cachedDisk);
        return cachedDisk;
      }
    }
  }

  const graph = await buildGraphFromWiki(config);
  if (infer) {
    const { applyInference } = await import("../infer.ts");
    applyInference(graph, config);
  }

  if (useCache) setProcessGraph(config, infer, graph);
  if (diskCache) setDiskGraph(config, infer, graph);

  return graph;
}
