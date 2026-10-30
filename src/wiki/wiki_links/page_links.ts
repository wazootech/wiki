import {
  bodyCodeSpans,
  MARKDOWN_LINK_FULL_REGEX,
  spanOverlaps,
  splitFrontmatterText,
  WIKILINK_FULL_REGEX,
} from "../document.ts";
import {
  isExternalLink,
  markdownLinkIsPage,
  parseMarkdownDestination,
  resolvePageRoute,
  unquote,
} from "../links.ts";

/** Python's `str(exception)`, which is what reaches a `read_error` message. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    // ValueError and friends carry their message as `name: message`; Python's
    // `str` prints only the message.
    return error.message;
  }
  return String(error);
}

/**
 * The page routes one document links to, in first-link order.
 *
 * The same scan {@link LinkIndex.fromConfig} inverts into backlinks, run for a
 * single page, so `wiki refs` reports outbound links by exactly the rules that
 * decide inbound ones. Unresolvable targets are dropped, as they are there.
 */
export function outboundPageRoutes(
  sourceRoute: string,
  content: string,
): string[] {
  const targets = new Map<string, string[]>();
  indexPageLinks(sourceRoute, content, targets);
  return [...targets.keys()];
}

/** One page link in a document body, as the backlink index counts it. */
export interface PageLinkMatch {
  readonly kind: "WikiLink" | "Markdown link";
  /** Offsets into the whole document text, frontmatter included. */
  readonly start: number;
  readonly end: number;
  readonly fullMatch: string;
  /** The target as the index reads it: trimmed (wikilink) or unquoted (markdown). */
  readonly target: string;
  /** The route the target resolves to from the source page, or `null`. */
  readonly route: string | null;
}

/**
 * Every page link in a document body, in document order.
 *
 * This is the one definition of "a link" that the backlink index, `wiki refs`,
 * and the `mv`/`rm` rewrites share, so a move rewrites exactly the links the
 * index (and `lint`) count. Links inside inline or fenced code are code, not
 * links, so none of them count (wiki#362).
 */
export function pageLinkMatches(
  sourceRoute: string,
  content: string,
): PageLinkMatch[] {
  const split = splitFrontmatterText(content);
  const body = split.body;
  const offset = split.prefix.length;
  const protectedSpans = bodyCodeSpans(body);
  const matches: PageLinkMatch[] = [];

  for (const match of body.matchAll(WIKILINK_FULL_REGEX)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (spanOverlaps(start, end, protectedSpans)) continue;
    const target = (match[1] as string).trim();
    matches.push({
      kind: "WikiLink",
      start: offset + start,
      end: offset + end,
      fullMatch: match[0],
      target,
      route: resolvePageRoute(sourceRoute, target),
    });
  }

  for (const match of body.matchAll(MARKDOWN_LINK_FULL_REGEX)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (spanOverlaps(start, end, protectedSpans)) continue;
    const target = unquote(
      parseMarkdownDestination(match[2] as string).target.split(
        "?",
      )[0] as string,
    );
    if (isExternalLink(target) || !markdownLinkIsPage(target)) continue;
    matches.push({
      kind: "Markdown link",
      start: offset + start,
      end: offset + end,
      fullMatch: match[0],
      target,
      route: resolvePageRoute(sourceRoute, target),
    });
  }

  return matches.sort((left, right) => left.start - right.start);
}

/**
 * Record the outbound page links of one document in the backlink index.
 *
 * Python passes `config` and `file_path` here and reads neither; the port
 * drops both, as it does for `_page_target_issue`'s `label`.
 */
export function indexPageLinks(
  sourceRoute: string,
  content: string,
  backlinks: Map<string, string[]>,
): void {
  // Wikilinks first, then markdown links: the order the backlink lists have
  // always been built in, which `refs` output and the oracle tests rely on.
  const matches = pageLinkMatches(sourceRoute, content);
  const ordered = [
    ...matches.filter((match) => match.kind === "WikiLink"),
    ...matches.filter((match) => match.kind === "Markdown link"),
  ];
  for (const { route } of ordered) {
    if (route === null) continue;
    const list = backlinks.get(route) ?? [];
    if (!list.includes(sourceRoute)) list.push(sourceRoute);
    backlinks.set(route, list);
  }
}
