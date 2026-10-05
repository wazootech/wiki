export type TextWrap = "always" | "maintain" | "never";
export type NewLineKind = "auto" | "crlf" | "lf";

export interface FmtOptions {
  readonly textWrap?: TextWrap;
  readonly lineWidth?: number;
  readonly newLineKind?: NewLineKind;
}

export const DEFAULT_LINE_WIDTH = 80;

export const DEFAULT_FMT_OPTIONS: Readonly<Required<FmtOptions>> = {
  textWrap: "never",
  lineWidth: DEFAULT_LINE_WIDTH,
  newLineKind: "lf",
};

const FMT_OPTION_KEYS = new Set(["textWrap", "lineWidth", "newLineKind"]);
const TEXT_WRAP_VALUES = new Set(["always", "maintain", "never"]);
const NEW_LINE_KIND_VALUES = new Set(["auto", "crlf", "lf"]);

export class InvalidFmtConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidFmtConfigError";
  }
}

/**
 * Validate inline `fmt:` options.
 *
 * Unknown keys are collected before throwing rather than rejected one at a
 * time. A vault carrying both `wrap` and `end_of_line` is the common case, and
 * reporting only the first key makes the user edit, re-run, and discover the
 * second -- turning a two-line migration into three round trips.
 */
export function validateFmtOptions(
  options: Record<string, unknown>,
  label: string,
): void {
  const unknown = Object.keys(options).filter((key) =>
    !FMT_OPTION_KEYS.has(key)
  );
  if (unknown.length > 0) {
    const listed = unknown.map((key) => `'${key}'`);
    const named = listed.length === 1
      ? listed[0]!
      : `${listed.slice(0, -1).join(", ")} and ${listed[listed.length - 1]}`;
    // The accepted surface is named and every unknown key is listed at once.
    // A per-key rename table is deliberately absent: AGENTS.md forbids rename
    // hints, and the CHANGELOG's Migration section documents the key moves.
    throw new InvalidFmtConfigError(
      `Invalid key ${named} in ${label}. Keys must be one of ` +
        "{'textWrap', 'lineWidth', 'newLineKind'}.",
    );
  }

  if (
    options["textWrap"] !== undefined &&
    (typeof options["textWrap"] !== "string" ||
      !TEXT_WRAP_VALUES.has(options["textWrap"]))
  ) {
    throw new InvalidFmtConfigError(
      `Invalid 'textWrap' value in ${label}; expected always, maintain, or never.`,
    );
  }

  if (
    options["lineWidth"] !== undefined &&
    (typeof options["lineWidth"] !== "number" ||
      !Number.isInteger(options["lineWidth"]) || options["lineWidth"] < 1)
  ) {
    throw new InvalidFmtConfigError(
      `Invalid 'lineWidth' value in ${label}; expected a positive integer.`,
    );
  }

  if (
    options["newLineKind"] !== undefined &&
    (typeof options["newLineKind"] !== "string" ||
      !NEW_LINE_KIND_VALUES.has(options["newLineKind"]))
  ) {
    throw new InvalidFmtConfigError(
      `Invalid 'newLineKind' value in ${label}; expected auto, crlf, or lf.`,
    );
  }
}
