/**
 * Document metadata the graph derives instead of asking authors to repeat it
 * (wiki#318, wiki#319).
 *
 * Three values, all schema.org, all optional:
 *
 * - `schema:headline` is the plain text of the first ATX `# H1` outside fenced
 *   code ({@link firstAtxH1}). A Markdown page without one derives none.
 * - `schema:dateCreated` and `schema:dateModified` come from the file's Git
 *   history: the oldest and newest committer time among the commits
 *   `git log --follow` reaches, so a rename does not reset the creation date.
 *   They are UTC, RFC 3339 to the whole second (`2026-10-11T09:30:00Z`), and
 *   typed `xsd:dateTime`. Only the history the checkout already has counts:
 *   nothing is fetched, so a shallow clone reports the commits it holds. With
 *   no usable history (no `git`, not a repository, an untracked or uncommitted
 *   file), both dates fall back to the file's modification time.
 *
 * An explicit frontmatter value for the same predicate always wins; derivation
 * only fills a gap ({@link frontmatterToGraph}'s `derived` option). That makes
 * an explicit value equal to the derived one redundant, which is what
 * {@link redundantFields} reports for `lint.redundant_frontmatter` and what
 * `wiki fix` removes. Nothing here writes to a source file.
 *
 * Cost: one `git rev-parse` per directory per pass, and one `git log` per
 * document per `HEAD`, run with bounded concurrency ({@link deriveMetadataAll})
 * and remembered for the life of the process. A wiki outside a repository, or
 * in one with no commits, pays only the per-directory spawn, and a missing
 * `git` binary or run permission is detected once and never retried.
 */

import type { Config } from "./config.ts";
import type { Context } from "./context.ts";
import { effectiveTypes, resolvePredicate } from "./graph.ts";
import type { DataRecord } from "./parser.ts";
import { WikiTimestamp } from "./scalars.ts";
import {
  DERIVED_PROPERTIES,
  type DerivedMetadata,
  derivedPredicate,
  type DerivedProperty,
  isDateProperty,
} from "./derived/types.ts";

export {
  type DateSource,
  DERIVED_PROPERTIES,
  type DerivedMetadata,
  derivedPredicate,
  type DerivedProperty,
  documentHeadline,
  isDateProperty,
  rfc3339Utc,
} from "./derived/types.ts";
export { gitDates } from "./derived/git.ts";
export { deriveMetadata, deriveMetadataAll } from "./derived/derive.ts";

/** The derived value of one property, or `null`. */
export function derivedValue(
  derived: DerivedMetadata,
  property: DerivedProperty,
): string | null {
  return derived[property];
}

/**
 * Whether a frontmatter value reaches the graph. Mirrors `isPresent` in
 * `graph.ts`: only `null`, an empty list, and an empty mapping say nothing.
 */
function isPresentValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (
    typeof value === "object" && !(value instanceof Date) &&
    !(value instanceof Number) && Object.keys(value).length === 0
  ) {
    return false;
  }
  return true;
}

/** The frontmatter keys that put a value on `predicate`, as the graph resolves them. */
function explicitKeys(
  data: DataRecord,
  predicate: string,
  context: Context,
): string[] {
  return Object.keys(data).filter((key) =>
    !key.startsWith("@") && key !== "id" && key !== "type" &&
    isPresentValue(data[key]) &&
    resolvePredicate(key, context)?.value === predicate
  );
}

/** A derived value the graph adds because no frontmatter key sets it. */
export interface DerivedAddition {
  readonly property: DerivedProperty;
  /** `schema:<property>` under the wiki's `schema` prefix, else the full IRI. */
  readonly key: string;
  readonly predicate: string;
  readonly value: string;
}

/**
 * The derived values that land on a document's subject: every derived value
 * with no explicit frontmatter key for its predicate, and none at all for a
 * document the graph gives no subject (no type). This is what `wiki export`
 * and `wiki file show` report next to the frontmatter as written.
 */
export function derivedAdditions(
  data: DataRecord,
  derived: DerivedMetadata,
  config: Config,
): DerivedAddition[] {
  if (effectiveTypes(data, config).length === 0) return [];
  const context = config.context;
  const additions: DerivedAddition[] = [];
  for (const property of DERIVED_PROPERTIES) {
    const value = derivedValue(derived, property);
    if (value === null) continue;
    const predicate = derivedPredicate(property, context);
    if (explicitKeys(data, predicate, context).length > 0) continue;
    const key = context.namespaces.has("schema")
      ? `schema:${property}`
      : predicate;
    additions.push({ property, key, predicate, value });
  }
  return additions;
}

/** One frontmatter entry that repeats a derived value exactly. */
export interface RedundantField {
  /** The frontmatter key as written (`headline`, `schema:dateModified`, ...). */
  readonly key: string;
  readonly property: DerivedProperty;
  /** The predicate IRI the key and the derived value share. */
  readonly predicate: string;
  /** The derived value it repeats. */
  readonly value: string;
}

/**
 * Whether a frontmatter value is exactly the derived one.
 *
 * Text must match character for character. A date must be a YAML timestamp
 * with a time part (`xsd:dateTime`) at the same instant: a date-only
 * `2026-10-11` is a different, coarser claim than `2026-10-11T00:00:00Z`, and
 * a quoted string is `xsd:string`, so neither repeats the derived value.
 */
function repeatsDerived(
  value: unknown,
  property: DerivedProperty,
  derived: string,
): boolean {
  if (!isDateProperty(property)) return value === derived;
  return value instanceof WikiTimestamp && !value.dateOnly &&
    value.getTime() === Date.parse(derived);
}

/**
 * The frontmatter entries that repeat a derived value exactly.
 *
 * Keys count as the same property when they resolve to the same predicate IRI
 * (`headline` under a schema.org `@vocab` and `schema:headline` agree). A
 * property is redundant only when *every* key for it repeats the derived
 * value: if `headline: A` sits next to `schema:headline: B`, removing the
 * first would change the graph, so neither is reported. Nothing is reported
 * for a document the graph gives no subject (no type), or when removing the
 * entries would leave the frontmatter with no keys at all.
 */
export function redundantFields(
  data: DataRecord,
  derived: DerivedMetadata,
  config: Config,
): RedundantField[] {
  if (effectiveTypes(data, config).length === 0) return [];
  const context = config.context;
  const found: RedundantField[] = [];
  for (const property of DERIVED_PROPERTIES) {
    const value = derivedValue(derived, property);
    if (value === null) continue;
    const predicate = derivedPredicate(property, context);
    const keys = explicitKeys(data, predicate, context);
    if (keys.length === 0) continue;
    if (!keys.every((key) => repeatsDerived(data[key], property, value))) {
      continue;
    }
    for (const key of keys) found.push({ key, property, predicate, value });
  }
  const removed = new Set(found.map((field) => field.key));
  const remaining = Object.keys(data).filter((key) =>
    key !== "@context" && !removed.has(key)
  );
  return remaining.length === 0 ? [] : found;
}
