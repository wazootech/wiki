import type { Severity } from "../../schemas/rules.ts";

export function eslintSeverity(severity: Severity): "error" | "off" | "warn" {
  if (severity === "error") return "error";
  if (severity === "warning") return "warn";
  return "off";
}

export interface MarkdownLintSeverities {
  readonly heading_levels: Severity;
  readonly duplicate_headings: Severity;
}

export interface MarkdownLintIssues {
  readonly heading_levels: string[];
  readonly duplicate_headings: string[];
}
