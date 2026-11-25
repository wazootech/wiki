/**
 * YAML scalar provenance: the lexical forms the YAML layer would otherwise
 * discard.
 *
 * Two divergences from the Python oracle live here, both caused by information
 * JavaScript's runtime types cannot hold:
 *
 * - **Timestamps.** PyYAML hands rdflib a `date` or `datetime`; rdflib types
 *   them `xsd:date` / `xsd:dateTime` and serialises the *lexical* form
 *   (`2026-05-30`, `2026-05-30T00:00:00+00:00`). `@std/yaml` hands us a `Date`
 *   in both cases, and `Date#toISOString` always emits the `...000Z` form —
 *   so a date-only value changed type *and* every zoned value changed
 *   spelling. `WikiTimestamp` carries the rdflib-equivalent lexical form
 *   alongside the instant.
 * - **Floats.** PyYAML hands rdflib a float for `30.0`; rdflib emits
 *   `"30.0"^^xsd:double`. JavaScript parses it to the number `30`, which the
 *   graph layer then reads as `xsd:integer`. `WikiFloat` marks the value as
 *   float-lexical so the graph layer can type it `xsd:double`.
 *
 * `annotateScalars` recovers both from the raw frontmatter text: the scalars
 * are recognised with `@std/yaml`'s own timestamp/integer/float resolvers
 * (copied below, attributed), so exactly the scalars `@std/yaml` resolved to
 * `Date`/`number` are the ones annotated — and the annotation is correlated
 * with the parsed tree structurally, never by guessing.
 *
 * Anything the correlation cannot prove — exotic keys, shape mismatches,
 * unparseable blocks — is left unannotated, which is today's behaviour.
 */

import {
  isAlias,
  isMap,
  isPair,
  isScalar,
  isSeq,
  parseDocument,
  Scalar,
} from "yaml";
import type { Document, Node, YAMLMap } from "yaml";
import {
  CorrelationError,
  type DataRecord,
  isRecord,
  isYamlFloat,
  timestampLexical,
  WikiFloat,
  WikiTimestamp,
} from "./scalars/types.ts";

export { WikiFloat, WikiTimestamp } from "./scalars/types.ts";

/**
 * Annotate the timestamp and float scalars of a parsed YAML frontmatter
 * mapping with their lexical provenance.
 *
 * `attrs` is the tree `@std/yaml` (via linked-markdown's `extract`) parsed
 * from `frontMatter`; the two are walked in lockstep so each `Date`/`number`
 * is annotated from the scalar that produced it. Returns `attrs` unchanged
 * when the block is not YAML-shaped or the trees cannot be correlated.
 *
 * The CST walk needs the `yaml` package's tokenizer, which reads
 * `process.env.LOG_TOKENS` on its debug path; without env permission the
 * parse throws and the values stay unannotated (today's behaviour) rather
 * than failing the load.
 */
export function annotateScalars(
  attrs: DataRecord,
  frontMatter: string,
): DataRecord {
  let doc: Document;
  try {
    doc = parseDocument(frontMatter, { schema: "core" });
  } catch {
    return attrs;
  }
  if (doc.errors.length > 0 || doc.contents === null) return attrs;
  try {
    annotateValue(doc.contents, attrs, doc);
    return attrs;
  } catch {
    // Structural mismatch between the two parsers: leave every value as the
    // YAML layer parsed it rather than annotate the wrong scalar.
    return attrs;
  }
}

/** Annotate one parsed value from its YAML CST node, in place where nested. */
function annotateValue(
  node: Node | null,
  value: unknown,
  doc: Document,
): unknown {
  if (node === null || node === undefined) return value;
  if (isAlias(node)) {
    // Both parsers expand aliases, so the value at the alias position is
    // annotated from the anchor's scalar.
    return annotateValue(node.resolve(doc) as Node | null, value, doc);
  }
  if (isScalar(node)) {
    if (node.type === Scalar.PLAIN) {
      const raw = typeof node.source === "string" ? node.source : "";
      if (value instanceof Date && !(value instanceof WikiTimestamp)) {
        const timestamp = timestampLexical(raw);
        if (timestamp !== null) {
          return new WikiTimestamp(
            timestamp.lexical,
            value,
            timestamp.dateOnly,
          );
        }
        return value;
      }
      if (typeof value === "number" && isYamlFloat(raw)) {
        return new WikiFloat(value);
      }
    }
    return value;
  }
  if (isMap(node)) {
    if (!isRecord(value)) throw new CorrelationError();
    annotateMap(node, value, doc);
    return value;
  }
  if (isSeq(node)) {
    if (!Array.isArray(value)) throw new CorrelationError();
    for (let index = 0; index < node.items.length; index++) {
      value[index] = annotateValue(
        node.items[index] as Node | null,
        value[index],
        doc,
      );
    }
    return value;
  }
  return value;
}

/**
 * Annotate a mapping's values by key lookup, tolerating YAML merge keys.
 *
 * `<<` merges are expanded by both parsers; the anchor's pairs are annotated
 * against the merged record, skipping keys the child overrides.
 */
function annotateMap(map: YAMLMap, record: DataRecord, doc: Document): void {
  const overridden = new Set<string>();
  for (const pair of map.items) {
    if (!isPair(pair) || !isScalar(pair.key)) continue;
    const key = String(pair.key.value);
    if (key !== "<<") overridden.add(key);
  }
  for (const pair of map.items) {
    if (!isPair(pair)) throw new CorrelationError();
    const keyNode = pair.key;
    if (isScalar(keyNode) && String(keyNode.value) === "<<") {
      const merged = isAlias(pair.value) ? pair.value.resolve(doc) : pair.value;
      if (merged !== null && merged !== undefined && isMap(merged)) {
        annotateMerged(merged, record, overridden, doc);
      }
      continue;
    }
    if (!isScalar(keyNode)) throw new CorrelationError();
    const key = String(keyNode.value);
    if (!(key in record)) throw new CorrelationError();
    record[key] = annotateValue(pair.value as Node | null, record[key], doc);
  }
}

/** Annotate the pairs a merge key contributed, skipping overridden keys. */
function annotateMerged(
  merged: YAMLMap,
  record: DataRecord,
  overridden: Set<string>,
  doc: Document,
): void {
  for (const pair of merged.items) {
    if (!isPair(pair) || !isScalar(pair.key)) continue;
    const key = String(pair.key.value);
    if (key === "<<" || overridden.has(key)) continue;
    if (!(key in record)) continue;
    record[key] = annotateValue(pair.value as Node | null, record[key], doc);
  }
}
