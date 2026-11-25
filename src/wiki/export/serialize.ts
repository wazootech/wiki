import type { JsonLdDocument } from "jsonld";
import { routeForDocumentFile } from "../paths.ts";
import type { Config } from "../config.ts";
import { frontmatterToGraph } from "../graph.ts";
import {
  derivedAdditions,
  type DerivedMetadata,
  deriveMetadata,
} from "../derived.ts";
import { serializeRdf } from "../rdf.ts";
import type { ExportFormat, ExportMode } from "./formats.ts";

function compactedJsonLdContext(config: Config): Record<string, string> {
  return Object.fromEntries(config.context.namespaces);
}

/**
 * One document, serialized with the metadata the graph derives (wiki#318).
 *
 * The RDF formats compile through {@link frontmatterToGraph} with the derived
 * values, so they match the wiki graph. `dict` is the data dict with each
 * derived value the graph would add appended under its `schema:` key; a key
 * the frontmatter already sets is left exactly as written.
 */
export async function serializeDocument(
  data: Record<string, unknown>,
  filePath: string,
  config: Config,
  format: ExportFormat,
  mode: ExportMode,
  derived: DerivedMetadata,
): Promise<unknown> {
  if (format === "dict") {
    const record: Record<string, unknown> = { ...data };
    for (const addition of derivedAdditions(data, derived, config)) {
      record[addition.key] = addition.value;
    }
    return record;
  }
  const graph = frontmatterToGraph(data, config, {
    fileId: routeForDocumentFile(config, filePath),
    derived,
  });
  const quads = graph.toArray();
  if (format === "json-ld") {
    const expanded = JSON.parse(
      await serializeRdf(quads, format),
    ) as JsonLdDocument;
    const { default: jsonld } = await import("jsonld");
    const flattened = await jsonld.flatten(expanded);
    const context = compactedJsonLdContext(config);
    if (mode !== "compacted" || Object.keys(context).length === 0) {
      return flattened;
    }
    return await jsonld.compact(flattened, context);
  }
  return await serializeRdf(quads, format, { prefixes: config.namespaces });
}

/**
 * One document's frontmatter as compacted JSON-LD, as `wiki export` writes it.
 *
 * `wiki show` reports the graph view of a page next to its raw frontmatter;
 * this keeps that view byte-for-byte the one `export -f json-ld -m compacted`
 * produces rather than a second compiler.
 */
export async function documentJsonLd(
  config: Config,
  filePath: string,
  data: Record<string, unknown>,
  derived?: DerivedMetadata,
): Promise<unknown> {
  return await serializeDocument(
    data,
    filePath,
    config,
    "json-ld",
    "compacted",
    derived ?? await deriveMetadata(filePath),
  );
}
