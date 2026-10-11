import { extname } from "@std/path";
import {
  LinkIndex,
  type PageLinkMatch,
  pageLinkMatches,
} from "./wiki_links.ts";
import type { Config } from "./config.ts";
import {
  MARKDOWN_LINK_PARTS_REGEX,
  splitFrontmatterText,
  WIKILINK_FULL_REGEX,
} from "./document.ts";

import {
  fragmentId,
  posixDirname,
  resolvePageRoute,
  splitTarget,
} from "./links.ts";
import { readTextTolerant } from "./parser.ts";
import { iterDocumentFiles, routeForDocumentFile } from "./paths.ts";
import { GitHubHeadingSlugger } from "./headings.ts";
import { getCloseMatches } from "./sequence_matcher.ts";
import type { BrokenLink, BrokenLinkFix } from "./schemas/domain.ts";

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
  const match = MARKDOWN_LINK_PARTS_REGEX.exec(fullMatch);
  if (match === null) return fullMatch;
  return `${match[1]}${replacementTarget}${match[3]}`;
}

/** `posixpath.relpath(to, fromDir)` for wiki routes (no `..` above the root). */
function posixRelative(fromDir: string, to: string): string {
  const from = fromDir === "" ? [] : fromDir.split("/");
  const target = to === "" ? [] : to.split("/");
  let shared = 0;
  while (
    shared < from.length && shared < target.length &&
    from[shared] === target[shared]
  ) {
    shared += 1;
  }
  const ups = from.slice(shared).map(() => "..");
  return [...ups, ...target.slice(shared)].join("/") || ".";
}

/** The page part of a link target with its extension, if it had one. */
function targetSuffix(pagePart: string): string {
  const name = pagePart.slice(pagePart.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot) : "";
}

/** Parentheses balanced one level deep, as a link destination allows. */
const BALANCED_PARENS = /^(?:[^()]|\([^()]*\))*$/;

/**
 * Percent-encode only what a markdown link destination cannot hold raw.
 *
 * Balanced parentheses stay raw (`./Jeff_Kazzee_(person).md`), the way such
 * pages are hand-linked; CommonMark and the scanner both accept them. A space
 * or an unbalanced parenthesis would end the destination early, so those are
 * encoded. Route safety rejects spaces in page paths, so in practice this is
 * the unbalanced-parenthesis case.
 */
function encodeMarkdownDestination(path: string): string {
  const spaced = path.replaceAll(" ", "%20");
  return BALANCED_PARENS.test(spaced)
    ? spaced
    : spaced.replaceAll("(", "%28").replaceAll(")", "%29");
}

/**
 * The target text for a link to `newRoute` written from `newSourceRoute`, in
 * the style of the target it replaces: same extension (or none), same `./`
 * prefix, same fragment, wikilink or markdown form.
 */
function restyledTarget(
  match: PageLinkMatch,
  newSourceRoute: string,
  newRoute: string,
): string {
  const [pagePart, fragment] = splitTarget(match.target);
  let path = posixRelative(posixDirname(newSourceRoute), newRoute);
  path += targetSuffix(pagePart);
  if (pagePart.startsWith("./") && !path.startsWith("../")) path = `./${path}`;
  if (match.kind === "Markdown link") path = encodeMarkdownDestination(path);
  return fragment === null ? path : `${path}#${fragment}`;
}

/** `full_match` with its target swapped, in the link's own syntax. */
function withTarget(match: PageLinkMatch, target: string): string {
  if (match.kind === "WikiLink") {
    const parsed = new RegExp(WIKILINK_FULL_REGEX.source).exec(match.fullMatch);
    if (parsed === null) return match.fullMatch;
    const display = parsed[2];
    return display === undefined ? `[[${target}]]` : `[[${target}|${display}]]`;
  }
  const parsed = MARKDOWN_LINK_PARTS_REGEX.exec(match.fullMatch);
  if (parsed === null) return match.fullMatch;
  // A query string the scanner dropped (`Page.md?x`) belongs to the link, not
  // the route, so it survives the rewrite.
  const raw = parsed[2] ?? "";
  const query = raw.includes("?") ? raw.slice(raw.indexOf("?")) : "";
  return `${parsed[1]}${target}${query}${parsed[3]}`;
}

/**
 * Point a page's links at moved pages: the pure core of `wiki mv`.
 *
 * `routeMap` maps old routes to new ones, exactly; nothing is guessed (unlike
 * {@link findBrokenLinkFixes}, which repairs links fuzzily). When the page
 * itself moves, pass its new route as `newSourceRoute` so relative links are
 * re-derived from its new directory. Same-page `#fragment` links and links the
 * move does not affect are left byte-for-byte alone. The links considered are
 * exactly the ones the backlink index counts ({@link pageLinkMatches}).
 */
export function rewriteLinkTargets(
  content: string,
  sourceRoute: string,
  routeMap: ReadonlyMap<string, string>,
  newSourceRoute: string = sourceRoute,
): string {
  const matches = pageLinkMatches(sourceRoute, content);
  let out = content;
  for (const match of [...matches].reverse()) {
    if (match.route === null) continue;
    const [pagePart] = splitTarget(match.target);
    if (pagePart === "") continue;
    const newRoute = routeMap.get(match.route) ?? match.route;
    if (resolvePageRoute(newSourceRoute, match.target) === newRoute) continue;
    const replacement = withTarget(
      match,
      restyledTarget(match, newSourceRoute, newRoute),
    );
    out = out.slice(0, match.start) + replacement + out.slice(match.end);
  }
  return out;
}

/**
 * Replace every link to one of `routes` with its plain text: the
 * `--prune-links` half of `wiki rm`. `[label](X.md)` becomes `label`,
 * `[[X|label]]` becomes `label`, and `[[X]]` becomes `X`.
 */
export function pruneLinksTo(
  content: string,
  sourceRoute: string,
  routes: ReadonlySet<string>,
): string {
  const matches = pageLinkMatches(sourceRoute, content);
  let out = content;
  for (const match of [...matches].reverse()) {
    if (match.route === null || !routes.has(match.route)) continue;
    let text: string;
    if (match.kind === "WikiLink") {
      const parsed = new RegExp(WIKILINK_FULL_REGEX.source).exec(
        match.fullMatch,
      );
      text = parsed?.[2] ?? splitTarget(match.target)[0];
    } else {
      text = /^!?\[([^\]]*)\]/.exec(match.fullMatch)?.[1] ?? "";
    }
    out = out.slice(0, match.start) + text + out.slice(match.end);
  }
  return out;
}

/** Metadata keys that hold a document's own identity, never a reference. */
const IDENTITY_KEY_LINE = /^\s*(?:-\s*)?["']?(?:@id|id)["']?\s*:/;

/**
 * Rewrite references to moved pages in metadata text: `wiki:` CURIEs (which
 * name a route) and, when given, full page IRIs.
 *
 * The edit is textual and token-exact, so the YAML or JSON around it keeps its
 * formatting: a reference matches only as a whole scalar (bounded by quotes,
 * whitespace, `,`, `[`, `]`, or line ends), with an optional `.md` and
 * `#fragment` carried over. Lines that set the document's own `@id`/`id` are
 * left alone: an explicit identity does not change when the file moves.
 */
export function rewriteMetadataRefs(
  text: string,
  refs: ReadonlyArray<{ readonly from: string; readonly to: string }>,
): string {
  if (refs.length === 0) return text;
  const escape = (value: string) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.split(/(?<=\n)/).map((line) => {
    if (IDENTITY_KEY_LINE.test(line)) return line;
    let out = line;
    for (const { from, to } of refs) {
      const pattern = new RegExp(
        `(?<=^|[\\s"'\\[,])${
          escape(from)
        }(?=(?:\\.md)?(?:#[^\\s"',\\]]*)?(?:$|[\\s"',\\]]))`,
        "g",
      );
      out = out.replace(pattern, to);
    }
    return out;
  }).join("");
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
