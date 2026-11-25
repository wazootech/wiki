/**
 * Link parsing and resolution for Markdown and Obsidian-style wiki links.
 *
 * Port of `src/wiki/links.py`. Everything here is pure string work — no
 * filesystem, no config — because the same resolution has to happen at audit
 * time (is this target real?), at render time (what URL does it become?), and
 * at fix time (what should the target have been?).
 *
 * The load-bearing details, all of them from the Python module:
 *
 * - **A target is split once, on the first `#`.** `Page#Section#More` has the
 *   fragment `Section#More`, and the fragment is itself slugged.
 * - **Routes are POSIX paths, not filesystem paths.** The route space is the
 *   wiki's, so resolution uses `posixpath` semantics on both sides; a backslash
 *   in a link is normalised to `/` rather than treated as a separator.
 * - **`index` collapses.** `docs/index.md` and `docs/` are the same route, so
 *   resolution drops a trailing `index` for the same reason
 *   `route_for_document_file` does.
 * - **Escaping up and out is a failure, not a normalisation.** A target that
 *   normalises to `../...` returns `null` — a link may not leave the wiki by
 *   climbing out of it.
 */

import { quoteString } from "./describe.ts";
import { ValueError } from "./errors.ts";
import { pageUrl } from "./paths.ts";
import {
  fragmentId,
  markdownLinkTarget,
  PAGE_LINK_EXTENSIONS,
  splitTarget,
  suffixOf,
} from "./links/targets.ts";
import { resolvePageRoute } from "./links/route_resolve.ts";

export {
  EXTERNAL_SCHEMES,
  fragmentId,
  isExternalLink,
  type MarkdownDestination,
  markdownLinkTarget,
  normalizePosixPath,
  PAGE_LINK_EXTENSIONS,
  parseMarkdownDestination,
  posixDirname,
  splitTarget,
  unquote,
} from "./links/targets.ts";
export { resolvePageRoute, routeFromSiteUrl } from "./links/route_resolve.ts";

/**
 * Resolve a link target straight to the href the site should emit.
 *
 * A fragment-only target becomes `#slug` and a target that resolves to a route
 * becomes the page's URL plus the fragment — the two steps `render.py` would
 * otherwise have to repeat.
 */
export function resolvePageHref(
  currentRoute: string,
  target: string,
  baseUrl: string,
  urlStyle: string,
): string | null {
  const [pagePart, fragment] = splitTarget(target);
  if (pagePart === "") {
    const suffix = fragmentId(fragment);
    return suffix === "" ? "#" : `#${suffix}`;
  }
  const route = resolvePageRoute(currentRoute, target);
  if (route === null) return null;
  const suffix = fragmentId(fragment);
  const url = pageUrl(baseUrl, route, urlStyle);
  return suffix === "" ? url : `${url}#${suffix}`;
}

/** `true` when a markdown link should be resolved as a page rather than an asset. */
export function markdownLinkIsPage(target: string): boolean {
  const [pagePart] = splitTarget(target);
  if (pagePart === "") return true;
  return PAGE_LINK_EXTENSIONS.has(suffixOf(pagePart));
}

/**
 * Format an internal wiki link for insertion or a CLI suggestion.
 *
 * Throws for an unknown style because `link fix` writes the result into a
 * document: silently falling back to one style would rewrite the user's links
 * in a style they did not ask for.
 */
export function formatInternalLink(
  targetRoute: string,
  display: string,
  style = "standard",
): string {
  if (style === "standard") {
    return `[${display}](${markdownLinkTarget(targetRoute)})`;
  }
  if (style === "wikilink") {
    return `[[${targetRoute}|${display}]]`;
  }
  throw new ValueError(
    `expected standard or wikilink, got ${quoteString(style)}`,
  );
}
