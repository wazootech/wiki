import { type PageLinkMatch, pageLinkMatches } from "../wiki_links.ts";
import { MARKDOWN_LINK_PARTS_REGEX, WIKILINK_FULL_REGEX } from "../document.ts";
import {
  parseMarkdownDestination,
  posixDirname,
  resolvePageRoute,
  splitTarget,
} from "../links.ts";
import type { BrokenLink } from "../schemas/domain.ts";

export function replaceTargetInMatch(
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
  const { before, after } = parseMarkdownDestination(match[2] ?? "");
  return `${match[1]}${before}${replacementTarget}${after}${match[3]}`;
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
  const { before, target: raw, after } = parseMarkdownDestination(
    parsed[2] ?? "",
  );
  const query = raw.includes("?") ? raw.slice(raw.indexOf("?")) : "";
  return `${parsed[1]}${before}${target}${query}${after}${parsed[3]}`;
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
