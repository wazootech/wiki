import { LinkIndex } from "../wiki_links.ts";
import type { Config } from "../config.ts";
import { iterDocumentFiles, routeForDocumentFile } from "../paths.ts";
import type { BrokenLink, BrokenLinkFix } from "../schemas/domain.ts";
import { headingIdsByRoute, suggestReplacement } from "./replacement.ts";

export function findBrokenLinkFixes(
  config: Config,
  fileFilter: ReadonlySet<string> | null = null,
): BrokenLinkFix[] {
  const existingRoutes = new Set(
    iterDocumentFiles(config).map((filePath) =>
      routeForDocumentFile(config, filePath)
    ),
  );
  const headingsByRoute = headingIdsByRoute(config);
  const issues = LinkIndex.fromConfig(config).brokenLinks(fileFilter);
  const fixes: BrokenLinkFix[] = [];
  for (const issue of issues) {
    if (
      issue.issue_kind !== "missing_document" &&
      issue.issue_kind !== "missing_heading"
    ) {
      continue;
    }
    if (
      issue.match_start === null || issue.match_end === null ||
      issue.full_match === null
    ) {
      continue;
    }
    if (issue.link_kind !== "WikiLink" && issue.link_kind !== "Markdown link") {
      continue;
    }
    const fix = suggestReplacement(
      config,
      issue,
      existingRoutes,
      headingsByRoute,
    );
    if (fix !== null) fixes.push(fix);
  }
  return fixes;
}

function issueKey(issue: BrokenLink): string {
  return [
    issue.source_path,
    issue.match_start,
    issue.match_end,
    issue.raw_target,
  ].join("\0");
}

export function remainingBrokenLinks(
  config: Config,
  fileFilter: ReadonlySet<string> | null = null,
  fixes: readonly BrokenLinkFix[] | null = null,
): BrokenLink[] {
  const issues = LinkIndex.fromConfig(config).brokenLinks(fileFilter);
  if (fixes === null || fixes.length === 0) return issues;
  const fixed = new Set(fixes.map((fix) => issueKey(fix.issue)));
  return issues.filter((issue) => !fixed.has(issueKey(issue)));
}
