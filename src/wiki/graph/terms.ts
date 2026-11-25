import type { NamedNode } from "../rdf.ts";
import {
  literal,
  namedNode,
  XSD_DATE,
  XSD_DATETIME,
  XSD_DOUBLE,
  XSD_INTEGER,
} from "../rdf.ts";
import { WikiFloat, WikiTimestamp } from "../scalars.ts";
import { type Context, SH } from "../context.ts";
import { isRecord } from "../parser.ts";
import { describeText } from "../describe.ts";

/** Convert a string to kebab-case for URI segments. */
export function kebabCase(value: unknown): string {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

/**
 * Expand a `prefix:local` reference, or `null` when the prefix is unknown.
 *
 * Splitting on the *first* colon is what `str.split(":", 1)` does, so a local
 * part containing colons (`ex:a:b`) survives intact.
 */
export function expandCurie(value: string, context: Context): string | null {
  const index = value.indexOf(":");
  if (index < 0) return null;
  const namespace = context.namespaces.get(value.slice(0, index));
  if (namespace === undefined) return null;
  return `${namespace}${value.slice(index + 1)}`;
}

/**
 * Map a frontmatter key to an RDF predicate URI using managed namespaces.
 *
 * Resolution order: CURIE (`prefix:localName`) → `wiki.*` dotted keys → the
 * `@vocab` default. Nothing resolves to `null` unless `@vocab` is absent, which
 * is what makes `@vocab: null` a way to say "only prefixed keys count".
 */
export function resolvePredicate(
  key: string,
  context: Context,
): NamedNode | null {
  if (key.includes(":")) {
    const expanded = expandCurie(key, context);
    if (expanded !== null) return namedNode(expanded);
  }
  if (key.startsWith("wiki.")) {
    const wiki = context.namespaces.get("wiki");
    // Python reaches `context.namespaces["wiki"]` unguarded and raises a
    // `KeyError` when the context deletes the prefix; returning nothing is the
    // same answer the deletion was asking for.
    if (wiki !== undefined) return namedNode(`${wiki}${key.slice(5)}`);
  }
  if (context.vocab) return namedNode(`${context.vocab}${key}`);
  return null;
}

/**
 * Map a frontmatter type to an RDF type URI using managed namespaces.
 *
 * A non-string type (`type: 5`, a list item that is not a string) is taken as a
 * URI outright, which is `URIRef(str(t))`.
 */
export function resolveType(
  value: unknown,
  context: Context,
): NamedNode | null {
  if (typeof value === "string") {
    if (value.includes(":")) {
      const expanded = expandCurie(value, context);
      if (expanded !== null) return namedNode(expanded);
    }
    if (context.vocab) return namedNode(`${context.vocab}${value}`);
    return null;
  }
  return namedNode(describeText(value));
}

/** Python truthiness, which is not JavaScript truthiness for `[]` and `{}`. */
export function isTruthy(value: unknown): boolean {
  if (value === null || value === undefined || value === false) return false;
  if (value === 0 || value === "") return false;
  // A `WikiFloat` is a `Number` subclass, so `typeof` reports "object" and
  // `=== 0` never matches: unwrap it before the mapping branch, mirroring
  // Python's `bool(30.0)`. Without this, a `30.0` frontmatter field is
  // silently dropped from the graph.
  if (value instanceof WikiFloat) return value.valueOf() !== 0;
  if (Array.isArray(value)) return value.length > 0;
  if (isRecord(value)) return Object.keys(value).length > 0;
  return true;
}

/**
 * Whether a frontmatter value says anything. Only absence is dropped: `null`,
 * an empty list and an empty mapping. `0`, `0.0`, `false` and `""` are values
 * and become literals (wiki#374), unlike Python's `bool()`, which the retired
 * oracle used and which {@link isTruthy} still mirrors for structural keys.
 */
export function isPresent(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  // A `WikiFloat` is a `Number` object with no own keys: it must be recognized
  // before the mapping branch reads it as an empty mapping.
  if (value instanceof WikiFloat) return true;
  if (Array.isArray(value)) return value.length > 0;
  if (isRecord(value)) return Object.keys(value).length > 0;
  return true;
}

/**
 * A numeric literal the way rdflib infers one from a Python number.
 *
 * JavaScript has a single number type, so a bare `30.0` arrives as the number
 * `30`; the parser marks such values as {@link WikiFloat} at the YAML layer,
 * and only that flag distinguishes `"30.0"^^xsd:double` from `"30"^^xsd:integer`.
 */
export function numericLiteral(
  value: number | WikiFloat,
): ReturnType<typeof literal> {
  const num = value instanceof WikiFloat ? value.valueOf() : value;
  if (!(value instanceof WikiFloat) && Number.isInteger(num)) {
    return literal(String(num), { datatype: XSD_INTEGER });
  }
  // Python's `str` keeps the `.0` on an integral float and switches to exponent
  // form outside 1e-4..1e16; JavaScript's does neither.
  if (Math.abs(num) < 1e16 && num === Math.trunc(num)) {
    return literal(`${num}.0`, { datatype: XSD_DOUBLE });
  }
  return literal(String(num), { datatype: XSD_DOUBLE });
}

/**
 * A `datetime`/`date` literal, typed the way rdflib types one.
 *
 * The parser records the scalar's lexical form as a {@link WikiTimestamp}:
 * date-only values become `xsd:date` and zoned values keep rdflib's `+00:00`
 * spelling instead of `toISOString()`'s `Z`. A `Date` that did not come from
 * YAML has no lexical form to record and keeps the previous rendering.
 */
export function temporalLiteral(value: Date): ReturnType<typeof literal> {
  if (value instanceof WikiTimestamp) {
    return literal(value.lexical, {
      datatype: value.dateOnly ? XSD_DATE : XSD_DATETIME,
    });
  }
  return literal(value.toISOString(), { datatype: XSD_DATETIME });
}

/**
 * SHACL parameters whose every value is a SHACL list rather than repeated
 * triples (SHACL §4.4.4, §4.6, §4.8.1, §4.8.3, §2.3.1.3). Repeating `sh:in`
 * asserts several values where the spec allows at most one, and a stringified
 * list is a one-member enum of its own text (wiki#305).
 */
export const SHACL_LIST_PARAMETERS: ReadonlySet<string> = new Set(
  ["in", "languageIn", "ignoredProperties", "and", "or", "xone"].map(
    (local) => `${SH}${local}`,
  ),
);

/**
 * SHACL parameters whose value is a property path (SHACL §2.3.1). A list here
 * is a sequence path, which the spec requires to have at least two members, so
 * a one-member list collapses to its member: `sh:path: [schema:name]` stays the
 * predicate path `schema:name`.
 */
export const SHACL_PATH_PARAMETERS: ReadonlySet<string> = new Set(
  ["path", "inversePath", "zeroOrMorePath", "oneOrMorePath", "zeroOrOnePath"]
    .map((local) => `${SH}${local}`),
);

/** `sh:alternativePath`: always a SHACL list, and each member is a path. */
export const SHACL_ALTERNATIVE_PATH = `${SH}alternativePath`;
