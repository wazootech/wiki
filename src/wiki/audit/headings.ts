import { basename } from "@std/path";
import type { Config } from "../config.ts";
import { bodyCodeSpans, markdownBody, spanOverlaps } from "../document.ts";
import { parseHeadings } from "../headings.ts";
import { readTextTolerant, splitLines } from "../parser.ts";
import { iterMarkdownFiles, routeForDocumentFile } from "../paths.ts";
import { quoteString } from "../describe.ts";
import {
  lintDuplicateHeadingsWithEslint,
  lintHeadingLevelsWithEslint,
} from "../lint/eslint.ts";
import {
  isSetextTextLine,
  NUMBERED_HEADING_RE,
  SETEXT_H2_UNDERLINE_RE,
  THEMATIC_BREAK_RE,
  titleCaseWordsAfterFirst,
} from "./heading_words.ts";

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
      const stripped = line.trim();
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

export function lintDuplicateHeadings(
  config: Config,
  fileFilter: ReadonlySet<string> | null = null,
): Promise<string[]> {
  return lintDuplicateHeadingsWithEslint(config, fileFilter, "warning");
}

/** Lint heading depth increments (MD001-style outline rule). */
export function lintHeadingLevels(
  config: Config,
  fileFilter: ReadonlySet<string> | null = null,
): Promise<string[]> {
  return lintHeadingLevelsWithEslint(config, fileFilter, "warning");
}

/**
 * Lint editorial heading style: sentence case for H2+, and no numbering.
 *
 * ATX syntax is enforced by Wiki's dprint-backed `fmt` command.
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
      const text = heading.text.trim();
      if (NUMBERED_HEADING_RE.test(text)) {
        warnings.push(
          `In ${basename(filePath)}: Numbered heading ${level} ${
            quoteString(text)
          }; ` +
            "use unnumbered headings.",
        );
        continue;
      }
      if (heading.level > 1 && titleCaseWordsAfterFirst(text).length >= 2) {
        warnings.push(
          `In ${basename(filePath)}: H2+ heading ${level} ${
            quoteString(text)
          } looks like ` +
            "title case; use sentence case (capitalize only the first word and proper nouns).",
        );
      }
    }
  }
  return warnings;
}
