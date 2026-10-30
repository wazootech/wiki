import { basename } from "@std/path";
import { documentDataFromPath } from "./parser.ts";
import { iterDocumentFiles, selectDocumentPaths } from "./paths.ts";
import type { Config } from "./config.ts";
import { deriveMetadataAll } from "./derived.ts";
import type { ExportResult } from "./schemas/reports.ts";
import {
  type ExportOptions,
  normalizeExportFormat,
  normalizeExportMode,
  RAW_FORMATS,
} from "./export/formats.ts";
import { serializeDocument } from "./export/serialize.ts";

export {
  EXPORT_FORMATS,
  type ExportFormat,
  type ExportMode,
  type ExportOptions,
  normalizeExportFormat,
  normalizeExportMode,
} from "./export/formats.ts";
export { documentJsonLd } from "./export/serialize.ts";

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
