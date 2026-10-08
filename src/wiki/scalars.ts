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

/** A plain-object mapping, mirroring `parser.ts`'s `DataRecord`. */
type DataRecord = Record<string, unknown>;

/** `true` for a plain object, mirroring `parser.ts`'s `isRecord`. */
function isRecord(value: unknown): value is DataRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A YAML timestamp scalar with its rdflib-equivalent lexical form preserved.
 *
 * Extends `Date` so every existing `instanceof Date` check keeps working; the
 * graph layer reads {@link lexical} and {@link dateOnly} instead of calling
 * `toISOString()`.
 */
export class WikiTimestamp extends Date {
  /** The lexical form rdflib would serialise, e.g. `2026-05-30+00:00`-style. */
  readonly lexical: string;
  /** `true` when the scalar was date-only (`xsd:date`, not `xsd:dateTime`). */
  readonly dateOnly: boolean;

  constructor(lexical: string, date: Date, dateOnly: boolean) {
    super(date.getTime());
    this.lexical = lexical;
    this.dateOnly = dateOnly;
  }
}

/**
 * A number parsed from a YAML *float* lexical (e.g. `30.0`, `1e3`).
 *
 * Extends `Number` so arithmetic, `String()`, and `JSON.stringify` keep
 * working; the graph layer checks `instanceof WikiFloat` before the
 * `typeof value === "number"` branch and types it `xsd:double`.
 */
export class WikiFloat extends Number {
  constructor(value: number) {
    super(value);
  }
}

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

/** Internal: correlation failed; the caller falls back to unannotated values. */
class CorrelationError extends Error {}

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

// ---------------------------------------------------------------------------
// Scalar recognition.
//
// Timestamps use `@std/yaml`'s own resolvers (copied from
// jsr:@std/yaml@1.2.0 `_type/timestamp.ts`, itself ported from js-yaml
// v3.13.1), so the annotated scalars are exactly the ones `@std/yaml`
// resolves to `Date`.
//
// Integer vs. float uses **PyYAML's** resolvers (`yaml/resolver.py`) instead:
// what matters for the graph layer is how the *oracle* classifies the scalar,
// and `@std/yaml`'s float pattern is looser (it matches plain `30` and
// sign-less `1e3`, which PyYAML reads as int and string respectively).
// ---------------------------------------------------------------------------

const YAML_DATE_REGEXP = /^([0-9][0-9][0-9][0-9])-([0-9][0-9])-([0-9][0-9])$/;

const YAML_TIMESTAMP_REGEXP =
  /^([0-9][0-9][0-9][0-9])-([0-9][0-9]?)-([0-9][0-9]?)(?:[Tt]|[ \t]+)([0-9][0-9]?):([0-9][0-9]):([0-9][0-9])(?:\.([0-9]*))?(?:[ \t]*(Z|([-+])([0-9][0-9]?)(?::([0-9][0-9]))?))?$/;

// PyYAML `yaml/resolver.py`: int is tried before float.
const PYYAML_INT_REGEXP =
  /^(?:[-+]?0b[0-1_]+|[-+]?0[0-7_]+|[-+]?(?:0|[1-9][0-9_]*)|[-+]?0x[0-9a-fA-F_]+|[-+]?[1-9][0-9_]*(?::[0-5]?[0-9])+)$/;
const PYYAML_FLOAT_REGEXP =
  /^(?:[-+]?(?:[0-9][0-9_]*)\.[0-9_]*(?:[eE][-+]?[0-9]+)?|\.[0-9_]+(?:[eE][-+]?[0-9]+)?|[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*|[-+]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN))$/;

/**
 * `true` when PyYAML would read the scalar as a float (and `@std/yaml` did
 * resolve it to a number): the `xsd:double` cases like `30.0`.
 */
function isYamlFloat(data: string): boolean {
  return !PYYAML_INT_REGEXP.test(data) && PYYAML_FLOAT_REGEXP.test(data);
}

/**
 * The rdflib-equivalent lexical form of a YAML timestamp scalar: Python's
 * `isoformat()` of the parsed value, verified against rdflib directly.
 *
 * Returns `null` when the scalar is not a timestamp.
 */
function timestampLexical(
  raw: string,
): { lexical: string; dateOnly: boolean } | null {
  if (YAML_DATE_REGEXP.test(raw)) return { lexical: raw, dateOnly: true };
  const match = YAML_TIMESTAMP_REGEXP.exec(raw);
  if (match === null) return null;
  const pad2 = (s: string): string => s.padStart(2, "0");
  let lexical = `${match[1]}-${pad2(match[2]!)}-${pad2(match[3]!)}T${
    pad2(match[4]!)
  }:${match[5]}:${match[6]}`;
  const fraction = match[7] ?? "";
  if (fraction !== "") {
    // Python's `isoformat()` pads the fraction to six digits and omits it
    // when the microsecond is zero.
    const micros = Number.parseInt((fraction + "000000").slice(0, 6), 10);
    if (micros !== 0) lexical += `.${String(micros).padStart(6, "0")}`;
  }
  const tz = match[8];
  if (tz !== undefined) {
    if (tz === "Z") {
      // rdflib renders a UTC zone as `+00:00`, never `Z`.
      lexical += "+00:00";
    } else {
      lexical += `${match[9]}${pad2(match[10]!)}:${match[11] ?? "00"}`;
    }
  }
  return { lexical, dateOnly: false };
}
