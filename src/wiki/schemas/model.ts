/**
 * A small, declarative stand-in for the parts of pydantic the config layer uses.
 *
 * `config.py` does not merely *read* validation failures, it *routes* on them:
 * `format_config_validation_error` inspects each error's `type`, `loc`, `msg`,
 * and `input` to decide which user-facing message to produce. Reproducing that
 * routing faithfully means reproducing the error list pydantic would have
 * produced — the field order, the location paths, the `Value error, ` prefix on
 * validator failures, and `extra_forbidden` for undeclared keys.
 *
 * So this is deliberately a data description of each model rather than a
 * general framework: specs mirror the Python models field-for-field, and
 * `validateModel` walks them in declaration order the way pydantic does.
 *
 * Fidelity boundary: the per-field errors the routers actually match on
 * (`value_error` for a coercer, `extra_forbidden` for an extra key,
 * `model_type` for a block that is not a mapping, `literal_error` for a closed
 * set) are shaped exactly. One divergence is deliberate and documented at the
 * `sources` spec in `wiki_config.ts`: python validates each source by
 * constructing the nested model inside a field coercer, so a structural failure
 * there is wrapped into a single `value_error`, whereas the port reports the
 * nested issue at its own location. Both reach the same fallback text.
 */

import { ValueError } from "../errors.ts";
import {
  extraForbidden,
  missing as missingIssue,
  modelType,
  type ValidationIssue,
  valueError,
} from "./validation.ts";

/** A field's default: a value, or a factory called once per instance. */
export interface FieldSpec {
  /** `true` when pydantic would report `Field required`. */
  readonly required?: boolean;
  /** Static default, used when the key is absent. */
  readonly defaultValue?: unknown;
  /** `default_factory`; called per instance so mutable defaults are not shared. */
  readonly factory?: () => unknown;
  /** Alternate input keys, standing in for pydantic's `AliasChoices`. */
  readonly aliases?: readonly string[];
  /** pydantic `mode="before"` coercer. Throws {@link ValueError} to fail. */
  readonly before?: (value: unknown) => unknown;
  /** pydantic `mode="after"` validator. Throws {@link ValueError} to fail. */
  readonly after?: (value: unknown) => unknown;
  /** A nested model, e.g. `wiki: WikiConfig`. */
  readonly model?: () => ModelSpec;
  /** A list of nested models, e.g. `sources: list[SourceConfig]`. */
  readonly models?: () => ModelSpec;
  /** A closed set of permitted scalars, standing in for `Literal[...]`. */
  readonly literal?: readonly (string | number | boolean)[];
}

/** One model: its pydantic class name and its fields, in declaration order. */
export interface ModelSpec {
  /** The pydantic class name, used in `model_type` text and error headers. */
  readonly label: string;
  readonly fields: readonly (readonly [string, FieldSpec])[];
  /** pydantic `extra="forbid"`: undeclared keys become `extra_forbidden`. */
  readonly forbidExtra?: boolean;
}

/** Build a `literal_error` issue the way pydantic spells one. */
function literalError(
  loc: readonly (string | number)[],
  input: unknown,
  permitted: readonly (string | number | boolean)[],
): ValidationIssue {
  const quoted = permitted.map((item) => `'${String(item)}'`);
  const expected = quoted.length === 1
    ? quoted[0]!
    : `${quoted.slice(0, -1).join(", ")} or ${quoted[quoted.length - 1]!}`;
  return {
    type: "literal_error",
    loc,
    msg: `Input should be ${expected}`,
    input,
  };
}

/** Run a coercer, converting a thrown `ValueError` into a `value_error` issue. */
function coerce(
  coercion: ((value: unknown) => unknown) | undefined,
  value: unknown,
  name: string,
  loc: readonly (string | number)[],
  issues: ValidationIssue[],
  fallback: unknown,
): unknown {
  if (coercion === undefined) return value;
  try {
    return coercion(value);
  } catch (error) {
    if (error instanceof ValueError) {
      issues.push(valueError([...loc, name], error.message, value));
      return fallback;
    }
    throw error;
  }
}

/** The declared default for a field, or `undefined` when there is none. */
function fieldDefault(spec: FieldSpec): unknown {
  if (spec.factory !== undefined) return spec.factory();
  return spec.defaultValue;
}

/**
 * Validate `raw` against `spec`, returning the coerced values.
 *
 * Issues are appended to `issues` rather than thrown, because pydantic reports
 * every field failure of one model in a single `ValidationError` and the
 * routing code reads the whole list.
 */
export function validateModel(
  spec: ModelSpec,
  raw: unknown,
  loc: readonly (string | number)[],
  issues: ValidationIssue[],
): Record<string, unknown> {
  if (raw === undefined) {
    // An absent block takes its defaults. An explicit `null` is *not* the same
    // thing: pydantic reports `model_type` for `wiki: null`, and the router
    // turns that into "wiki must be a mapping".
    raw = {};
  }
  if (!isMapping(raw)) {
    issues.push(modelType(loc, spec.label, raw));
    return {};
  }
  const record = raw;
  const consumed = new Set<string>();
  const values: Record<string, unknown> = {};

  for (const [name, field] of spec.fields) {
    const candidates = [...(field.aliases ?? []), name];
    let present = false;
    let input: unknown;
    for (const candidate of candidates) {
      if (Object.hasOwn(record, candidate)) {
        consumed.add(candidate);
        if (!present) {
          input = record[candidate];
          present = true;
        }
      }
    }

    if (!present) {
      if (field.required === true) {
        issues.push(missingIssue([...loc, name], undefined));
      }
      // An absent block still yields an instance — pydantic builds it from the
      // nested model's own defaults, which is how `Config()` gets a `WikiConfig`.
      if (field.model !== undefined) {
        values[name] = validateModel(field.model(), {}, [...loc, name], issues);
      } else if (field.models !== undefined) {
        values[name] = [];
      } else {
        values[name] = fieldDefault(field);
      }
      continue;
    }

    const beforeCount = issues.length;
    let value = coerce(
      field.before,
      input,
      name,
      loc,
      issues,
      fieldDefault(field),
    );
    if (issues.length > beforeCount) continue;

    if (field.model !== undefined) {
      value = validateModel(field.model(), value, [...loc, name], issues);
    } else if (field.models !== undefined) {
      if (!Array.isArray(value)) {
        issues.push({
          type: "list_type",
          loc: [...loc, name],
          msg: "Input should be a valid list",
          input: value,
        });
        continue;
      }
      const elementSpec = field.models();
      value = value.map((element, index) =>
        validateModel(elementSpec, element, [...loc, name, index], issues)
      );
    } else if (field.literal !== undefined) {
      // `Literal[...] | None = None` accepts None; a required `Literal[...]`
      // does not. The difference is the absent default.
      const nullable = !field.required;
      if (
        !(value === null && nullable) &&
        !field.literal.includes(value as string | number | boolean)
      ) {
        issues.push(literalError([...loc, name], value, field.literal));
        continue;
      }
    }

    const afterCount = issues.length;
    value = coerce(field.after, value, name, loc, issues, fieldDefault(field));
    if (issues.length > afterCount) continue;

    values[name] = value;
  }

  if (spec.forbidExtra === true) {
    for (const [key, value] of Object.entries(record)) {
      if (!consumed.has(key)) issues.push(extraForbidden([...loc, key], value));
    }
  }

  return values;
}

/** `true` for a plain object, standing in for `isinstance(value, dict)`. */
export function isMapping(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
