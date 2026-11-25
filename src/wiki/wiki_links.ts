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
 *   is an example of a link, not a link; `bodyCodeSpans` marks those ranges
 *   and every scan consults it (wiki#362; the oracle protected inline code
 *   only).
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

import { basename, extname } from "@std/path";
import type { Config } from "./config.ts";
import { assetReferenceIssue, auditAssets } from "./assets.ts";
import {
  bodyCodeSpans,
  MARKDOWN_LINK_FULL_REGEX,
  spanOverlaps,
  splitFrontmatterText,
  WIKILINK_FULL_REGEX,
} from "./document.ts";
import { headingIds } from "./headings.ts";
import {
  isExternalLink,
  markdownLinkIsPage,
  parseMarkdownDestination,
  routeFromSiteUrl,
  unquote,
} from "./links.ts";
import { documentDataFromPath, readTextTolerant } from "./parser.ts";
import { iterDocumentFiles, routeForDocumentFile } from "./paths.ts";
import type { BrokenLink } from "./schemas/domain.ts";
import { errorMessage, indexPageLinks } from "./wiki_links/page_links.ts";
import {
  frontmatterAssetTargets,
  linkIssue,
  pageTargetIssue,
  pageTargetMessage,
  wikiCuriesInMetadata,
  wikiRouteFromCurie,
} from "./wiki_links/link_targets.ts";

export {
  outboundPageRoutes,
  type PageLinkMatch,
  pageLinkMatches,
} from "./wiki_links/page_links.ts";

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
      if (extname(filePath).toLowerCase() === ".md") {
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

        if (extname(filePath).toLowerCase() === ".md") {
          const content = readTextTolerant(filePath);
          const split = splitFrontmatterText(content);
          const body = split.body;
          const bodyOffset = split.prefix.length;
          const protectedSpans = bodyCodeSpans(body);

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
            const target = unquote(
              parseMarkdownDestination(match[2] as string).target.split(
                "?",
              )[0] as string,
            );
            if (isExternalLink(target)) continue;
            // A site-root-relative link (`/wiki/Page/`) is checked against the
            // route the configured `base_url` and `url_style` map it to.
            const siteRoute = routeFromSiteUrl(
              target,
              this.#config.site.base_url,
              this.#config.site.url_style,
            );
            if (siteRoute !== null || markdownLinkIsPage(target)) {
              const issue = pageTargetIssue(
                this.#existingRoutes,
                this.#headingIdsByRoute,
                fileSlug,
                target,
                siteRoute,
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
                    message: `In ${
                      basename(filePath)
                    }: Broken asset link [${target}] ${assetIssue}.`,
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
                message: `In ${
                  basename(filePath)
                }: Broken frontmatter asset [${target}] ${assetIssue}.`,
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
            message: `Failed to read ${basename(filePath)} for link audit: ${
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
