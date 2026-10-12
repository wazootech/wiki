import { basename } from "@std/path";
import { ValueError } from "./errors.ts";
import type { JsonLdDocument } from "jsonld";
import { documentDataFromPath } from "./parser.ts";
import {
  iterDocumentFiles,
  routeForDocumentFile,
  selectDocumentPaths,
} from "./paths.ts";
import type { Config } from "./config.ts";
import { frontmatterToGraph } from "./graph.ts";
import {
  derivedAdditions,
  type DerivedMetadata,
  deriveMetadata,
  deriveMetadataAll,
} from "./derived.ts";

import {
  normalizeFormat,
  serializeRdf,
  UnsupportedFormatError,
} from "./rdf.ts";
import type { ExportResult } from "./schemas/reports.ts";

export const EXPORT_FORMATS = [
  "dict",
  "json-ld",
  "turtle",
  "xml",
  "n3",
  "nt",
  "trig",
  "nquads",
] as const;

export type ExportFormat = typeof EXPORT_FORMATS[number];
export type ExportMode = "expanded" | "compacted";

export interface ExportOptions {
  readonly format?: string;
  readonly mode?: string;
}

const RAW_FORMATS = new Set<ExportFormat>([
  "turtle",
  "xml",
  "n3",
  "nt",
  "trig",
  "nquads",
]);

/**
 * Media types and shorthand that name an {@link ExportFormat}.
 *
 * `application/sparql-results+xml` is deliberately absent. It serializes a
 * SPARQL *result set*, not an RDF graph, so it is not an alias for RDF/XML
 * even though both are `+xml`. `sparql_service.ts` serves result sets as
 * `application/sparql-results+json` only. Aliasing it here would route a
 * result-set request to the RDF/XML serializer and report the deferred-writer
 * error, which describes the wrong problem. Left unmapped, it fails as an
 * unknown export format, which is actionable.
 */
const FORMAT_ALIASES: Readonly<Record<string, ExportFormat>> = Object.assign(
  // A null prototype, so a format literally named `constructor` or `toString`
  // resolves to nothing instead of inheriting `Object.prototype` members. The
  // lookup below is fed a raw user-supplied string, so the inherited members
  // were reachable as bogus exports.
  Object.create(null) as Record<string, ExportFormat>,
  {
    "application/ld+json": "json-ld",
    "application/n-quads": "nquads",
    "application/n-triples": "nt",
    "application/rdf+xml": "xml",
    "rdf+xml": "xml",
    "rdf/xml": "xml",
    "application/trig": "trig",
    "application/x-turtle": "turtle",
    "jsonld": "json-ld",
    "n-quads": "nquads",
    "n-triples": "nt",
    "nq": "nquads",
    "ntriples": "nt",
    "rdf": "xml",
    "text/n3": "n3",
    "text/turtle": "turtle",
    "tt": "turtle",
    "ttl": "turtle",
  } as const,
);

export function normalizeExportFormat(format: string): ExportFormat {
  const raw = format.trim().toLowerCase();
  const canonical = Object.hasOwn(FORMAT_ALIASES, raw)
    ? FORMAT_ALIASES[raw]!
    : raw;
  if (
    canonical === "dict" || EXPORT_FORMATS.includes(canonical as ExportFormat)
  ) {
    return canonical as ExportFormat;
  }
  try {
    normalizeFormat(canonical);
  } catch (error) {
    if (!(error instanceof UnsupportedFormatError)) throw error;
  }
  throw new ValueError(
    `Invalid export format '${format}'. Choose from ${
      EXPORT_FORMATS.join(", ")
    }.`,
  );
}

export function normalizeExportMode(mode: string): ExportMode {
  return mode.trim().toLowerCase() === "compacted" ? "compacted" : "expanded";
}

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
async function serializeDocument(
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

export async function exportFrontmatter(
  config: Config,
  files: readonly string[] | null = null,
  options: ExportOptions = {},
): Promise<ExportResult> {
  const format = normalizeExportFormat(options.format ?? "dict");
  const mode = normalizeExportMode(options.mode ?? "expanded");
  const selected = files && files.length > 0
    ? selectDocumentPaths(config, files)
    : iterDocumentFiles(config);

  if (files && files.length > 1 && RAW_FORMATS.has(format)) {
    return {
      ok: false,
      output: "",
      error_message:
        "raw RDF export formats require a single FILE or whole-wiki export (omit FILE).",
    };
  }

  // Derived up front so the per-document `git log` calls run concurrently.
  const derived = await deriveMetadataAll(selected);
  const converted: { name: string; rdf: unknown }[] = [];
  for (const filePath of selected) {
    const data = documentDataFromPath(
      filePath,
      config.graph.content_predicate ?? undefined,
    );
    if (data === null) {
      if (files && files.length > 0) {
        return {
          ok: false,
          output: "",
          error_message: `No valid document metadata found in ${
            basename(filePath)
          }`,
        };
      }
      continue;
    }
    try {
      converted.push({
        name: basename(filePath),
        rdf: await serializeDocument(
          data,
          filePath,
          config,
          format,
          mode,
          derived.get(filePath)!,
        ),
      });
    } catch (error) {
      if (error instanceof Error) {
        return { ok: false, output: "", error_message: error.message };
      }
      throw error;
    }
  }

  const payload: unknown = files && files.length > 0 && converted.length === 1
    ? converted[0]
    : converted;
  const output = RAW_FORMATS.has(format) && !Array.isArray(payload)
    ? typeof (payload as { rdf: unknown }).rdf === "string"
      ? (payload as { rdf: string }).rdf
      : JSON.stringify((payload as { rdf: unknown }).rdf, null, 2)
    : JSON.stringify(payload, null, 2);
  return { ok: true, output };
}
