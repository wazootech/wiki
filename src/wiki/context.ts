/**
 * JSON-LD prefix and namespace bindings for RDF graph loading.
 *
 * Port of `src/wiki/context.py`. `rdflib.Namespace` is a `str` subclass with
 * attribute access, which the port does not need: every namespace here is used
 * as an IRI prefix for CURIE expansion and serialization, so a plain string
 * carries the same information. The behaviour that *is* load-bearing — the
 * default prefix table, and the exact `@vocab` and prefix-deletion rules — is
 * preserved and unit-tested.
 */

export const SCHEMA = "https://schema.org/";
export const WIKI = "https://wiki.example.org/";
export const FOAF = "http://xmlns.com/foaf/0.1/";
export const DC = "http://purl.org/dc/elements/1.1/";
export const DCTERMS = "http://purl.org/dc/terms/";
export const SH = "http://www.w3.org/ns/shacl#";
export const WAZOO = "https://wazootech.github.io/wiki-cli/vocab/";

export const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
export const RDFS = "http://www.w3.org/2000/01/rdf-schema#";
export const XSD = "http://www.w3.org/2001/XMLSchema#";
export const OWL = "http://www.w3.org/2002/07/owl#";

/** Default prefix table, in binding order. */
export const DEFAULT_NAMESPACES: Readonly<Record<string, string>> = {
  schema: SCHEMA,
  wiki: WIKI,
  foaf: FOAF,
  rdf: RDF,
  rdfs: RDFS,
  xsd: XSD,
  owl: OWL,
  dc: DC,
  dcterms: DCTERMS,
  sh: SH,
  wazoo: WAZOO,
};

/** Default `@vocab` when no context is configured. */
export const DEFAULT_VOCAB = "https://schema.org/";

/** Default base IRI for relative reference resolution. */
export const DEFAULT_BASE_IRI = "https://wiki.example.org/";

/**
 * Anything that accepts a prefix binding.
 *
 * The Python side binds into an `rdflib.Graph`; the port binds into whatever
 * the serializer uses, so the contract is stated structurally rather than
 * coupled to one store implementation.
 */
export interface NamespaceBinder {
  set(prefix: string, iri: string): void;
}

export interface ContextOptions {
  /**
   * Context mapping. `undefined` means "no context configured" and selects the
   * default `@vocab`; an empty object is a *configured* empty context, which
   * selects no vocab at all. Those are different, and the distinction is
   * preserved from `context.py`.
   */
  readonly namespaces?: Readonly<Record<string, unknown>> | undefined;
  readonly baseIri?: string | undefined;
}

/**
 * Read `@vocab` the way `context.py` does: `str(value) if value else None`.
 *
 * A falsey value means "explicitly no vocab", not "use the default", so `false`
 * and `0` — both reachable from YAML — must not stringify into `"false"`/`"0"`.
 */
function readVocab(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value ? "true" : null;
  if (typeof value === "number") return value === 0 ? null : String(value);
  if (typeof value === "string") return value === "" ? null : value;
  return String(value);
}

/** Manages JSON-LD prefix and namespace bindings. */
export class Context {
  readonly namespaces: Map<string, string>;
  readonly baseIri: string;
  readonly vocab: string | null;

  constructor(options: ContextOptions = {}) {
    this.namespaces = new Map(Object.entries(DEFAULT_NAMESPACES));
    this.baseIri = options.baseIri ?? DEFAULT_BASE_IRI;

    const configured = options.namespaces;
    if (configured === undefined) {
      this.vocab = DEFAULT_VOCAB;
      return;
    }

    // A configured context always overrides the default vocab, even when it
    // omits `@vocab` — that is `context.py`'s behaviour and the reason an empty
    // context is distinguishable from no context at all.
    this.vocab = readVocab(configured["@vocab"]);

    for (const [prefix, uri] of Object.entries(configured)) {
      if (prefix === "@vocab") continue;
      if (uri === null || uri === undefined) {
        this.namespaces.delete(prefix);
      } else {
        this.namespaces.set(
          prefix,
          typeof uri === "string" ? uri : String(uri),
        );
      }
    }
  }

  /** Bind all managed namespaces to a target that accepts prefix bindings. */
  bindNamespaces(target: NamespaceBinder): void {
    for (const [prefix, iri] of this.namespaces) {
      target.set(prefix, iri);
    }
  }
}
