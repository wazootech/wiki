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

const FORMAT_ALIASES: Readonly<Record<string, ExportFormat>> = {
  "application/ld+json": "json-ld",
  "application/n-quads": "nquads",
  "application/n-triples": "nt",
  "application/rdf+xml": "xml",
  "application/sparql-results+xml": "xml",
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
};

export function normalizeExportFormat(format: string): ExportFormat {
  const raw = format.trim().toLowerCase();
  const canonical = FORMAT_ALIASES[raw] ?? raw;
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

async function serializeDocument(
  data: Record<string, unknown>,
  filePath: string,
  config: Config,
  format: ExportFormat,
  mode: ExportMode,
): Promise<unknown> {
  if (format === "dict") return data;
  const graph = frontmatterToGraph(data, config, {
    fileId: routeForDocumentFile(config, filePath),
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
        rdf: await serializeDocument(data, filePath, config, format, mode),
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
