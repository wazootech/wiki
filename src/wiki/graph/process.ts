import { isFile, pathExists, sortedTreePaths } from "../fspath.ts";
import { basename, extname } from "@std/path";
import { extract, LinkedMarkdownError } from "@wazoo/linked-markdown";
import { parseRdf, parseTurtle, type RdfGraph } from "../rdf.ts";
import type { Config } from "../config.ts";
import {
  type DataRecord,
  documentDataFromPath,
  readTextTolerant,
} from "../parser.ts";
import { routeForDocumentFile } from "../paths.ts";
import type { DerivedMetadata } from "../derived.ts";
import { logger } from "./descriptors.ts";
import { isTruthy } from "./terms.ts";
import { frontmatterToGraph } from "./frontmatter.ts";
import {
  addQuadsTo,
  EXT_FORMAT_MAP,
  pathKey,
  scopeTurtleBlock,
  turtleBlocks,
} from "./document_support.ts";

/**
 * Parse a supported wiki document into the target graphs: its owner graph,
 * and in a dataset its own document graph too (wiki#320).
 */
function processDocumentFile(
  targets: readonly RdfGraph[],
  filePath: string,
  config: Config,
  derived: DerivedMetadata | null,
): void {
  const data = documentDataFromPath(filePath);
  if (data !== null) {
    let body: string | null = null;
    if (
      extname(filePath).toLowerCase() === ".md" &&
      isTruthy(config.graph.content_predicate)
    ) {
      const content = readTextTolerant(filePath);
      try {
        body = extract<DataRecord>(content).body.trim();
      } catch (error) {
        if (!(error instanceof LinkedMarkdownError)) throw error;
      }
    }
    addQuadsTo(
      targets,
      frontmatterToGraph(data, config, {
        fileId: routeForDocumentFile(config, filePath),
        body,
        includeFileExtension: config.graph.include_file_extension,
        fileExt: extname(filePath).toLowerCase(),
        derived,
      }),
    );
  }

  if (extname(filePath).toLowerCase() !== ".md") return;

  const content = readTextTolerant(filePath);

  // ` ```turtle ` blocks are the escape hatch for hand-written RDF inside a
  // page, so a malformed one must not take the whole graph down with it.
  for (const [currentBlockIndex, text] of turtleBlocks(content).entries()) {
    try {
      addQuadsTo(
        targets,
        scopeTurtleBlock(parseTurtle(text), filePath, currentBlockIndex),
      );
    } catch (error) {
      logger.warning(
        `Failed to parse turtle block in ${basename(filePath)}: ${
          String(error)
        }`,
      );
    }
  }
}

/**
 * Load every document and RDF file under one input directory.
 *
 * `documentGraph`, when given, names the extra graph each file's statements
 * also land in: the dataset's per-document provenance graphs (wiki#320).
 */
export async function processInputDir(
  graph: RdfGraph,
  config: Config,
  inputDir: string,
  documentFiles: ReadonlyMap<string, DerivedMetadata>,
  documentGraph?: (filePath: string, isDocument: boolean) => RdfGraph,
): Promise<void> {
  if (!pathExists(inputDir)) return;
  for (const filePath of sortedTreePaths(inputDir)) {
    if (!isFile(filePath) || config.isExcluded(filePath)) continue;
    try {
      const derived = documentFiles.get(pathKey(filePath));
      if (derived !== undefined) {
        const targets = documentGraph === undefined
          ? [graph]
          : [graph, documentGraph(filePath, true)];
        processDocumentFile(targets, filePath, config, derived);
      } else {
        const format = EXT_FORMAT_MAP.get(extname(filePath).toLowerCase());
        if (format !== undefined) {
          const quads = await parseRdf(readTextTolerant(filePath), format);
          addQuadsTo(
            documentGraph === undefined
              ? [graph]
              : [graph, documentGraph(filePath, false)],
            quads,
          );
        }
      }
    } catch (error) {
      // A warning, not a failure: a wiki with one unparseable import is still a
      // wiki, and the oracle's contract is to load the rest of it.
      logger.warning(
        `Failed to process ${basename(filePath)}: ${String(error)}`,
      );
    }
  }
}
