/**
 * mdformat's inline-configuration validation, ported from `mdformat/_conf.py`.
 *
 * The engine does not use mdformat, but its *option surface* is user-visible:
 * `wiki.yml` can carry an inline `fmt:` mapping, and a typo in it must be
 * reported the way mdformat reports it, because that message is what users have
 * been reading. Only the validation is ported; the formatting decisions
 * themselves belong to `formatter.ts` (see the ADR).
 *
 * **One known divergence.** `mdformat._conf._validate_keys` renders the
 * permitted keys with `set(DEFAULT_OPTS)`, whose iteration order is Python's
 * string-hash order — so the oracle prints a different key order on each run
 * (confirmed over three processes: three orders). This port prints them in
 * declaration order, which is deterministic and readable. The parity harness
 * cannot byte-compare this one message; that is recorded as a known difference
 * rather than papered over.
 */

import { pyReprString } from "./pyrepr.ts";

/** The option keys mdformat accepts, with their defaults, in declaration order. */
export const DEFAULT_OPTS: Readonly<Record<string, unknown>> = {
  wrap: "keep",
  number: false,
  end_of_line: "lf",
  validate: true,
  exclude: [],
  plugin: {},
  extensions: null,
  codeformatters: null,
};

/** Raised where mdformat raises `InvalidConfError`. */
export class InvalidConfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidConfError";
  }
}

/** Reject an option key mdformat does not know. */
export function validateKeys(
  options: Record<string, unknown>,
  confLabel: string,
): void {
  for (const key of Object.keys(options)) {
    if (!Object.hasOwn(DEFAULT_OPTS, key)) {
      const permitted = Object.keys(DEFAULT_OPTS).map((name) => `'${name}'`)
        .join(", ");
      throw new InvalidConfError(
        `Invalid key ${pyReprString(key)} in ${confLabel}.` +
          ` Keys must be one of {${permitted}}.`,
      );
    }
  }
}

/** Reject an option value mdformat would not accept. */
export function validateValues(
  options: Record<string, unknown>,
  confLabel: string,
): void {
  const invalid = (key: string) =>
    new InvalidConfError(`Invalid '${key}' value in ${confLabel}`);

  if (Object.hasOwn(options, "wrap")) {
    const value = options["wrap"];
    const ok =
      (typeof value === "number" && Number.isInteger(value) && value > 1) ||
      value === "keep" || value === "no";
    if (!ok) throw invalid("wrap");
  }
  if (Object.hasOwn(options, "end_of_line")) {
    const value = options["end_of_line"];
    if (value !== "crlf" && value !== "lf" && value !== "keep") {
      throw invalid("end_of_line");
    }
  }
  if (Object.hasOwn(options, "validate")) {
    if (typeof options["validate"] !== "boolean") throw invalid("validate");
  }
  if (Object.hasOwn(options, "number")) {
    if (typeof options["number"] !== "boolean") throw invalid("number");
  }
  if (Object.hasOwn(options, "exclude")) {
    const value = options["exclude"];
    if (!Array.isArray(value)) throw invalid("exclude");
    for (const pattern of value) {
      if (typeof pattern !== "string") throw invalid("exclude");
    }
  }
  if (Object.hasOwn(options, "plugin")) {
    const value = options["plugin"];
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw invalid("plugin");
    }
    for (const pluginConf of Object.values(value as Record<string, unknown>)) {
      if (
        typeof pluginConf !== "object" || pluginConf === null ||
        Array.isArray(pluginConf)
      ) {
        throw invalid("plugin");
      }
    }
  }
  if (Object.hasOwn(options, "extensions")) {
    const value = options["extensions"];
    if (!Array.isArray(value)) throw invalid("extensions");
    for (const extension of value) {
      if (typeof extension !== "string") throw invalid("extensions");
    }
  }
  if (Object.hasOwn(options, "codeformatters")) {
    const value = options["codeformatters"];
    if (!Array.isArray(value)) throw invalid("codeformatters");
    for (const lang of value) {
      if (typeof lang !== "string") throw invalid("codeformatters");
    }
  }
}
