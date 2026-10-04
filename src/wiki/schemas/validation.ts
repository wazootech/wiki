/**
 * A minimal stand-in for the parts of pydantic the config layer depends on.
 *
 * The Python config models are pydantic models, and `config.py` inspects the
 * resulting `ValidationError` to produce its user-facing messages. Rather than
 * hand-write those messages per field, the port emits the same *shape* of error
 * list the pydantic inspection expects — `type`, `loc`, `msg`, `input` — and
 * keeps `formatConfigValidationError` a faithful translation of the Python
 * routing logic. One place to change, one place to test.
 *
 * Fidelity boundary: the *terminal* messages the routers produce (unknown keys,
 * severity, link style, `fmt` type) are byte-identical. The catch-all
 * `str(ValidationError)` fallback reproduces pydantic 2.13's layout but not its
 * repr truncation of long inputs, so a nested-model failure that reaches the
 * fallback is spec-close rather than byte-close. The differential harness decides
 * whether that ever reaches a user.
 */

import { ValueError } from "../errors.ts";
import { pyRepr, pyTypeName } from "../pyrepr.ts";

/** One validation failure, shaped like a pydantic error dictionary. */
export interface ValidationIssue {
  readonly type: string;
  readonly loc: readonly (string | number)[];
  readonly msg: string;
  readonly input?: unknown;
}

/** Pydantic version the fallback formatting is modelled on. */
const PYDANTIC_VERSION = "2.13";

/**
 * Raised where Python raises `pydantic.ValidationError`.
 *
 * It extends {@link ValueError} because pydantic's `ValidationError` does —
 * callers throughout the Python engine catch `ValueError` around config
 * construction, and a port that were only an `Error` would let those failures
 * escape as crashes.
 */
export class SchemaValidationError extends ValueError {
  readonly modelName: string;
  readonly issues: readonly ValidationIssue[];

  constructor(modelName: string, issues: readonly ValidationIssue[]) {
    super(describeValidationError(modelName, issues));
    this.name = "SchemaValidationError";
    this.modelName = modelName;
    this.issues = issues;
  }
}

/** Build an `extra_forbidden` issue for a key the model does not declare. */
export function extraForbidden(
  loc: readonly (string | number)[],
  input: unknown,
): ValidationIssue {
  return {
    type: "extra_forbidden",
    loc,
    msg: "Extra inputs are not permitted",
    input,
  };
}

/**
 * Build a `value_error` issue, the shape a `field_validator` failure produces.
 *
 * pydantic prefixes the validator's message with `"Value error, "`, which the
 * routers match on — so the prefix is part of the contract, not decoration.
 */
export function valueError(
  loc: readonly (string | number)[],
  message: string,
  input: unknown,
): ValidationIssue {
  return { type: "value_error", loc, msg: `Value error, ${message}`, input };
}

/** Build a `model_type` issue for a block that should have been a mapping. */
export function modelType(
  loc: readonly (string | number)[],
  modelLabel: string,
  input: unknown,
): ValidationIssue {
  return {
    type: "model_type",
    loc,
    msg: `Input should be a valid dictionary or instance of ${modelLabel}`,
    input,
  };
}

/** Build a `missing` issue for a required field. */
export function missing(
  loc: readonly (string | number)[],
  input: unknown,
): ValidationIssue {
  return {
    type: "missing",
    loc,
    msg: "Field required",
    input,
  };
}

/** Render an issue list the way `str(pydantic.ValidationError)` does. */
export function describeValidationError(
  modelName: string,
  issues: readonly ValidationIssue[],
): string {
  const count = issues.length;
  const header = `${count} validation error${
    count === 1 ? "" : "s"
  } for ${modelName}`;
  const lines = issues.map((issue) => {
    const rows: string[] = [];
    // A model-level failure has no location, and pydantic then prints no
    // location line at all rather than an empty one.
    if (issue.loc.length > 0) {
      rows.push(issue.loc.map((part) => String(part)).join("."));
    }
    const input = pyRepr(issue.input);
    const type = pyTypeName(issue.input);
    rows.push(
      `  ${issue.msg} [type=${issue.type}, input_value=${input}, input_type=${type}]`,
    );
    rows.push(
      `    For further information visit https://errors.pydantic.dev/${PYDANTIC_VERSION}/v/${issue.type}`,
    );
    return rows.join("\n");
  });
  return [header, ...lines].join("\n");
}
