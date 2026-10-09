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
 * severity, link style, `fmt` type) are byte-identical. The catch-all fallback
 * is this engine's own plain report rather than a reproduction of
 * `str(ValidationError)`: the routers read the issue *shape*, and nothing
 * outside this module depends on pydantic's rendering.
 */

import { ValueError } from "../errors.ts";

/** One validation failure, shaped like a pydantic error dictionary. */
export interface ValidationIssue {
  readonly type: string;
  readonly loc: readonly (string | number)[];
  readonly msg: string;
  readonly input?: unknown;
}

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
    msg: "unexpected key",
    input,
  };
}

/**
 * Build a `value_error` issue, the shape a `field_validator` failure produces.
 *
 * `msg` is the validator's own sentence, rendered as written. The routers match
 * on `type` and on the validator's own phrases, not on a wrapper prefix.
 */
export function valueError(
  loc: readonly (string | number)[],
  message: string,
  input: unknown,
): ValidationIssue {
  return { type: "value_error", loc, msg: message, input };
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
    msg: `expected a mapping or ${modelLabel}`,
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
    msg: "required value is missing",
    input,
  };
}

/**
 * Render an issue list as the fallback report a user sees.
 *
 * This is the port's own format: plain lines naming the location and the
 * failure. The routers read the issue shape, so the rendering is not bound to
 * pydantic's layout.
 */
export function describeValidationError(
  modelName: string,
  issues: readonly ValidationIssue[],
): string {
  const count = issues.length;
  const header = `${count} problem${count === 1 ? "" : "s"} in ${modelName}`;
  const lines = issues.map((issue) => {
    // A model-level failure has no location, so it renders as a bare line
    // rather than an empty location prefix.
    const where = issue.loc.map((part) => String(part)).join(".");
    return where === "" ? `  ${issue.msg}` : `  ${where}: ${issue.msg}`;
  });
  return [header, ...lines].join("\n");
}
