/**
 * The audit pass: SHACL conformance, integrity checks, and the lint rules.
 *
 * Port of `src/wiki/audit.py`. The Python module holds five different jobs
 * behind one name, and the port keeps that shape because the split is the
 * migration's, not the reader's:
 *
 * - **SHACL** lives in `shacl.ts`. `audit.py` calls `pyshacl` inline and the ADR
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

import { basename, join, resolve } from "@std/path";
import { ValueError } from "./errors.ts";
import { buildAssetManifest } from "./assets.ts";
import type { Config } from "./config.ts";
import {
  bodyCodeSpans,
  markdownBody,
  spanOverlaps,
  splitFrontmatterText,
  WIKILINK_FULL_REGEX,
} from "./document.ts";

import { checkFrontmatterSchema } from "./frontmatter_schema.ts";
import { parseHeadings } from "./headings.ts";
import {
  LAYOUT_FRONTMATTER_KEY,
  layoutFileIsValid,
  resolveLayoutPath,
} from "./layout.ts";
import {
  pyStrip,
  readTextTolerant,
  splitDocumentBody,
  splitLines,
} from "./parser.ts";
import {
  buildPageManifest,
  detectOutputCollisions,
  iterDocumentFiles,
  iterMarkdownFiles,
  routeForDocumentFile,
  validateFilenamePattern,
  validateRouteSafety,
} from "./paths.ts";
import { pyReprString } from "./pyrepr.ts";
import {
  pyCasefold,
  pyIsDigit,
  pyIsLower,
  pyIsUpper,
  pySplitWhitespace,
  pyStripChars,
} from "./pystr.ts";
import type { BrokenLink } from "./schemas/domain.ts";
import { AuditReport, type Issue, severityIssues } from "./schemas/reports.ts";
import type { CheckConfig, LintConfig } from "./schemas/rules.ts";
import { checkShaclAll, checkShaclFile } from "./shacl.ts";
import { LinkIndex } from "./wiki_links.ts";

/** The message text of a broken-link issue, which is all `lint` prints. */
export function formatBrokenLink(issue: BrokenLink): string {
  return issue.message;
}

/**
 * Lint filenames against the optional `wiki.filename_pattern`.
 *
 * `fileFilter` holds *routes*, not paths, because that is what a scoped run
 * (`--only`) selects on, and a route is what a user typed.
 */
export function lintFilenames(
  config: Config,
  fileFilter: ReadonlySet<string> | null = null,
): string[] {
  const warnings: string[] = [];
  for (const filePath of iterDocumentFiles(config)) {
    const route = routeForDocumentFile(config, filePath);
    if (fileFilter !== null && !fileFilter.has(route)) continue;
    const issue = validateFilenamePattern(config, filePath);
    if (issue !== null) warnings.push(issue);
  }
  return warnings;
}

/** Every broken link in the wiki, as structured issues. */
export function collectBrokenLinks(
  config: Config,
  fileFilter: ReadonlySet<string> | null = null,
): BrokenLink[] {
  return LinkIndex.fromConfig(config).brokenLinks(fileFilter);
}

/** Every broken link in the wiki, as the strings `lint` reports. */
export function lintBrokenLinks(
  config: Config,
  fileFilter: ReadonlySet<string> | null = null,
): string[] {
  return collectBrokenLinks(config, fileFilter).map(formatBrokenLink);
}

/** An ATX heading line, as `re.MULTILINE` sees one. */
const HEADING_LINE_RE = /^(#{1,6})\s+(.+?)\s*$/m;

/** A heading whose text begins with an ordinal — `1. First step`. */
const NUMBERED_HEADING_RE = /^\d+[.)]\s+/;

/** A thematic break: three or more `-`, `*`, or `_` alone on a line. */
const THEMATIC_BREAK_RE = /^(-{3,}|\*{3,}|_{3,})\s*$/m;

/** The `---` underline that turns the line above it into a Setext H2. */
const SETEXT_H2_UNDERLINE_RE = /^-{3,}\s*$/;

/** A markdown link anywhere in a heading, image links included. */
const MARKDOWN_LINK_IN_HEADING_RE = /!?\[[^\]]*\]\([^)]*\)/g;

/** The prose a heading is asking to be judged on, with its links removed. */
export function headingPlainText(text: string): string {
  const plain = text.replace(MARKDOWN_LINK_IN_HEADING_RE, "");
  return pyStripChars(pySplitWhitespace(plain).join(" "), " ,;:");
}

/** A word stripped of the sentence punctuation a heading attaches to it. */
function normalizeHeadingWord(word: string): string {
  return pyStripChars(word, ".,;:!?");
}

/**
 * Whether a heading word is a name this lint should leave alone.
 *
 * The three cases are `isupper` (an acronym: `CLI`), anything with a digit or a
 * hyphen (`H2`, `kebab-case`), and an internal capital (`GitHub`). A word that
 * is merely capitalized is *not* a proper noun here — which is what makes
 * `## Agent Memory Filesystems` a title-case warning while `## Deploying to
 * GitHub Pages` is not.
 */
function isProperNounToken(word: string): boolean {
  const token = normalizeHeadingWord(word);
  if (token === "") return true;
  // Code points, not UTF-16 units: `token[0]` on an astral character is half a
  // surrogate pair, and `isupper` on half a character is not a question with an
  // answer.
  const chars = [...token];
  if (pyIsUpper(token) && chars.length > 1) return true;
  if (chars.some((char) => pyIsDigit(char)) || token.includes("-")) {
    return true;
  }
  const [first, ...rest] = chars;
  return pyIsUpper(first as string) &&
    chars.some((char) => pyIsLower(char)) &&
    rest.some((char) => pyIsUpper(char));
}

/** A line that can be the text row of a Setext heading: not ATX, not a rule. */
function isSetextTextLine(line: string): boolean {
  const stripped = pyStrip(line);
  if (stripped === "") return false;
  if (HEADING_LINE_RE.test(line)) return false;
  if (THEMATIC_BREAK_RE.test(stripped)) return false;
  return true;
}

/**
 * The words after the first that make a heading read as title case.
 *
 * `title case` is diagnosed by *counting*, not by a dictionary: two or more
 * capitalized words past the first, each longer than three characters and not a
 * proper noun, is the signal. The threshold is why `## Related Standards Guide`
 * is flagged and `## Deploying to GitHub Pages` is not.
 */
export function titleCaseWordsAfterFirst(text: string): string[] {
  const words = pySplitWhitespace(headingPlainText(text))
    .map(normalizeHeadingWord)
    .filter((word) => word !== "");
  if (words.length < 2) return [];
  return words.slice(1).filter((word) => {
    const chars = [...word];
    return chars.length > 2 &&
      pyIsUpper(chars[0] as string) &&
      chars.some((char) => pyIsLower(char)) &&
      !isProperNounToken(word);
  });
}

/**
 * Lint horizontal rules in markdown body text.
 *
 * A `---` after a text line *is* a Setext H2 underline, not a thematic break,
 * so the same characters are read two ways depending on the previous line. Both
 * readings are skipped inside code, and the check is on the *line* spans
 * `bodyCodeSpans` returned rather than on the current line alone — a fence
 * opener and its content are all protected.
 */
export function lintThematicBreaks(
  config: Config,
  fileFilter: ReadonlySet<string> | null = null,
): string[] {
  const warnings: string[] = [];
  for (const filePath of iterMarkdownFiles(config)) {
    const route = routeForDocumentFile(config, filePath);
    if (fileFilter !== null && !fileFilter.has(route)) continue;
    const body = markdownBody(readTextTolerant(filePath));
    const protectedSpans = bodyCodeSpans(body);
    const lines = splitLines(body);
    let offset = 0;
    let previousLine: string | null = null;
    let previousLineStart = 0;
    let previousLineEnd = 0;
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index] as string;
      const lineNo = index + 1;
      const lineStart = offset;
      const lineEnd = offset + line.length;
      const stripped = pyStrip(line);
      const inCode = spanOverlaps(lineStart, lineEnd, protectedSpans);
      const previousInCode = previousLine !== null &&
        spanOverlaps(previousLineStart, previousLineEnd, protectedSpans);
      let isSetext = false;
      if (
        previousLine !== null &&
        isSetextTextLine(previousLine) &&
        !inCode &&
        !previousInCode
      ) {
        if (SETEXT_H2_UNDERLINE_RE.test(stripped)) isSetext = true;
      }
      if (!isSetext && THEMATIC_BREAK_RE.test(stripped) && !inCode) {
        warnings.push(
          `In ${
            basename(filePath)
          }:${lineNo}: Thematic break '${stripped}' in body; ` +
            "use headings instead of horizontal rules.",
        );
      }
      previousLine = line;
      previousLineStart = lineStart;
      previousLineEnd = lineEnd;
      // `+ 1` for the separator `splitlines` removed. On a `\r\n` file this
      // drifts by one per line, which is the Python behaviour and therefore
      // part of the contract — the alternative is line numbers that disagree
      // with the oracle.
      offset = lineEnd + 1;
    }
  }
  return warnings;
}

/**
 * The comparison key for duplicate headings.
 *
 * Inline code is unwrapped before folding, so ``## `Foo` `` and `## Foo` are
 * the same heading — the renderer would give them the same anchor.
 */
function normalizeHeadingForDuplicate(text: string): string {
  const plain = headingPlainText(text).replace(/`([^`\n]+)`/g, "$1");
  return pySplitWhitespace(pyCasefold(pyStrip(plain))).join(" ");
}

/** Lint duplicate H2+ heading text in one document (markdownlint MD024). */
export function lintDuplicateHeadings(
  config: Config,
  fileFilter: ReadonlySet<string> | null = null,
): string[] {
  const warnings: string[] = [];
  for (const filePath of iterMarkdownFiles(config)) {
    const route = routeForDocumentFile(config, filePath);
    if (fileFilter !== null && !fileFilter.has(route)) continue;
    const body = markdownBody(readTextTolerant(filePath));
    const seen = new Map<string, number>();
    for (const heading of parseHeadings(body)) {
      if (heading.level <= 1) continue;
      const key = normalizeHeadingForDuplicate(heading.text);
      if (key === "") continue;
      const first = seen.get(key);
      if (first !== undefined) {
        warnings.push(
          `In ${
            basename(filePath)
          }:${heading.line_no}: Duplicate heading h${heading.level} ` +
            `${pyReprString(heading.text)} (first at line ${first}).`,
        );
      } else {
        seen.set(key, heading.line_no);
      }
    }
  }
  return warnings;
}

/** Lint heading depth increments (markdownlint MD001). */
export function lintHeadingLevels(
  config: Config,
  fileFilter: ReadonlySet<string> | null = null,
): string[] {
  const warnings: string[] = [];
  for (const filePath of iterMarkdownFiles(config)) {
    const route = routeForDocumentFile(config, filePath);
    if (fileFilter !== null && !fileFilter.has(route)) continue;
    const body = markdownBody(readTextTolerant(filePath));
    let previousLevel = 0;
    for (const heading of parseHeadings(body)) {
      const level = heading.level;
      if (previousLevel > 0 && level > previousLevel + 1) {
        warnings.push(
          `In ${
            basename(filePath)
          }:${heading.line_no}: Heading h${level} skips level ` +
            `h${previousLevel + 1}; increase depth by one at a time.`,
        );
      }
      previousLevel = level;
    }
  }
  return warnings;
}

/**
 * Lint editorial heading style: sentence case for H2+, and no numbering.
 *
 * ATX syntax is enforced by `wiki fmt` (mdformat) rather than reported here, so
 * a Setext heading is not an error — it is simply not a heading this lint reads
 * a warning out of.
 */
export function lintHeadings(
  config: Config,
  fileFilter: ReadonlySet<string> | null = null,
): string[] {
  const warnings: string[] = [];
  for (const filePath of iterMarkdownFiles(config)) {
    const route = routeForDocumentFile(config, filePath);
    if (fileFilter !== null && !fileFilter.has(route)) continue;
    const body = markdownBody(readTextTolerant(filePath));
    for (const heading of parseHeadings(body)) {
      const level = "#".repeat(heading.level);
      const text = pyStrip(heading.text);
      if (NUMBERED_HEADING_RE.test(text)) {
        warnings.push(
          `In ${basename(filePath)}: Numbered heading ${level} ${
            pyReprString(text)
          }; ` +
            "use unnumbered headings.",
        );
        continue;
      }
      if (heading.level > 1 && titleCaseWordsAfterFirst(text).length >= 2) {
        warnings.push(
          `In ${basename(filePath)}: H2+ heading ${level} ${
            pyReprString(text)
          } looks like ` +
            "title case; use sentence case (capitalize only the first word and proper nouns).",
        );
      }
    }
  }
  return warnings;
}

/** The 1-based line an offset into a document falls on. */
function lineNumberForOffset(content: string, offset: number): number {
  return content.slice(0, offset).split("\n").length;
}

/** Flag wikilinks in body prose when `link.style` is `standard`. */
export function lintLinkStyle(
  config: Config,
  fileFilter: ReadonlySet<string> | null = null,
): string[] {
  if (config.link.style !== "standard") return [];
  const warnings: string[] = [];
  for (const filePath of iterMarkdownFiles(config)) {
    const route = routeForDocumentFile(config, filePath);
    if (fileFilter !== null && !fileFilter.has(route)) continue;
    const content = readTextTolerant(filePath);
    const split = splitFrontmatterText(content);
    const bodyOffset = split.prefix.length;
    const protectedSpans = bodyCodeSpans(split.body);
    for (const match of split.body.matchAll(WIKILINK_FULL_REGEX)) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      if (spanOverlaps(start, end, protectedSpans)) continue;
      const lineNo = lineNumberForOffset(content, bodyOffset + start);
      warnings.push(
        `In ${basename(filePath)}:${lineNo}: Wikilink ${
          pyReprString(match[0])
        }; ` +
          "use standard links ([display](Page.md)) per link.style.",
      );
    }
  }
  return warnings;
}

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
  issues: readonly string[],
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

/** Append errors, flipping the report to not-ok. */
function addErrors(report: AuditReport, issues: readonly Issue[]): AuditReport {
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
    if (typeof rawLayout !== "string" || pyStrip(rawLayout) === "") continue;
    const layoutPath = resolveLayoutPath(rawLayout, configRoot);
    if (!layoutFileIsValid(layoutPath, configRoot)) {
      missing.push(
        `In ${route}: ${LAYOUT_FRONTMATTER_KEY} ${
          pyReprString(rawLayout)
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

/**
 * Run the integrity checks: SHACL, route safety, output collisions, layout,
 * and JSON Schema frontmatter.
 *
 * The order of the appended errors is the order the CLI prints them, so it is
 * part of the contract: SHACL first (a violation can make every later finding
 * noise), then route safety, which *replaces* the collision check rather than
 * joining it — an unsafe route makes the manifest meaningless, so the collision
 * pass is skipped instead of reporting confusion on top of it.
 */
export async function runCheck(
  config: Config,
  options: RunCheckOptions = {},
): Promise<AuditReport> {
  const fileFilter = options.fileFilter ?? null;
  const filePaths = options.filePaths ?? null;
  let report = AuditReport.empty();

  if (filePaths !== null) {
    for (const filePath of filePaths) {
      const result = await checkShaclFile(filePath, config);
      if (result === null) {
        report = addErrors(report, [{
          code: "missing_metadata",
          message: `No valid document metadata found in ${basename(filePath)}`,
          path: filePath,
          severity: "error",
        }]);
      } else if (!result.conforms) {
        report = addErrors(report, [{
          code: "shacl_violation",
          message: `SHACL Validation Violation in ${
            basename(filePath)
          }:\n${result.resultsText}`,
          path: filePath,
          severity: "error",
        }]);
      }
    }

    const [missingSchemaIssues, schemaValidationIssues] =
      await checkFrontmatterSchema(config, null, { filePaths });
    report = applyIssues(
      report,
      "missing_schema_ref",
      missingSchemaIssues,
      config.check,
    );
    report = applyIssues(
      report,
      "frontmatter_schema",
      schemaValidationIssues,
      config.check,
    );
    return report;
  }

  try {
    const shacl = await checkShaclAll(config);
    if (!shacl.conforms) {
      report = addErrors(report, [{
        code: "shacl_violation",
        message: `SHACL Validation Violation:\n${shacl.resultsText}`,
        severity: "error",
      }]);
    }
  } catch (error) {
    // A crash in the validator is a finding, not an exception: `check` has
    // other things to report and a traceback would lose them.
    report = addErrors(report, [{
      code: "shacl_system_error",
      message: `SHACL validation system error: ${errorText(error)}`,
      severity: "error",
    }]);
  }

  const safetyIssues = validateRouteSafety(config);
  if (safetyIssues.length > 0) {
    report = addErrors(
      report,
      severityIssues("route_safety", safetyIssues, "error"),
    );
  } else {
    const baseUrl = config.site.base_url;
    const ownedOutputDir = baseUrl === ""
      ? "_site"
      : join("_site", baseUrl.replace(/^\/+|\/+$/g, ""));
    const collisionIssues = detectOutputCollisions([
      ...buildPageManifest(
        config,
        ownedOutputDir,
        baseUrl,
        config.site.url_style,
      ),
      ...buildAssetManifest(config, ownedOutputDir, baseUrl),
    ]);
    if (collisionIssues.length > 0) {
      report = addErrors(
        report,
        severityIssues("output_collision", collisionIssues, "error"),
      );
    }
  }

  const layoutIssues = checkLayoutFrontmatter(config, fileFilter);
  report = applyIssues(
    report,
    "missing_layout_file",
    layoutIssues,
    config.check,
  );

  const [missingSchemaIssues, schemaValidationIssues] =
    await checkFrontmatterSchema(config, fileFilter);
  report = applyIssues(
    report,
    "missing_schema_ref",
    missingSchemaIssues,
    config.check,
  );
  report = applyIssues(
    report,
    "frontmatter_schema",
    schemaValidationIssues,
    config.check,
  );

  return report;
}

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
export function runLint(
  config: Config,
  fileFilter: ReadonlySet<string> | null = null,
): AuditReport {
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
  report = applyIssues(
    report,
    "heading_levels",
    lintHeadingLevels(config, fileFilter),
    config.lint,
  );
  report = applyIssues(
    report,
    "duplicate_headings",
    lintDuplicateHeadings(config, fileFilter),
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

  return report;
}

/** Combine the check and lint passes into the one report `audit` returns. */
export function mergeResults(
  first: AuditReport,
  second: AuditReport,
): AuditReport {
  return first.merge(second);
}

/**
 * Python's `str(exception)` for the SHACL error message.
 *
 * A `WikiError` stringifies to its message in both languages, but JavaScript's
 * `String(new Error("boom"))` is `"Error: boom"` where Python's is `"boom"` —
 * and a `shacl_system_error` message is compared against the oracle.
 */
function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
