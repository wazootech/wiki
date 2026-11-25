import { extname } from "@std/path";
import type { Config } from "../config.ts";
import { splitFrontmatterText } from "../document.ts";
import { fragmentId, resolvePageRoute, splitTarget } from "../links.ts";
import { readTextTolerant } from "../parser.ts";
import { iterDocumentFiles, routeForDocumentFile } from "../paths.ts";
import { GitHubHeadingSlugger } from "../headings.ts";
import { getCloseMatches } from "../sequence_matcher.ts";
import type { BrokenLink, BrokenLinkFix } from "../schemas/domain.ts";

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

export function headingIdsByRoute(config: Config): Map<string, Set<string>> {
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

export function suggestReplacement(
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
