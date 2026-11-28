/**
 * `wiki build --public`: build only pages marked public, and refuse leaks.
 *
 * Pages are private unless their frontmatter says otherwise. The build runs on a
 * narrowed config, so the index and backlinks never see a private page. What a
 * public page itself says about one is then checked, and any doubt fails.
 */

import type { Config } from "../config.ts";
import { copyConfig } from "../config_copy.ts";
import { isExternalLink } from "../links.ts";
import { splitDocumentBody } from "../parser.ts";
import { iterDocumentFiles, pageUrl } from "../paths.ts";
import type { WikiSite } from "./types.ts";

/** The frontmatter key that publishes a page: `public`, or `private`. */
export const VISIBILITY_FRONTMATTER_KEY = "wazoo:visibility";

const QUERY_BLOCK = /<!--\s*sparql:start/i;
const TAG = /<[a-z][^>]*>/gi;
const ATTRIBUTE = /\s([a-z0-9:_-]+)="([^"]*)"/gi;

function visibility(path: string): unknown {
  return splitDocumentBody(path)[0]?.[VISIBILITY_FRONTMATTER_KEY];
}

/** Spell a path as an `exclude` pattern that matches only itself. */
function literalPattern(path: string): string {
  return path.replace(/[[*?]/g, "[$&]");
}

/** `config` narrowed to public documents, with no assets to copy. */
export function publicConfig(config: Config): Config {
  const hidden = iterDocumentFiles(config)
    .filter((path) => visibility(path) !== "public")
    .map((path) => literalPattern(config.relativeToRoot(path)));
  const exclude = [...config.wiki.exclude, ...hidden];
  return copyConfig(config, { wiki: { ...config.wiki, assets: [], exclude } });
}

/** Misspelled values, which would otherwise hide a page without a word. */
export function visibilityErrors(config: Config): string[] {
  return iterDocumentFiles(config)
    .filter(
      (path) =>
        ![undefined, "public", "private"].includes(
          visibility(path) as string | undefined,
        ),
    )
    .map(
      (path) =>
        `${config.relativeToRoot(path)}: ${VISIBILITY_FRONTMATTER_KEY} must be ` +
        '"public" or "private".',
    );
}

function linkTargets(html: string): string[] {
  return [...html.matchAll(TAG)].flatMap(([tag]) =>
    [...tag.matchAll(ATTRIBUTE)]
      .filter(([, name]) => name === "href" || name === "src")
      .map((match) => match[2]!.replaceAll("&amp;", "&")),
  );
}

/** A link without scheme, query, fragment, escapes, or trailing slash. */
function pageKey(target: string): string {
  const path = target.split(/[?#]/)[0]!.replace(/^https?:\/\//i, "//");
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    // A malformed escape stays as written, and so matches no public page.
  }
  return decoded.replace(/\/+$/, "");
}

/** Reasons the built public pages would expose something private. */
export function publicLeaks(
  site: WikiSite,
  baseUrl: string,
  urlStyle: string,
): string[] {
  const { config, pages } = site;
  const local = new Set(
    [
      `${baseUrl}/`,
      pageUrl(baseUrl, "", urlStyle),
      ...pages.map((page) => pageUrl(baseUrl, page.file_slug, urlStyle)),
    ].map(pageKey),
  );
  const iriRoot = pageKey(config.base_iri).toLowerCase();
  const iris = new Set(
    [config.base_iri, ...pages.flatMap((page) => page.wiki_ids)].map(pageKey),
  );
  const allowed = (target: string): boolean => {
    if (target.startsWith("#")) return true;
    const key = pageKey(target);
    if (!isExternalLink(target)) return local.has(key);
    const lower = key.toLowerCase();
    const ownPage = lower === iriRoot || lower.startsWith(`${iriRoot}/`);
    return !ownPage || iris.has(key);
  };

  return pages.flatMap((page) => {
    const name = config.relativeToRoot(page.source_path);
    const leaks: string[] = [];
    if (visibility(page.source_path) !== "public") {
      leaks.push(`${name}: not marked public.`);
    }
    if (QUERY_BLOCK.test(page.markdown)) {
      leaks.push(
        `${name}: query blocks hold saved results that may be private.`,
      );
    }
    for (const target of linkTargets(page.html)) {
      if (allowed(target)) continue;
      leaks.push(`${name}: links to ${target}, which is not a public page.`);
    }
    return leaks;
  });
}
