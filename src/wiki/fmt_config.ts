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

export function validateFmtOptions(
  options: Record<string, unknown>,
  label: string,
): void {
  for (const key of Object.keys(options)) {
    if (!FMT_OPTION_KEYS.has(key)) {
      throw new InvalidFmtConfigError(
        `Invalid key '${key}' in ${label}. Keys must be one of ` +
          "{'textWrap', 'lineWidth', 'newLineKind'}.",
      );
    }
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
