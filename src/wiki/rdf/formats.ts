import env from "@zazuko/env-node";

// ---------------------------------------------------------------------------
// Formats
// ---------------------------------------------------------------------------

/** The format names the Python engine passes to rdflib. */
export type RdfFormat =
  | "turtle"
  | "ttl"
  | "n3"
  | "trig"
  | "nt"
  | "nquads"
  | "xml"
  | "json-ld";

/** Normalize the aliases rdflib accepts, so `ttl` and `jsonld` both work. */
export function normalizeFormat(format: string): RdfFormat {
  switch (format.toLowerCase()) {
    case "turtle":
    case "ttl":
      return "turtle";
    case "n3":
      return "n3";
    case "trig":
      return "trig";
    case "nt":
    case "ntriples":
    case "n-triples":
      return "nt";
    case "nquads":
    case "n-quads":
      return "nquads";
    case "xml":
    case "rdf":
    case "rdf/xml":
    case "application/rdf+xml":
      return "xml";
    case "json-ld":
    case "jsonld":
      return "json-ld";
    default:
      throw new UnsupportedFormatError(format);
  }
}

/** The media type a normalized format maps to in the `@zazuko` registries. */
export function mediaTypeFor(format: RdfFormat): string {
  switch (format) {
    case "turtle":
    case "ttl":
      return "text/turtle";
    case "n3":
      return "text/n3";
    case "trig":
      return "application/trig";
    case "nt":
      return "application/n-triples";
    case "nquads":
      return "application/n-quads";
    case "xml":
      return "application/rdf+xml";
    case "json-ld":
      return "application/ld+json";
  }
}

/** Raised for a format the engine does not implement. */
export class UnsupportedFormatError extends Error {
  constructor(format: string, direction: "parse" | "serialize" = "serialize") {
    const rdfXml = ["xml", "rdf", "rdf/xml", "application/rdf+xml"].includes(
      format.toLowerCase(),
    );
    const message = direction === "serialize" && rdfXml
      ? "RDF/XML serialization is deferred; use Turtle, N-Triples, N-Quads, N3, TriG, or JSON-LD."
      : `Unsupported ${direction} format: ${format}`;
    super(message);
    this.name = "UnsupportedFormatError";
  }
}

/** Every format the engine can parse. */
export function canParse(format: string): boolean {
  try {
    return env.formats.parsers.get(mediaTypeFor(normalizeFormat(format))) !==
      undefined;
  } catch {
    return false;
  }
}

/**
 * Every format the engine can write.
 *
 * `xml` is absent on purpose: RDF/XML serialization is deferred from the
 * initial TypeScript cutover because no library in the chosen stack has a
 * writer. The parser remains available; serialization fails explicitly rather
 * than silently substituting N-Quads.
 */
export function canSerialize(format: string): boolean {
  try {
    return normalizeFormat(format) !== "xml";
  } catch {
    return false;
  }
}
