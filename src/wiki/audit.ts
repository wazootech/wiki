/**
 * The audit pass: SHACL conformance, integrity checks, and the lint rules.
 *
 * Port of `src/wiki/audit.py`. The Python module holds five different jobs
 * behind one name, and the port keeps that shape because the split is the
 * migration's, not the reader's:
 *
 * - **SHACL** lives in `shacl.ts`. `audit.py` calls `pyshacl` inline and CONTEXT.md
 *   swaps the library for `rdf-validate-shacl`, so the four functions that had
 *   to change (`load_shapes`, `check_shacl_file`, `check_shacl_all`, and the
 *   report text) are one module rather than scattered through this one.
 * - **What `check` and `lint` do with the findings** is here: the rule table,
 *   the severity routing, and the two orderings — which is the part that decides
 *   what a user sees and in what order.
 *
 * Two things are worth knowing before reading the rule functions:
 *
 * - **Severity is per rule, and `off` is not the same as `warning`.** A rule set
 *   to `off` is skipped before its findings are even collected where that is
 *   possible, and a rule set to `error` flips `report.ok`. `_apply_issues` is
 *   the single place that decision is made, so the port routes every rule
 *   through {@link applyIssues} rather than hand-rolling the three cases.
 * - **The rule key is the issue code.** `_apply_issues(report, "broken_links",
 *   ...)` and `LintConfig.broken_links` are the same name as
 *   `Issue(code="broken_links")`, and `test_audit_reports.py` asserts that a
 *   user can map a reported code back to the config key that controls it. The
 *   port preserves the coupling by taking the key as an argument instead of
 *   typing it at each call site.
 *
 * Deliberately not ported: `_format_setext_warning` and its
 * `SETEXT_H1_UNDERLINE_RE`, which nothing calls. `lint_headings` stopped
 * emitting Setext warnings when `wiki fmt` took over converting them, and the
 * helper was left behind. The port drops unreachable private code rather than
 * preserving it for a diff, and this note is the record of that choice;
 * `_is_setext_text_line` stays because `lint_thematic_breaks` does use it.
 */

import type { Config } from "./config.ts";
import { headingPlainText } from "./headings.ts";
import { validateRouteSafety } from "./paths.ts";
import { AuditReport, severityIssues } from "./schemas/reports.ts";
import { lintMarkdownWithEslint } from "./lint/eslint.ts";
import { lintHeadings, lintThematicBreaks } from "./audit/headings.ts";
import {
  lintBrokenLinks,
  lintFilenames,
  lintLinkStyle,
  lintRedundantFrontmatter,
} from "./audit/link_lint.ts";
import { addErrors, applyIssues } from "./audit/check_support.ts";

/** A markdown link anywhere in a heading, image links included. */
export { headingPlainText };
export { titleCaseWordsAfterFirst } from "./audit/heading_words.ts";
export {
  lintDuplicateHeadings,
  lintHeadingLevels,
  lintHeadings,
  lintThematicBreaks,
} from "./audit/headings.ts";
export {
  collectBrokenLinks,
  formatBrokenLink,
  lintBrokenLinks,
  lintFilenames,
  lintLinkStyle,
  lintRedundantFrontmatter,
} from "./audit/link_lint.ts";
export {
  applyIssues,
  checkLayoutFrontmatter,
  type RunCheckOptions,
} from "./audit/check_support.ts";
export { runCheck } from "./audit/run_check.ts";

/**
 * Run the lint rules: broken links, filename pattern, and heading style.
 *
 * Route safety comes first and *returns*: an unsafe route means the link index
 * may be resolving against a route that will not exist, so every lint below
 * would be reporting on a corpus that is about to change shape.
 *
 * The rule order here is the order findings appear in the report, and it is
 * deliberate — links before style, filename before headings — because that is
 * the order a user fixes them in.
 */
export async function runLint(
  config: Config,
  fileFilter: ReadonlySet<string> | null = null,
): Promise<AuditReport> {
  let report = AuditReport.empty();

  const safetyIssues = validateRouteSafety(config);
  if (safetyIssues.length > 0) {
    return addErrors(
      report,
      severityIssues("route_safety", safetyIssues, "error"),
    );
  }

  report = applyIssues(
    report,
    "broken_links",
    lintBrokenLinks(config, fileFilter),
    config.lint,
  );
  report = applyIssues(
    report,
    "filename_pattern",
    lintFilenames(config, fileFilter),
    config.lint,
  );
  report = applyIssues(
    report,
    "headings",
    lintHeadings(config, fileFilter),
    config.lint,
  );
  const markdownLint = await lintMarkdownWithEslint(config, fileFilter, {
    heading_levels: config.lint.heading_levels,
    duplicate_headings: config.lint.duplicate_headings,
  });
  report = applyIssues(
    report,
    "heading_levels",
    markdownLint.heading_levels,
    config.lint,
  );
  report = applyIssues(
    report,
    "duplicate_headings",
    markdownLint.duplicate_headings,
    config.lint,
  );
  report = applyIssues(
    report,
    "thematic_breaks",
    lintThematicBreaks(config, fileFilter),
    config.lint,
  );
  report = applyIssues(
    report,
    "link_style",
    lintLinkStyle(config, fileFilter),
    config.lint,
  );
  // Skipped outright when off: it costs a `git log` per page.
  if (config.lint.redundant_frontmatter !== "off") {
    report = applyIssues(
      report,
      "redundant_frontmatter",
      await lintRedundantFrontmatter(config, fileFilter),
      config.lint,
    );
  }

  return report;
}

/** Combine the check and lint passes into the one report `audit` returns. */
export function mergeResults(
  first: AuditReport,
  second: AuditReport,
): AuditReport {
  return first.merge(second);
}
