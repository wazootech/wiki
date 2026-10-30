import { extname } from "@std/path";
import { type Context, SCHEMA } from "../context.ts";
import { markdownBody } from "../document.ts";
import { readText } from "../fspath.ts";
import { firstAtxH1 } from "../headings.ts";

/** Where a document's derived dates came from. */
export type DateSource = "git" | "mtime";

/** The metadata derived for one document; `null` means "derives nothing". */
export interface DerivedMetadata {
  /** The first ATX H1's plain text (Markdown pages only). */
  readonly headline: string | null;
  /** RFC 3339 UTC, whole seconds. */
  readonly dateCreated: string | null;
  /** RFC 3339 UTC, whole seconds. */
  readonly dateModified: string | null;
  readonly dateSource: DateSource | null;
}

/** The schema.org local names derivation emits, in report order. */
export const DERIVED_PROPERTIES = [
  "headline",
  "dateCreated",
  "dateModified",
] as const;

export type DerivedProperty = typeof DERIVED_PROPERTIES[number];

/** Whether a derived property is a date (`xsd:dateTime`) or text. */
export function isDateProperty(property: DerivedProperty): boolean {
  return property !== "headline";
}

/**
 * The predicate IRI a derived property is emitted as.
 *
 * It follows the wiki's own `schema` prefix, so a wiki that binds `schema:` to
 * `http://schema.org/` gets derived values its own `schema:headline` keys
 * agree with.
 */
export function derivedPredicate(
  property: DerivedProperty,
  context: Context,
): string {
  return `${context.namespaces.get("schema") ?? SCHEMA}${property}`;
}

/** A Unix time in seconds as `YYYY-MM-DDTHH:MM:SSZ`. */
export function rfc3339Utc(seconds: number): string {
  return new Date(seconds * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** The derived headline of a document: Markdown only. */
export function documentHeadline(filePath: string): string | null {
  if (extname(filePath).toLowerCase() !== ".md") return null;
  try {
    return firstAtxH1(markdownBody(readText(filePath)));
  } catch {
    return null;
  }
}
