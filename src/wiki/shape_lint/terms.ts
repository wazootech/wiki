import { type Context, SH } from "../context.ts";
import { type DataRecord, isRecord } from "../parser.ts";
import { SHACL_PROPERTIES } from "./shacl_properties.ts";
import { SHACL_OTHER_TERMS } from "./shacl_other_terms.ts";

/** Parameters whose values the spec requires to be IRIs. */
export const IRI_VALUED: ReadonlySet<string> = new Set([
  "targetClass",
  "targetSubjectsOf",
  "targetObjectsOf",
  "class",
  "datatype",
  "equals",
  "disjoint",
  "lessThan",
  "lessThanOrEquals",
  "ignoredProperties",
]);

/** Keys whose value is a property path (§2.3.1). */
export const PATH_VALUED: ReadonlySet<string> = new Set([
  "path",
  "inversePath",
  "zeroOrMorePath",
  "oneOrMorePath",
  "zeroOrOnePath",
]);

/** The complex-path keys; a path mapping has exactly one of them (§2.3.1). */
export const PATH_FORMS: ReadonlySet<string> = new Set([
  "inversePath",
  "alternativePath",
  "zeroOrMorePath",
  "oneOrMorePath",
  "zeroOrOnePath",
]);

/** Parameters whose values are shapes, so they may reference a shape page. */
export const SHAPE_VALUED: ReadonlySet<string> = new Set([
  "node",
  "property",
  "qualifiedValueShape",
  "not",
]);

/** Parameters whose value is a list of shapes (§4.6). */
export const SHAPE_LISTS: ReadonlySet<string> = new Set(["and", "or", "xone"]);

/** The target declarations of SHACL Core and Advanced Features (§2.1). */
export const TARGETS: ReadonlySet<string> = new Set([
  "targetClass",
  "targetNode",
  "targetObjectsOf",
  "targetSubjectsOf",
  "target",
]);

/** The six values `sh:nodeKind` allows (§4.1.3). */
export const NODE_KINDS: ReadonlySet<string> = new Set([
  "BlankNode",
  "IRI",
  "Literal",
  "BlankNodeOrIRI",
  "BlankNodeOrLiteral",
  "IRIOrLiteral",
]);

/** Top-level keys the compiler never turns into triples. */
export const SKIP_KEYS: ReadonlySet<string> = new Set(["id", "type", "@type"]);

/** Expand `prefix:local` against the context, or `null` for an unknown prefix. */
function expandCurie(value: string, context: Context): string | null {
  const index = value.indexOf(":");
  if (index < 0) return null;
  const namespace = context.namespaces.get(value.slice(0, index));
  return namespace === undefined ? null : namespace + value.slice(index + 1);
}

/** The IRI a frontmatter key compiles to, mirroring `resolvePredicate`. */
export function keyIri(key: string, context: Context): string | null {
  if (key.includes(":")) {
    const expanded = expandCurie(key, context);
    if (expanded !== null) return expanded;
  }
  if (key.startsWith("wiki.")) return null;
  return context.vocab ? context.vocab + key : null;
}

/** The SHACL local name of an IRI, or `null` outside the `sh:` namespace. */
export function shLocal(iri: string | null): string | null {
  return iri !== null && iri.startsWith(SH) ? iri.slice(SH.length) : null;
}

/**
 * The IRI a scalar value compiles to, or `null` when it compiles to a literal.
 * Mirrors the `@id` and string branches of the compiler's `addObject`.
 */
export function valueIri(value: unknown, context: Context): string | null {
  if (isRecord(value)) {
    const id = value["@id"];
    if (typeof id !== "string" || id === "") return null;
    return id.includes(":") ? expandCurie(id, context) ?? id : id;
  }
  if (typeof value !== "string") return null;
  if (value.startsWith("http")) return value;
  if (value.includes(":") && !value.includes(" ") && !value.includes("\n")) {
    return expandCurie(value, context);
  }
  return null;
}

/** A mapping that compiles to a blank node rather than an `@id` reference. */
export function isBlankMapping(value: unknown): value is DataRecord {
  return isRecord(value) && !("@id" in value);
}

/** Collects one document's findings, each prefixed with its key path. */
export class Findings {
  readonly messages: string[] = [];
  constructor(readonly route: string) {}

  add(where: string, message: string): void {
    this.messages.push(`In ${this.route}: ${where}: ${message}`);
  }
}

/** `key` or `key[index]`, for a value that may or may not be a list. */
export function itemPath(where: string, value: unknown, index: number): string {
  return Array.isArray(value) ? `${where}[${index}]` : where;
}

/** Whether a local name is any term of the SHACL vocabulary. */
export function isShaclTerm(local: string): boolean {
  return SHACL_PROPERTIES.has(local) || SHACL_OTHER_TERMS.has(local);
}
