/** A plain-object mapping, mirroring `parser.ts`'s `DataRecord`. */
export type DataRecord = Record<string, unknown>;

/** `true` for a plain object, mirroring `parser.ts`'s `isRecord`. */
export function isRecord(value: unknown): value is DataRecord {
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

/** Internal: correlation failed; the caller falls back to unannotated values. */
export class CorrelationError extends Error {}

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
export function isYamlFloat(data: string): boolean {
  return !PYYAML_INT_REGEXP.test(data) && PYYAML_FLOAT_REGEXP.test(data);
}

/**
 * The rdflib-equivalent lexical form of a YAML timestamp scalar: Python's
 * `isoformat()` of the parsed value, verified against rdflib directly.
 *
 * Returns `null` when the scalar is not a timestamp.
 */
export function timestampLexical(
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
