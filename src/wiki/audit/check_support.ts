import { resolve } from "@std/path";
import { ValueError } from "../errors.ts";
import type { Config } from "../config.ts";
import {
  LAYOUT_FRONTMATTER_KEY,
  layoutFileIsValid,
  resolveLayoutPath,
} from "../layout.ts";
import { splitDocumentBody } from "../parser.ts";
import { iterMarkdownFiles, routeForDocumentFile } from "../paths.ts";
import { quoteString } from "../describe.ts";
import {
  AuditReport,
  type Issue,
  type IssueDetail,
  severityIssues,
} from "../schemas/reports.ts";
import type { CheckConfig, LintConfig } from "../schemas/rules.ts";

/**
 * Route one rule's findings into a report at the severity its config gives it.
 *
 * The three cases are the whole point of the function: `off` drops the findings
 * (and, for a rule that can skip its own collection, the caller never asks), a
 * warning is appended without touching `ok`, and an error flips `ok` to false —
 * but only when there *are* findings, so an error rule that reports nothing
 * leaves a passing report passing.
 *
 * The severity lookup is dynamic on purpose: the rule key doubles as the config
 * key, so an unknown key falls back to `warning` exactly as Python's
 * `getattr(rules, rule_key, "warning")` does.
 */
export function applyIssues(
  report: AuditReport,
  ruleKey: string,
  issues: readonly (string | IssueDetail)[],
  rules: CheckConfig | LintConfig,
): AuditReport {
  const severity = (rules as unknown as Record<string, unknown>)[ruleKey];
  if (severity === "off") return report;
  if (severity === "error") {
    if (issues.length === 0) return report;
    return new AuditReport({
      ok: false,
      errors: [...report.errors, ...severityIssues(ruleKey, issues, "error")],
      warnings: report.warnings,
    });
  }
  if (issues.length === 0) return report;
  return new AuditReport({
    ok: report.ok,
    errors: report.errors,
    warnings: [
      ...report.warnings,
      ...severityIssues(ruleKey, issues, "warning"),
    ],
  });
}

/** A document's route, or `null` when it has no safe one. */
export function safeRoute(config: Config, filePath: string): string | null {
  try {
    return routeForDocumentFile(config, filePath);
  } catch (error) {
    if (error instanceof ValueError) return null;
    throw error;
  }
}

/** Append errors, flipping the report to not-ok. */
export function addErrors(
  report: AuditReport,
  issues: readonly Issue[],
): AuditReport {
  if (issues.length === 0) return report;
  return new AuditReport({
    ok: false,
    errors: [...report.errors, ...issues],
    warnings: report.warnings,
  });
}

/** Check that `wazoo:layout` paths resolve to readable `.html` files. */
export function checkLayoutFrontmatter(
  config: Config,
  fileFilter: ReadonlySet<string> | null = null,
): string[] {
  const missing: string[] = [];
  const configRoot = resolve(config.config_root);

  for (const filePath of iterMarkdownFiles(config)) {
    let route: string;
    try {
      route = routeForDocumentFile(config, filePath);
    } catch (error) {
      // An unsafe route is `route_safety`'s finding, not this rule's; the check
      // pass reports it and this one stays quiet about the same file.
      if (error instanceof ValueError) continue;
      throw error;
    }
    if (fileFilter !== null && !fileFilter.has(route)) continue;
    const [fmData] = splitDocumentBody(filePath);
    if (fmData === null) continue;

    const rawLayout = fmData[LAYOUT_FRONTMATTER_KEY];
    if (typeof rawLayout !== "string" || rawLayout.trim() === "") continue;
    const layoutPath = resolveLayoutPath(rawLayout, configRoot);
    if (!layoutFileIsValid(layoutPath, configRoot)) {
      missing.push(
        `In ${route}: ${LAYOUT_FRONTMATTER_KEY} ${
          quoteString(rawLayout)
        } must resolve ` +
          "to a readable .html file under the wiki config root.",
      );
    }
  }

  return missing;
}

/**
 * Options for {@link runCheck}, mirroring `_run_check`'s keyword-only arguments.
 *
 * `filePaths` switches the pass to scoped mode: per-document SHACL and schema
 * checks over exactly those files, with no whole-wiki SHACL pass at all. That is
 * what `build --only` and the file watcher use, because validating one edited
 * page must not depend on the shape of every other page.
 */
export interface RunCheckOptions {
  readonly fileFilter?: ReadonlySet<string> | null;
  readonly filePaths?: readonly string[] | null;
}
