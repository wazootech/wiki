/**
 * Wiki-wide link graph: broken-link detection and backlink indexing.
 *
 * Port of `src/wiki/wiki_links.py`. One pass over the documents produces two
 * things at once, because they need the same parse and would otherwise disagree
 * about what a link is:
 *
 * - **broken links** — a wikilink, markdown link, `wiki:` CURIE, or frontmatter
 *   image reference that does not resolve to a document, heading, or asset;
 * - **backlinks** — the inverse index the renderer uses to print "linked from".
 *
 * The three rules worth knowing before reading:
 *
 * - **Protected spans are skipped.** A `[[Beta]]` inside inline code or a fence
 *   is an example of a link, not a link; `protected_inline_code_spans` marks
 *   those ranges and every scan consults it.
 * - **Page targets and asset targets are different questions.** A markdown link
 *   is a page link or an asset link depending on its extension
 *   (`markdown_link_is_page`), and the two have different failure vocabularies
 *   (`missing_document`/`missing_heading` versus `missing_asset`).
 * - **A fragment is checked against the target page's heading slugs**, which is
 *   why the index stores heading ids for every route up front.
 *
 * `_page_target_issue` takes a `label` argument in Python and never reads it;
 * the port drops the parameter rather than pretending the call site chooses
 * anything with it. The label reaches the message through
 * `_page_target_message`, which is a separate call for exactly that reason.
 */

import type { Config } from "./config.ts";
import { assetReferenceIssue, auditAssets } from "./assets.ts";
import {
  MARKDOWN_LINK_FULL_REGEX,
  protectedInlineCodeSpans,
  spanOverlaps,
  splitFrontmatterText,
  WIKILINK_FULL_REGEX,
} from "./document.ts";
import { headingIds } from "./headings.ts";
import {
  fragmentId,
  isExternalLink,
  markdownLinkIsPage,
  pyUnquote,
  resolvePageRoute,
  splitTarget,
} from "./links.ts";
import {
  type DataRecord,
  documentDataFromPath,
  readTextTolerant,
} from "./parser.ts";
import { iterDocumentFiles, routeForDocumentFile } from "./paths.ts";
import type { BrokenLink } from "./schemas/domain.ts";

/** A `wiki:` CURIE as it appears in metadata. */
const WIKI_CURIE_RE = /^wiki:[^\s]+$/;

/** Metadata keys whose values are identifiers or vocabulary, not wiki links. */
const METADATA_SKIP_KEYS: ReadonlySet<string> = new Set([
  "@context",
  "@id",
  "id",
  "@type",
  "type",
]);

/** A `BrokenLink` with the match-span fields left unset. */
function linkIssue(
  fields:
    & Omit<
      BrokenLink,
      "match_start" | "match_end" | "full_match"
    >
    & Partial<Pick<BrokenLink, "match_start" | "match_end" | "full_match">>,
): BrokenLink {
  return {
    match_start: null,
    match_end: null,
    full_match: null,
    ...fields,
  };
}

/** Link graph of a wiki: routes, broken links, and backlinks. */
export class LinkIndex {
  readonly #config: Config;
  readonly #existingRoutes: ReadonlySet<string>;
  readonly #headingIdsByRoute: ReadonlyMap<string, ReadonlySet<string>>;
  readonly #backlinksByRoute: ReadonlyMap<string, readonly string[]>;

  constructor(
    config: Config,
    options: {
      readonly existingRoutes: ReadonlySet<string>;
      readonly headingIdsByRoute: ReadonlyMap<string, ReadonlySet<string>>;
      readonly backlinksByRoute: ReadonlyMap<string, readonly string[]>;
    },
  ) {
    this.#config = config;
    this.#existingRoutes = options.existingRoutes;
    this.#headingIdsByRoute = options.headingIdsByRoute;
    this.#backlinksByRoute = options.backlinksByRoute;
  }

  /**
   * Build the index for a wiki.
   *
   * Every document route is known before any link is resolved, which is what
   * makes "broken" decidable in one pass: a link may point forward to a page
   * that sorts later.
   */
  static fromConfig(config: Config): LinkIndex {
    const existingRoutes = new Set<string>();
    const headingIdsByRoute = new Map<string, Set<string>>();
    const backlinks = new Map<string, string[]>();

    for (const filePath of iterDocumentFiles(config)) {
      const route = routeForDocumentFile(config, filePath);
      existingRoutes.add(route);
      if (filePath.suffix.toLowerCase() === ".md") {
        const content = readTextTolerant(filePath);
        headingIdsByRoute.set(route, headingIds(content));
        indexPageLinks(route, content, backlinks);
      } else {
        headingIdsByRoute.set(route, new Set());
      }
    }

    return new LinkIndex(config, {
      existingRoutes,
      headingIdsByRoute,
      backlinksByRoute: backlinks,
    });
  }

  /** The routes that link to `route`, in document order. */
  backlinksTo(route: string): string[] {
    return [...(this.#backlinksByRoute.get(route) ?? [])];
  }

  /**
   * Every broken link in the wiki, or in the filtered routes.
   *
   * A file that cannot be read becomes a `read_error` issue rather than an
   * exception: a link audit that stops at the first unreadable page reports
   * nothing about the pages after it.
   */
  brokenLinks(fileFilter: ReadonlySet<string> | null = null): BrokenLink[] {
    const issues: BrokenLink[] = [];

    for (const filePath of iterDocumentFiles(this.#config)) {
      const fileSlug = routeForDocumentFile(this.#config, filePath);
      if (fileFilter !== null && !fileFilter.has(fileSlug)) continue;
      try {
        const data = documentDataFromPath(filePath);

        if (filePath.suffix.toLowerCase() === ".md") {
          const content = readTextTolerant(filePath);
          const split = splitFrontmatterText(content);
          const body = split.body;
          const bodyOffset = split.prefix.length;
          const protectedSpans = protectedInlineCodeSpans(body);

          for (const match of body.matchAll(WIKILINK_FULL_REGEX)) {
            const start = match.index ?? 0;
            const end = start + match[0].length;
            if (spanOverlaps(start, end, protectedSpans)) continue;
            const linkTarget = (match[1] as string).trim();
            const issue = pageTargetIssue(
              this.#existingRoutes,
              this.#headingIdsByRoute,
              fileSlug,
              linkTarget,
            );
            if (issue !== null) {
              issues.push(
                linkIssue({
                  source_route: fileSlug,
                  source_path: filePath,
                  link_kind: "WikiLink",
                  raw_target: linkTarget,
                  issue_kind: issue,
                  message: pageTargetMessage(
                    fileSlug,
                    linkTarget,
                    "WikiLink",
                    issue,
                  ),
                  match_start: bodyOffset + start,
                  match_end: bodyOffset + end,
                  full_match: match[0],
                }),
              );
            }
          }

          for (const match of body.matchAll(MARKDOWN_LINK_FULL_REGEX)) {
            const start = match.index ?? 0;
            const end = start + match[0].length;
            if (spanOverlaps(start, end, protectedSpans)) continue;
            const target = pyUnquote(
              (match[2] as string).split("?")[0] as string,
            );
            if (isExternalLink(target)) continue;
            if (markdownLinkIsPage(target)) {
              const issue = pageTargetIssue(
                this.#existingRoutes,
                this.#headingIdsByRoute,
                fileSlug,
                target,
              );
              if (issue !== null) {
                issues.push(
                  linkIssue({
                    source_route: fileSlug,
                    source_path: filePath,
                    link_kind: "Markdown link",
                    raw_target: target,
                    issue_kind: issue,
                    message: pageTargetMessage(
                      fileSlug,
                      target,
                      "Markdown link",
                      issue,
                    ),
                    match_start: bodyOffset + start,
                    match_end: bodyOffset + end,
                    full_match: match[0],
                  }),
                );
              }
            } else {
              const assetIssue = assetReferenceIssue(
                this.#config,
                filePath,
                target,
              );
              if (assetIssue !== null) {
                issues.push(
                  linkIssue({
                    source_route: fileSlug,
                    source_path: filePath,
                    link_kind: "Asset link",
                    raw_target: target,
                    issue_kind: "missing_asset",
                    message:
                      `In ${filePath.name}: Broken asset link [${target}] ${assetIssue}.`,
                    match_start: bodyOffset + start,
                    match_end: bodyOffset + end,
                    full_match: match[0],
                  }),
                );
              }
            }
          }
        }

        for (const curie of wikiCuriesInMetadata(data ?? {})) {
          const route = wikiRouteFromCurie(curie);
          if (route === null) continue;
          if (this.#existingRoutes.has(route)) continue;
          issues.push(
            linkIssue({
              source_route: fileSlug,
              source_path: filePath,
              link_kind: "Metadata reference",
              raw_target: curie,
              issue_kind: "missing_document",
              message:
                `In ${fileSlug}: Broken Metadata reference [${curie}] points to non-existent wiki document.`,
            }),
          );
        }

        for (const target of frontmatterAssetTargets(data ?? {})) {
          const assetIssue = assetReferenceIssue(
            this.#config,
            filePath,
            target,
          );
          if (assetIssue !== null) {
            issues.push(
              linkIssue({
                source_route: fileSlug,
                source_path: filePath,
                link_kind: "Frontmatter asset",
                raw_target: target,
                issue_kind: "missing_asset",
                message:
                  `In ${filePath.name}: Broken frontmatter asset [${target}] ${assetIssue}.`,
              }),
            );
          }
        }
      } catch (error) {
        issues.push(
          linkIssue({
            source_route: fileSlug,
            source_path: filePath,
            link_kind: "Read error",
            raw_target: "",
            issue_kind: "read_error",
            message: `Failed to read ${filePath.name} for link audit: ${
              errorMessage(error)
            }`,
          }),
        );
      }
    }

    for (const warning of auditAssets(this.#config)) {
      issues.push(
        linkIssue({
          source_route: "",
          source_path: this.#config.config_root,
          link_kind: "Asset directory",
          raw_target: "",
          issue_kind: "missing_asset",
          message: warning,
        }),
      );
    }

    return issues;
  }
}

/** Python's `str(exception)`, which is what reaches a `read_error` message. */
function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    // ValueError and friends carry their message as `name: message`; Python's
    // `str` prints only the message.
    return error.message;
  }
  return String(error);
}

/**
 * Record the outbound page links of one document in the backlink index.
 *
 * Python passes `config` and `file_path` here and reads neither; the port
 * drops both, as it does for `_page_target_issue`'s `label`.
 */
function indexPageLinks(
  sourceRoute: string,
  content: string,
  backlinks: Map<string, string[]>,
): void {
  const split = splitFrontmatterText(content);
  const body = split.body;
  const protectedSpans = protectedInlineCodeSpans(body);

  const record = (target: string): void => {
    const route = resolvePageRoute(sourceRoute, target);
    if (route === null) return;
    const list = backlinks.get(route) ?? [];
    if (!list.includes(sourceRoute)) list.push(sourceRoute);
    backlinks.set(route, list);
  };

  for (const match of body.matchAll(WIKILINK_FULL_REGEX)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (spanOverlaps(start, end, protectedSpans)) continue;
    record((match[1] as string).trim());
  }

  for (const match of body.matchAll(MARKDOWN_LINK_FULL_REGEX)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (spanOverlaps(start, end, protectedSpans)) continue;
    const rawTarget = pyUnquote((match[2] as string).split("?")[0] as string);
    if (isExternalLink(rawTarget) || !markdownLinkIsPage(rawTarget)) continue;
    record(rawTarget);
  }
}

/**
 * Why a page link does not resolve, or `null` when it does.
 *
 * A fragment-only target (`#Section`) resolves against the *current* route,
 * which is why `page_part === ""` is special-cased rather than passed to
 * `resolve_page_route`.
 */
function pageTargetIssue(
  existingFiles: ReadonlySet<string>,
  headingIdsByRoute: ReadonlyMap<string, ReadonlySet<string>>,
  currentRoute: string,
  target: string,
): string | null {
  const [pagePart, fragment] = splitTarget(target);
  const route = pagePart === ""
    ? currentRoute
    : resolvePageRoute(currentRoute, target);
  if (route === null || !existingFiles.has(route)) return "missing_document";
  if (fragment) {
    const targetFragment = fragmentId(fragment);
    const ids = headingIdsByRoute.get(route) ?? new Set<string>();
    if (!ids.has(targetFragment)) return "missing_heading";
  }
  return null;
}

/** The user-facing message for a page-target failure. */
function pageTargetMessage(
  currentRoute: string,
  target: string,
  label: string,
  issueKind: string,
): string {
  if (issueKind === "missing_document") {
    return `In ${currentRoute}: Broken ${label} [${target}] points to non-existent document.`;
  }
  const [, fragment] = splitTarget(target);
  const targetFragment = fragmentId(fragment);
  return `In ${currentRoute}: Broken ${label} [${target}] points to missing heading '#${targetFragment}'.`;
}

/** The route a `wiki:` CURIE names, or `null` when it is not one. */
function wikiRouteFromCurie(curie: string): string | null {
  if (!WIKI_CURIE_RE.test(curie)) return null;
  // `split(":", 1)[1]`, not `split(":")[1]`: everything after the *first*
  // colon is the local name, so a CURIE with a second colon keeps it.
  let local = curie.slice(curie.indexOf(":") + 1);
  local = local.split("#", 1)[0] as string;
  if (local.endsWith(".md")) local = local.slice(0, -3);
  return local;
}

/** Every `wiki:` CURIE in a document's metadata, excluding identifier keys. */
function wikiCuriesInMetadata(data: DataRecord): string[] {
  const curies: string[] = [];

  const walk = (value: unknown): void => {
    if (typeof value === "string") {
      if (WIKI_CURIE_RE.test(value)) curies.push(value);
    } else if (Array.isArray(value)) {
      for (const item of value) walk(item);
    } else if (typeof value === "object" && value !== null) {
      for (const [key, item] of Object.entries(value)) {
        if (METADATA_SKIP_KEYS.has(key)) continue;
        walk(item);
      }
    }
  };

  for (const [key, value] of Object.entries(data)) {
    if (METADATA_SKIP_KEYS.has(key)) continue;
    walk(value);
  }
  return curies;
}

/**
 * Frontmatter values that name an image asset.
 *
 * The key rule is deliberately loose — `image`, `thumbnail`, `logo`, or any key
 * ending in `image` — because frontmatter vocabularies differ, and a schema
 * tells the author which one they are using, not this function.
 */
function frontmatterAssetTargets(data: DataRecord): string[] {
  const targets: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    const normalized = String(key).toLowerCase();
    if (
      normalized !== "image" && normalized !== "thumbnail" &&
      normalized !== "logo" && !normalized.endsWith("image")
    ) {
      continue;
    }
    if (typeof value === "string" && !isExternalLink(value)) {
      targets.push(value);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string" && !isExternalLink(item)) {
          targets.push(item);
        }
      }
    }
  }
  return targets;
}
