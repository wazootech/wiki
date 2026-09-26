/**
 * Check and lint rule configuration.
 *
 * Port of `src/wiki/schemas/rules.py`. Both blocks are flat maps of rule name
 * to severity, and the severity coercion is the interesting part: YAML lets a
 * user write `false`, `"false"`, `true`, or `"true"` in a rule slot, and the
 * Python original accepts all four as shorthands for `off` and `error`.
 */

import { ValueError } from "../errors.ts";
import { pyRepr } from "../pyrepr.ts";
import { type ModelSpec, validateModel } from "./model.ts";
import type { ValidationIssue } from "./validation.ts";

/** The three states a rule can be in. */
export type Severity = "error" | "warning" | "off";

/**
 * Coerce a rule value to a severity.
 *
 * Boolean shorthands come first because Python compares with `is False` before
 * the membership test — `1` is *not* accepted as `error`, even though
 * `1 == True`.
 */
export function coerceSeverity(value: unknown): Severity {
  if (value === false || value === "false") return "off";
  if (value === true || value === "true") return "error";
  if (value === "error" || value === "warning" || value === "off") return value;
  throw new ValueError(`expected error, warning, or off, got ${pyRepr(value)}`);
}

/** The `check:` block: document-schema enforcement during build. */
export interface CheckConfig {
  readonly missing_layout_file: Severity;
  readonly frontmatter_schema: Severity;
  readonly missing_schema_ref: Severity;
  readonly remote_schema_refs: "allow" | "deny" | "allowlist";
  readonly remote_schema_hosts: readonly string[];
}

/** The `lint:` block: advisory checks over the wiki corpus. */
export interface LintConfig {
  readonly broken_links: Severity;
  readonly filename_pattern: Severity;
  readonly headings: Severity;
  readonly heading_levels: Severity;
  readonly duplicate_headings: Severity;
  readonly thematic_breaks: Severity;
  readonly link_style: Severity;
}

/** Coerce a `remote_schema_refs` value, defaulting an absent one to `allow`. */
function coerceRemoteSchemaRefs(value: unknown): string {
  if (value === null || value === undefined) return "allow";
  if (typeof value !== "string") {
    throw new ValueError(
      `expected allow, deny, or allowlist, got ${pyRepr(value)}`,
    );
  }
  const normalized = value.trim().toLowerCase();
  if (
    normalized !== "allow" && normalized !== "deny" &&
    normalized !== "allowlist"
  ) {
    throw new ValueError(
      `expected allow, deny, or allowlist, got ${pyRepr(value)}`,
    );
  }
  return normalized;
}

/**
 * Coerce `remote_schema_hosts`.
 *
 * A bare string is one host rather than a per-character list, and a blank entry
 * is rejected instead of silently matching nothing.
 */
function coerceRemoteSchemaHosts(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value === "string") {
    const text = value.trim();
    return text === "" ? [] : [text];
  }
  if (Array.isArray(value)) {
    const hosts: string[] = [];
    for (const item of value) {
      if (typeof item !== "string") {
        throw new ValueError("remote_schema_hosts items must be strings");
      }
      const text = item.trim();
      if (text === "") {
        throw new ValueError(
          "remote_schema_hosts items must be non-empty strings",
        );
      }
      hosts.push(text);
    }
    return hosts;
  }
  throw new ValueError(
    `expected remote_schema_hosts string or list, got ${pyRepr(value)}`,
  );
}

export const checkConfigSpec: ModelSpec = {
  label: "CheckConfig",
  forbidExtra: true,
  fields: [
    ["missing_layout_file", { defaultValue: "error", before: coerceSeverity }],
    ["frontmatter_schema", { defaultValue: "error", before: coerceSeverity }],
    ["missing_schema_ref", { defaultValue: "error", before: coerceSeverity }],
    ["remote_schema_refs", {
      defaultValue: "allow",
      before: coerceRemoteSchemaRefs,
    }],
    ["remote_schema_hosts", {
      factory: () => [],
      before: coerceRemoteSchemaHosts,
    }],
  ],
};

export const lintConfigSpec: ModelSpec = {
  label: "LintConfig",
  forbidExtra: true,
  fields: [
    ["broken_links", { defaultValue: "warning", before: coerceSeverity }],
    ["filename_pattern", { defaultValue: "warning", before: coerceSeverity }],
    ["headings", { defaultValue: "off", before: coerceSeverity }],
    ["heading_levels", { defaultValue: "off", before: coerceSeverity }],
    ["duplicate_headings", { defaultValue: "off", before: coerceSeverity }],
    ["thematic_breaks", { defaultValue: "off", before: coerceSeverity }],
    ["link_style", { defaultValue: "warning", before: coerceSeverity }],
  ],
};

/** The default `check:` block, as `DEFAULT_CHECK_CONFIG`. */
export function defaultCheckConfig(): CheckConfig {
  return coerceCheckConfig({});
}

/** The default `lint:` block, as `DEFAULT_LINT_CONFIG`. */
export function defaultLintConfig(): LintConfig {
  return coerceLintConfig({});
}

/** Validate a `check:` block from raw config input. */
export function coerceCheckConfig(
  raw: unknown,
  loc: readonly (string | number)[] = [],
  issues: ValidationIssue[] = [],
): CheckConfig {
  return validateModel(
    checkConfigSpec,
    raw,
    loc,
    issues,
  ) as unknown as CheckConfig;
}

/** Validate a `lint:` block from raw config input. */
export function coerceLintConfig(
  raw: unknown,
  loc: readonly (string | number)[] = [],
  issues: ValidationIssue[] = [],
): LintConfig {
  return validateModel(
    lintConfigSpec,
    raw,
    loc,
    issues,
  ) as unknown as LintConfig;
}
