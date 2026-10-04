/**
 * JSON Schema validation, with a reporting layer that speaks `jsonschema`.
 *
 * There is no Python counterpart to this file: `frontmatter_schema.py` delegates
 * the entire language to `jsonschema`, and the ADR swaps that dependency for
 * `ajv`. The swap is *not* behaviour-preserving on the two things `wiki check`
 * puts in front of a user, so this module is where the difference is contained:
 *
 * - **Wording.** jsonschema says `'headline' is a required property`; ajv says
 *   `must have required property 'headline'`. Every message is composed here
 *   from the keyword's own parameters, following jsonschema 4.26's
 *   `_keywords.py` / `_legacy_keywords.py` templates literally.
 * - **Cardinality.** jsonschema reports one node-level error naming every
 *   unexpected property — `Additional properties are not allowed ('another',
 *   'stray' were unexpected)` — while ajv reports one error per property; for
 *   `anyOf`/`oneOf`/`contains` the relationship runs the other way. The
 *   composite keywords are collapsed or expanded back to jsonschema's shape.
 * - **Order.** jsonschema emits errors depth-first in *schema key order*; ajv
 *   emits them in code-generation order, which puts `required` before
 *   `additionalProperties` even when the document declares them the other way
 *   round. `check_frontmatter_schema` sorts by instance path with a *stable*
 *   sort, so the pre-sort order survives into the printed output and has to be
 *   reconstructed — see {@link schemaRank}.
 *
 * The evidence is `probes/json-schema/`: a 60-case corpus run through both
 * engines. It records that the two agree on the verdict for every case
 * (`verdict agrees 60`) and that the messages agree on almost none of them
 * (`messages agree 9`), which is exactly why this layer exists rather than
 * passing ajv's text through. `tests/fixtures/jsonschema/` holds the same corpus
 * with the oracle's output, and `tests/json_schema_test.ts` replays it byte for
 * byte.
 *
 * Deliberate divergences, all recorded in the probe's FINDINGS.md:
 *
 * - A schema document jsonschema only chokes on *while validating* — an unknown
 *   `type` name, a non-numeric `minimum`, an unresolvable `$ref`, an invalid
 *   regex — makes ajv throw at compile time. The oracle reaches a traceback;
 *   the port reports it as a readable `invalid JSON Schema document (...)`
 *   issue. Nothing can be validated either way; only the failure's voice
 *   differs.
 * - `format` is an annotation on both sides (`Draft202012Validator(schema)`
 *   takes no format checker; ajv runs with `validateFormats: false`), so both
 *   accept a malformed `email`.
 * - Python's float formatting cannot be reproduced from JSON, which loses the
 *   distinction between `1` and `1.0`. A message quoting such a number is
 *   spec-close rather than byte-close.
 */

// The named export rather than the default: `ajv`'s `dist/2020.js` assigns
// `module.exports = Ajv2020`, so Deno's CJS interop exposes the class both ways
// at runtime, but only the named form type-checks against the shipped types.
import {
  Ajv2020,
  type ErrorObject,
  type ValidateFunction,
} from "ajv/dist/2020.js";
import { pyRepr } from "./pyrepr.ts";

/** A validation failure, shaped the way `jsonschema.ValidationError` exposes one. */
export interface JsonSchemaError {
  /** The instance location, as `e.path` — dict keys as strings, list indices as numbers. */
  readonly path: readonly (string | number)[];
  /** The failing keyword, as `e.validator`. */
  readonly keyword: string;
  /** The rendered message, as `str(e)` — reaching users through `wiki check`. */
  readonly message: string;
}

/**
 * Raised where `jsonschema` raises at construction.
 *
 * The Python side wraps construction in `except Exception` and turns the result
 * into `invalid JSON Schema document (...)`; this type is what that catch
 * clause matches.
 */
export class JsonSchemaCompileError extends Error {
  override readonly name = "JsonSchemaCompileError";
}

/**
 * The `ajv` options that mirror `Draft202012Validator(schema)`.
 *
 * - `allErrors` — jsonschema yields every failure, not the first.
 * - `validateSchema: false` — jsonschema does not check the schema against a
 *   meta-schema, and `$schema` declarations (draft-07 in the wild) are ignored
 *   rather than fetched. Left on, ajv rejects both.
 * - `strict: false` — unknown keywords and `$comment` are annotations to
 *   jsonschema; ajv's strict mode fails the compile instead.
 * - `validateFormats: false` — jsonschema asserts `format` only with a format
 *   checker, which `frontmatter_schema.py` never supplies.
 * - `verbose: true` — the message templates need each error's own subschema
 *   (`e.schema`) and its container (`e.parentSchema`).
 */
const AJV_OPTIONS = {
  allErrors: true,
  validateSchema: false,
  strict: false,
  validateFormats: false,
  verbose: true,
} as const;

/** Keywords whose own error *replaces* their descendants' errors. */
const COMPOSITE_KEYWORDS: ReadonlySet<string> = new Set([
  "anyOf",
  "oneOf",
  "contains",
  "maxContains",
]);

/**
 * A compiled schema document.
 *
 * Compilation is where a malformed document surfaces, so the constructor is
 * where {@link JsonSchemaCompileError} comes from — matching the Python side,
 * which builds its validator once per schema reference and caches the outcome.
 */
export class JsonSchemaValidator {
  readonly schema: unknown;
  readonly #validate: ValidateFunction;

  constructor(schema: unknown) {
    this.schema = schema;
    const ajv = new Ajv2020(AJV_OPTIONS);
    try {
      this.#validate = ajv.compile(schema as object);
    } catch (error) {
      throw new JsonSchemaCompileError(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /** `true` when the instance satisfies the schema. */
  isValid(instance: unknown): boolean {
    return this.#validate(instance) === true;
  }

  /**
   * Every failure, in `iter_errors` order, worded the way jsonschema words it.
   *
   * The order is jsonschema's, not ajv's; callers that sort (as
   * `check_frontmatter_schema` does, by instance path) get the same stable
   * result because the input order already matches.
   */
  errors(instance: unknown): JsonSchemaError[] {
    this.#validate(instance);
    const raw = (this.#validate.errors ?? []) as ErrorObject[];
    return project(raw, this.schema, instance);
  }
}

type JsonValue = Record<string, unknown>;

function isRecord(value: unknown): value is JsonValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function param(error: ErrorObject, name: string): unknown {
  return (error.params as Record<string, unknown>)[name];
}

/**
 * The subschema attached to an error, when `verbose` supplied one.
 *
 * `ajv`'s `schema` is the keyword's *value* (`required` → the name list), which
 * is what several templates interpolate.
 */
function subSchema(error: ErrorObject): unknown {
  return (error as { schema?: unknown }).schema;
}

function parentSchema(error: ErrorObject): JsonValue | null {
  const parent = (error as { parentSchema?: unknown }).parentSchema;
  return isRecord(parent) ? parent : null;
}

/** Python's `sorted()` over strings, which is by code point. */
function pySortStrings(values: readonly string[]): string[] {
  // JavaScript's default sort is by UTF-16 code unit, which disagrees with
  // Python only for astral characters compared against U+E000-U+FFFF. The
  // comparator is spelled out so that difference stays visible rather than
  // implied.
  return [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** jsonschema's `_utils.extras_msg`, minus the leading noun. */
function extrasMessage(extras: readonly unknown[]): string {
  const verb = extras.length === 1 ? "was" : "were";
  return `${
    extras.map((extra) => pyRepr(extra)).join(", ")
  } ${verb} unexpected`;
}

/** Validate a subschema on its own, for the templates that need per-item verdicts. */
const subValidators = new WeakMap<object, JsonSchemaValidator | null>();

function subValidator(schema: unknown): JsonSchemaValidator | null {
  if (typeof schema !== "object" || schema === null) return null;
  const cached = subValidators.get(schema);
  if (cached !== undefined) return cached;
  let validator: JsonSchemaValidator | null = null;
  try {
    validator = new JsonSchemaValidator(schema);
  } catch {
    validator = null;
  }
  subValidators.set(schema, validator);
  return validator;
}

/** The instance value at a path, or `undefined` when the path does not exist. */
function instanceAt(
  instance: unknown,
  path: readonly (string | number)[],
): unknown {
  let current = instance;
  for (const step of path) {
    if (Array.isArray(current)) {
      current = current[Number(step)];
    } else if (isRecord(current)) {
      current = current[String(step)];
    } else {
      return undefined;
    }
  }
  return current;
}

interface RenderContext {
  readonly error: ErrorObject;
  /** Value at the instance path, or an override (`propertyNames` validates names). */
  readonly instance: unknown;
  readonly schema: unknown;
  readonly parentSchema: JsonValue | null;
}

/** `{instance!r} is not of type 'string', 'null'`. */
function typeMessage(error: ErrorObject, instance: unknown): string {
  const raw = param(error, "type");
  const types = Array.isArray(raw) ? raw : [raw];
  return `${pyRepr(instance)} is not of type ${
    types.map((type) => pyRepr(type)).join(", ")
  }`;
}

/**
 * `jsonschema.oneOf`'s two messages.
 *
 * A single match is valid, so this only runs when nothing matched or when more
 * than one did. The redundant-match message lists the matches *after* the first
 * one, then the first one last — an artifact of jsonschema breaking out of its
 * loop and continuing with the iterator — and ajv stops counting at two, so the
 * full set is recomputed from the subschemas.
 */
function oneOfMessage(instance: unknown, schema: unknown): string {
  const subschemas = Array.isArray(schema) ? schema : [];
  const matches: number[] = [];
  for (let index = 0; index < subschemas.length; index++) {
    const validator = subValidator(subschemas[index]);
    if (validator !== null && validator.isValid(instance)) matches.push(index);
  }
  if (matches.length <= 1) {
    return `${pyRepr(instance)} is not valid under any of the given schemas`;
  }
  const [first, ...others] = matches;
  const ordered = [...others, first as number];
  const reprs = ordered
    .map((index) => pyRepr(subschemas[index]))
    .join(", ");
  return `${pyRepr(instance)} is valid under each of ${reprs}`;
}

/**
 * `jsonschema.contains`'s three messages, keyed by how many items matched.
 *
 * ajv reports `maxContains` through the `contains` keyword rather than beside
 * it, and jsonschema tests the upper bound while iterating — before it can know
 * the match count — so the max branch wins when both bounds fail.
 */
function containsMessage(
  error: ErrorObject,
  instance: unknown,
  schema: unknown,
): string {
  const items = Array.isArray(instance) ? instance : [];
  const validator = subValidator(schema);
  let matches = 0;
  if (validator !== null) {
    for (const item of items) if (validator.isValid(item)) matches++;
  }
  const maxContains = param(error, "maxContains");
  if (typeof maxContains === "number" && matches > maxContains) {
    return `Too many items match the given schema (expected at most ${maxContains})`;
  }
  const minContains = param(error, "minContains");
  const minimum = typeof minContains === "number" ? minContains : 1;
  if (matches === 0) {
    return `${
      pyRepr(instance)
    } does not contain items matching the given schema`;
  }
  return `Too few items match the given schema (expected at least ${minimum} but only ${matches} matched)`;
}

/**
 * Every message template, transcribed from jsonschema 4.26.
 *
 * A keyword that is absent here falls back to ajv's own wording — a visible,
 * documented difference rather than a silently wrong one. The corpus and the
 * served schemas' keywords are all covered; `FINDINGS.md` lists them.
 */
const RENDERERS: Readonly<Record<string, (ctx: RenderContext) => string>> = {
  type: ({ error, instance }) => typeMessage(error, instance),
  required: ({ error }) =>
    `${pyRepr(param(error, "missingProperty"))} is a required property`,
  minLength: ({ instance }) => `${pyRepr(instance)} is too short`,
  maxLength: ({ instance }) => `${pyRepr(instance)} is too long`,
  pattern: ({ error, instance }) =>
    `${pyRepr(instance)} does not match ${pyRepr(param(error, "pattern"))}`,
  minItems: ({ error, instance }) =>
    `${pyRepr(instance)} ${
      param(error, "limit") === 1 ? "should be non-empty" : "is too short"
    }`,
  maxItems: ({ instance }) => `${pyRepr(instance)} is too long`,
  uniqueItems: ({ instance }) => `${pyRepr(instance)} has non-unique elements`,
  minProperties: ({ instance }) =>
    `${pyRepr(instance)} does not have enough properties`,
  maxProperties: ({ instance }) =>
    `${pyRepr(instance)} has too many properties`,
  enum: ({ instance, schema }) =>
    `${pyRepr(instance)} is not one of ${pyRepr(schema)}`,
  const: ({ schema }) => `${pyRepr(schema)} was expected`,
  minimum: ({ instance, schema }) =>
    `${pyRepr(instance)} is less than the minimum of ${pyRepr(schema)}`,
  exclusiveMinimum: ({ instance, schema }) =>
    `${pyRepr(instance)} is less than or equal to the minimum of ${
      pyRepr(schema)
    }`,
  maximum: ({ instance, schema }) =>
    `${pyRepr(instance)} is greater than the maximum of ${pyRepr(schema)}`,
  exclusiveMaximum: ({ instance, schema }) =>
    `${pyRepr(instance)} is greater than or equal to the maximum of ${
      pyRepr(schema)
    }`,
  multipleOf: ({ instance, schema }) =>
    `${pyRepr(instance)} is not a multiple of ${pyRepr(schema)}`,
  dependentRequired: ({ error }) =>
    `${pyRepr(param(error, "missingProperty"))} is a dependency of ${
      pyRepr(param(error, "property"))
    }`,
  anyOf: ({ instance }) =>
    `${pyRepr(instance)} is not valid under any of the given schemas`,
  oneOf: ({ instance, schema }) => oneOfMessage(instance, schema),
  not: ({ instance, schema }) =>
    `${pyRepr(instance)} should not be valid under ${pyRepr(schema)}`,
  contains: ({ error, instance, schema }) =>
    containsMessage(error, instance, schema),
  maxContains: ({ error }) =>
    `Too many items match the given schema (expected at most ${
      String(param(error, "maxContains"))
    })`,
  additionalProperties: ({ error, parentSchema }) =>
    additionalPropertiesMessage(error, parentSchema),
  unevaluatedProperties: ({ error }) =>
    `Unevaluated properties are not allowed (${
      extrasMessage(
        pySortStrings([String(param(error, "unevaluatedProperty"))]),
      )
    })`,
};

/**
 * The node-level message for `additionalProperties: false`.
 *
 * jsonschema collects every unexpected property into a set and names the sorted
 * result in one error; when the schema also has `patternProperties` it reports
 * the offending names against the regexes instead.
 */
function additionalPropertiesMessage(
  error: ErrorObject,
  parent: JsonValue | null,
): string {
  const names = [String(param(error, "additionalProperty"))];
  const patterns = parent === null ? undefined : parent["patternProperties"];
  if (isRecord(patterns)) {
    const verb = names.length === 1 ? "does" : "do";
    return `${
      pySortStrings(names).map((name) => pyRepr(name)).join(", ")
    } ${verb} not match any of the regexes: ${
      pySortStrings(Object.keys(patterns)).map((pattern) => pyRepr(pattern))
        .join(", ")
    }`;
  }
  return `Additional properties are not allowed (${
    extrasMessage(pySortStrings(names))
  })`;
}

/** jsonschema's `e.path`, typed the way Python types it: list indices are ints. */
function instancePath(
  error: ErrorObject,
  instance: unknown,
): (string | number)[] {
  if (error.instancePath === "") return [];
  const segments = error.instancePath.slice(1).split("/").map((
    segment,
  ) => segment.replace(/~1/g, "/").replace(/~0/g, "~"));
  const path: (string | number)[] = [];
  let current = instance;
  for (const segment of segments) {
    if (Array.isArray(current)) {
      path.push(Number(segment));
      current = current[Number(segment)];
    } else {
      path.push(segment);
      current = isRecord(current) ? current[segment] : undefined;
    }
  }
  return path;
}

/**
 * The schema path, as ranks among each container's keys.
 *
 * jsonschema walks a schema node's keywords in declaration order and descends
 * into a keyword's subschemas during that keyword's turn, so an error's
 * position is the lexicographic rank of its schema path — and ajv, which
 * compiles keywords into whatever order its code generator likes, does not
 * produce that order on its own. Measured by the probe's
 * `order-additional-then-required` case: identical keys, opposite output.
 */
function schemaRank(schemaPath: string, rootSchema: unknown): number[] {
  const ranks: number[] = [];
  const segments = schemaPath.split("/").slice(1).map((segment) =>
    decodeURIComponent(segment.replace(/~1/g, "/").replace(/~0/g, "~"))
  );
  let container: unknown = rootSchema;
  for (const segment of segments) {
    let rank = 0;
    if (Array.isArray(container)) {
      rank = Number(segment);
      container = container[rank];
    } else if (isRecord(container)) {
      const index = Object.keys(container).indexOf(segment);
      rank = index < 0 ? Number.MAX_SAFE_INTEGER : index;
      container = container[segment];
    } else {
      container = undefined;
    }
    ranks.push(rank);
  }
  return ranks;
}

function compareRanks(a: readonly number[], b: readonly number[]): number {
  const shared = Math.min(a.length, b.length);
  for (let index = 0; index < shared; index++) {
    const left = a[index] as number;
    const right = b[index] as number;
    if (left !== right) return left - right;
  }
  return a.length - b.length;
}

interface Candidate {
  readonly rank: readonly number[];
  readonly error: JsonSchemaError;
}

/**
 * Turn ajv's error stream into jsonschema's.
 *
 * Three passes over one loop: composite keywords are collapsed to their summary
 * (or expanded, for `propertyNames`), node-level extra-property errors are
 * merged into a single message, everything else is re-worded — and the result
 * is ordered by schema rank.
 */
function project(
  raw: readonly ErrorObject[],
  rootSchema: unknown,
  instance: unknown,
): JsonSchemaError[] {
  // A composite keyword's own error speaks for its descendants, and
  // `propertyNames` validates the property *names* — its sub-errors are
  // re-derived per name below rather than read off the stream.
  const summaries = raw.filter((error) =>
    COMPOSITE_KEYWORDS.has(error.keyword) || error.keyword === "propertyNames"
  );
  const suppressed = (error: ErrorObject): boolean =>
    summaries.some((summary) =>
      summary !== error && error.schemaPath.startsWith(`${summary.schemaPath}/`)
    );

  const candidates: Candidate[] = [];
  const collapsed = new Map<
    string,
    { rank: readonly number[]; names: unknown[]; error: ErrorObject }
  >();

  for (const error of raw) {
    // `if` adds an ajv-only summary around the `then`/`else` errors jsonschema
    // reports; the summary is dropped and the branch errors kept.
    if (error.keyword === "if") continue;
    if (error.keyword === "propertyNames") {
      // jsonschema validates each property *name* against the subschema and
      // reports the name as the instance, with no instance path of its own.
      const name = String(param(error, "propertyName"));
      const validator = subValidator(subSchema(error));
      if (validator === null) continue;
      for (const inner of validator.errors(name)) {
        candidates.push({
          rank: schemaRank(error.schemaPath, rootSchema),
          error: inner,
        });
      }
      continue;
    }
    if (suppressed(error)) continue;

    // A boolean `false` subschema quotes the value it rejected but is
    // reported at the *parent* location: `descend` yields that error before
    // the caller prepends the property, so the instance path stops one short.
    if (error.keyword === "false schema") {
      const valuePath = instancePath(error, instance);
      candidates.push({
        rank: schemaRank(error.schemaPath, rootSchema),
        error: {
          path: valuePath.slice(0, -1),
          keyword: error.keyword,
          message: `False schema does not allow ${
            pyRepr(instanceAt(instance, valuePath))
          }`,
        },
      });
      continue;
    }

    const path = instancePath(error, instance);
    const instanceValue = instanceAt(instance, path);
    const parent = parentSchema(error);

    // Node-level "unexpected property" errors: one per property from ajv, one
    // naming all of them from jsonschema.
    if (isExtraPropertyKeyword(error)) {
      const key = `${error.keyword}|${error.instancePath}|${error.schemaPath}`;
      const group = collapsed.get(key);
      if (group === undefined) {
        collapsed.set(key, {
          rank: schemaRank(error.schemaPath, rootSchema),
          names: [extraPropertyName(error)],
          error,
        });
      } else {
        group.names.push(extraPropertyName(error));
      }
      continue;
    }

    candidates.push({
      rank: schemaRank(error.schemaPath, rootSchema),
      error: {
        path,
        keyword: error.keyword,
        message: renderMessage({
          error,
          instance: instanceValue,
          schema: subSchema(error),
          parentSchema: parent,
        }),
      },
    });
  }

  for (const group of collapsed.values()) {
    const names = pySortStrings(group.names.map((name) => String(name)));
    const body = names.map((name) => pyRepr(name)).join(", ");
    const message = group.error.keyword === "additionalProperties"
      ? additionalPropertiesGroupMessage(group.error, names, body)
      : `Unevaluated properties are not allowed (${extrasMessage(names)})`;
    candidates.push({
      rank: group.rank,
      error: {
        path: instancePath(group.error, instance),
        keyword: group.error.keyword,
        message,
      },
    });
  }

  return candidates
    .map((candidate, index) => ({ candidate, index }))
    .sort((a, b) =>
      compareRanks(a.candidate.rank, b.candidate.rank) || a.index - b.index
    )
    .map(({ candidate }) => candidate.error);
}

/** `additionalProperties`/`unevaluatedProperties` only collapse when `false`. */
function isExtraPropertyKeyword(error: ErrorObject): boolean {
  if (
    error.keyword !== "additionalProperties" &&
    error.keyword !== "unevaluatedProperties"
  ) {
    return false;
  }
  return subSchema(error) === false;
}

function extraPropertyName(error: ErrorObject): unknown {
  return error.keyword === "additionalProperties"
    ? param(error, "additionalProperty")
    : param(error, "unevaluatedProperty");
}

function additionalPropertiesGroupMessage(
  error: ErrorObject,
  names: readonly string[],
  body: string,
): string {
  const patterns = parentSchema(error)?.["patternProperties"];
  if (isRecord(patterns)) {
    const verb = names.length === 1 ? "does" : "do";
    return `${body} ${verb} not match any of the regexes: ${
      pySortStrings(Object.keys(patterns)).map((pattern) => pyRepr(pattern))
        .join(", ")
    }`;
  }
  return `Additional properties are not allowed (${extrasMessage(names)})`;
}

/** Compose one message from the template table, or fall back to ajv's own. */
function renderMessage(context: RenderContext): string {
  const renderer = RENDERERS[context.error.keyword];
  if (renderer !== undefined) {
    try {
      return renderer(context);
    } catch {
      // A template that cannot read its parameters must not take the audit
      // down; ajv's wording is the documented fallback.
    }
  }
  return context.error.message ?? "";
}

/**
 * Sort by instance path the way `sorted(..., key=lambda e: list(e.path))` does.
 *
 * A stable sort, which is the whole reason the pre-sort order matters: entries
 * at the same path keep the schema-key order {@link project} established.
 * Python compares a list element-wise and throws on mixed types, which
 * JavaScript would have to invent an error for; the paths here cannot mix types
 * at one position, because a container is either a dict or a list.
 */
export function sortByInstancePath(
  errors: readonly JsonSchemaError[],
): JsonSchemaError[] {
  return errors
    .map((error, index) => ({ error, index }))
    .sort((a, b) =>
      comparePaths(a.error.path, b.error.path) || a.index - b.index
    )
    .map(({ error }) => error);
}

function comparePaths(
  a: readonly (string | number)[],
  b: readonly (string | number)[],
): number {
  const shared = Math.min(a.length, b.length);
  for (let index = 0; index < shared; index++) {
    const left = a[index] as string | number;
    const right = b[index] as string | number;
    if (typeof left === "string" && typeof right === "string") {
      if (left !== right) return left < right ? -1 : 1;
      continue;
    }
    const leftNumber = Number(left);
    const rightNumber = Number(right);
    if (leftNumber !== rightNumber) return leftNumber - rightNumber;
  }
  return a.length - b.length;
}
