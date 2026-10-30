import { basename } from "@std/path";
import type { Config } from "../config.ts";
import {
  bodyCodeSpans,
  spanOverlaps,
  splitFrontmatterText,
  WIKILINK_FULL_REGEX,
} from "../document.ts";
import { findRedundantFrontmatter } from "../fix.ts";
import { readTextTolerant } from "../parser.ts";
import {
  iterDocumentFiles,
  iterMarkdownFiles,
  routeForDocumentFile,
  validateFilenamePattern,
} from "../paths.ts";
import { quoteString } from "../describe.ts";
import type { BrokenLink } from "../schemas/domain.ts";
import type { IssueDetail } from "../schemas/reports.ts";
import { LinkIndex } from "../wiki_links.ts";

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
          quoteString(match[0])
        }; ` +
          "use standard links ([display](Page.md)) per link.style.",
      );
    }
  }
  return warnings;
}

/**
 * Frontmatter entries that repeat the value the graph derives (wiki#319).
 *
 * Only an exact repeat is reported; a differing value is an intentional
 * override. `wiki fix` removes what this reports.
 */
export async function lintRedundantFrontmatter(
  config: Config,
  fileFilter: ReadonlySet<string> | null = null,
): Promise<IssueDetail[]> {
  const paths = iterMarkdownFiles(config).filter((filePath) =>
    fileFilter === null ||
    fileFilter.has(routeForDocumentFile(config, filePath))
  );
  const issues: IssueDetail[] = [];
  for (const document of await findRedundantFrontmatter(config, paths)) {
    for (const field of document.fields) {
      issues.push({
        message: `In ${basename(document.path)}: frontmatter '${field.key}' ` +
          `repeats the derived schema:${field.property} ` +
          `(${JSON.stringify(field.value)}); remove it with \`wiki fix\`.`,
        path: document.path,
        route: document.route,
      });
    }
  }
  return issues;
}
