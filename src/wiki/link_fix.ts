import { extname } from "@std/path";
import { LinkIndex } from "./wiki_links.ts";
import type { Config } from "./config.ts";
import { splitFrontmatterText, WIKILINK_FULL_REGEX } from "./document.ts";

import { fragmentId, resolvePageRoute, splitTarget } from "./links.ts";
import { readTextTolerant } from "./parser.ts";
import { iterDocumentFiles, routeForDocumentFile } from "./paths.ts";
import { GitHubHeadingSlugger } from "./headings.ts";
import { getCloseMatches } from "./sequence_matcher.ts";
import type { BrokenLink, BrokenLinkFix } from "./schemas/domain.ts";

const MARKDOWN_LINK_FULL_RE = /^(!?\[[^\]]*\]\()([^)]+)(\))$/;
const FUZZY_ROUTE_CUTOFF = 0.86;

function compareCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0)!);
  const rightPoints = Array.from(
    right,
    (character) => character.codePointAt(0)!,
  );
  const sharedLength = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const difference = leftPoints[index]! - rightPoints[index]!;
    if (difference !== 0) return difference;
  }
  return leftPoints.length - rightPoints.length;
}

function headingIdsByRoute(config: Config): Map<string, Set<string>> {
  const byRoute = new Map<string, Set<string>>();
  for (const filePath of iterDocumentFiles(config)) {
    const route = routeForDocumentFile(config, filePath);
    const ids = new Set<string>();
    if (extname(filePath).toLowerCase() === ".md") {
      const body = splitFrontmatterText(readTextTolerant(filePath)).body;
      const slugger = new GitHubHeadingSlugger();
      for (const match of body.matchAll(/^(#{1,6})\s+(.+)$/gm)) {
        ids.add(slugger.slug((match[2] ?? "").trim()));
      }
    }
    byRoute.set(route, ids);
  }
  return byRoute;
}

function replacementRoute(
  config: Config,
  sourceRoute: string,
  pagePart: string,
  existingRoutes: ReadonlySet<string>,
): string | null {
  if (pagePart.length === 0) return null;
  const renamed = config.link.renames?.[pagePart];
  if (renamed !== undefined && existingRoutes.has(renamed)) return renamed;
  const resolved = resolvePageRoute(sourceRoute, pagePart);
  if (resolved !== null && existingRoutes.has(resolved)) return resolved;
  const normalized = pagePart.replaceAll(" ", "_");
  if (existingRoutes.has(normalized)) return normalized;
  const matches = getCloseMatches(
    pagePart,
    [...existingRoutes].sort(compareCodePoints),
    2,
    FUZZY_ROUTE_CUTOFF,
  );
  return matches.length === 1 ? matches[0]! : null;
}

function replacementHeading(
  fragment: string,
  headingIds: ReadonlySet<string>,
): string | null {
  const targetFragment = fragmentId(fragment);
  if (headingIds.has(targetFragment)) return fragment;
  const matches = getCloseMatches(
    targetFragment,
    [...headingIds].sort(compareCodePoints),
    2,
    FUZZY_ROUTE_CUTOFF,
  );
  return matches.length === 1 ? matches[0]! : null;
}

function suggestReplacement(
  config: Config,
  issue: BrokenLink,
  existingRoutes: ReadonlySet<string>,
  headingsByRoute: ReadonlyMap<string, ReadonlySet<string>>,
): BrokenLinkFix | null {
  const target = issue.raw_target;
  const [pagePart, fragment] = splitTarget(target);
  if (issue.issue_kind === "missing_document") {
    const replacementPage = replacementRoute(
      config,
      issue.source_route,
      pagePart,
      existingRoutes,
    );
    if (replacementPage === null) return null;
    const replacementTarget = fragment
      ? `${replacementPage}#${fragment}`
      : replacementPage;
    return {
      issue,
      replacement_target: replacementTarget,
      description: `${target} -> ${replacementTarget}`,
    };
  }

  const route = resolvePageRoute(issue.source_route, target);
  if (route === null || !existingRoutes.has(route) || !fragment) return null;
  const replacementFragment = replacementHeading(
    fragment,
    headingsByRoute.get(route) ?? new Set(),
  );
  if (replacementFragment === null) return null;
  const replacementTarget = pagePart
    ? `${pagePart}#${replacementFragment}`
    : `#${replacementFragment}`;
  return {
    issue,
    replacement_target: replacementTarget,
    description: `${target} -> ${replacementTarget}`,
  };
}

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

function replaceTargetInMatch(
  issue: BrokenLink,
  replacementTarget: string,
): string {
  const fullMatch = issue.full_match ?? "";
  if (issue.link_kind === "WikiLink") {
    const match = new RegExp(WIKILINK_FULL_REGEX.source).exec(fullMatch);
    if (match === null) return fullMatch;
    const display = match[2];
    return display === undefined
      ? `[[${replacementTarget}]]`
      : `[[${replacementTarget}|${display}]]`;
  }
  const match = MARKDOWN_LINK_FULL_RE.exec(fullMatch);
  if (match === null) return fullMatch;
  return `${match[1]}${replacementTarget}${match[3]}`;
}

export function applyBrokenLinkFixes(
  fixes: readonly BrokenLinkFix[],
  dryRun = false,
): string[] {
  const byPath = new Map<string, { path: string; fixes: BrokenLinkFix[] }>();
  for (const fix of fixes) {
    const key = fix.issue.source_path;
    const entry = byPath.get(key) ?? { path: fix.issue.source_path, fixes: [] };
    entry.fixes.push(fix);
    byPath.set(key, entry);
  }

  const changed: string[] = [];
  for (const { path, fixes: pathFixes } of byPath.values()) {
    let content = readTextTolerant(path);
    pathFixes.sort((left, right) =>
      (right.issue.match_start ?? 0) - (left.issue.match_start ?? 0)
    );
    for (const fix of pathFixes) {
      const { match_start: start, match_end: end, full_match: fullMatch } =
        fix.issue;
      if (start === null || end === null || fullMatch === null) continue;
      if (content.slice(start, end) !== fullMatch) continue;
      const replacement = replaceTargetInMatch(
        fix.issue,
        fix.replacement_target,
      );
      content = content.slice(0, start) + replacement + content.slice(end);
    }
    if (!dryRun) Deno.writeTextFileSync(path, content);
    changed.push(path);
  }
  return changed;
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
