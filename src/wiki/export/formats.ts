import { ValueError } from "../errors.ts";
import { normalizeFormat, UnsupportedFormatError } from "../rdf.ts";

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

export const RAW_FORMATS = new Set<ExportFormat>([
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
