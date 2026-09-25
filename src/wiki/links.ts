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

import { ValueError } from "./fspath.ts";
import { headingSlug } from "./headings.ts";
import { pageUrl } from "./paths.ts";

/** Schemes treated as external rather than wiki-relative. */
export const EXTERNAL_SCHEMES: ReadonlySet<string> = new Set([
  "http",
  "https",
  "mailto",
  "tel",
]);

/** Extensions a markdown link may name and still be a *page* link. */
export const PAGE_LINK_EXTENSIONS: ReadonlySet<string> = new Set([
  "",
  ".md",
  ".yaml",
  ".yml",
  ".json",
]);

/** `true` for a link the engine will not try to resolve inside the wiki. */
export function isExternalLink(target: string): boolean {
  const scheme = schemeOf(target).toLowerCase();
  return EXTERNAL_SCHEMES.has(scheme);
}

/**
 * `urllib.parse.urlsplit(target).scheme`.
 *
 * A URL parser rather than a `startsWith("http")` test: `mailto:` and `tel:`
 * carry no `//`, and `HTTP://` is the same scheme as `http://`, both of which
 * a prefix test gets wrong. The regex is `urlsplit`'s own rule — the scheme
 * must open the target and contain no `/` — which is what keeps `docs/Page.md`
 * a wiki path and not a `docs:` URL.
 */
function schemeOf(target: string): string {
  const match = /^([A-Za-z][A-Za-z0-9+.\-]*):/.exec(target);
  return match === null ? "" : (match[1] as string).toLowerCase();
}

/** Split a target into its page part and its fragment, if any. */
export function splitTarget(target: string): [string, string | null] {
  const index = target.indexOf("#");
  if (index < 0) return [target, null];
  return [target.slice(0, index), target.slice(index + 1)];
}

/** The anchor id a fragment names, slugged the way GitHub slugs headings. */
export function fragmentId(fragment: string | null): string {
  if (!fragment) return "";
  return headingSlug(pyUnquote(fragment).trim());
}

/** `urllib.parse.unquote`. */
export function pyUnquote(text: string): string {
  try {
    return decodeURIComponent(text.replace(/\+/g, "%2B"));
  } catch {
    // Python leaves a malformed escape alone (`%zz` stays `%zz`), and so must
    // this: a link with a stray `%` is a broken link, not a crash.
    return text;
  }
}

/**
 * `PurePosixPath(page_part).suffix.lower()`.
 *
 * Only the last component counts, and a dot that opens or closes that name is
 * not a suffix: `notes.` and `.hidden` both have none, which matters because
 * `markdown_link_is_page` treats a stray `.` as a page extension.
 */
function suffixOf(pagePart: string): string {
  const name = pagePart.split("/").pop() ?? "";
  const index = name.lastIndexOf(".");
  if (index <= 0 || index === name.length - 1) return "";
  return name.slice(index).toLowerCase();
}

/**
 * Normalise a wiki route, POSIX-style.
 *
 * `posixpath.normpath` semantics, spelled out: `.` and empty segments vanish,
 * `..` pops, and a leading `..` survives so the caller can reject it.
 */
function normalizeRoute(path: string): string {
  const absolute = path.startsWith("/");
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (parts.length > 0 && parts[parts.length - 1] !== "..") parts.pop();
      else if (absolute) continue;
      else parts.push("..");
      continue;
    }
    parts.push(part);
  }
  const normalized = parts.join("/");
  return absolute ? `/${normalized}` : normalized === "" ? "." : normalized;
}

/**
 * Resolve a link target against the route of the page that contains it.
 *
 * Returns the route, or `null` when the target points outside the wiki or is
 * malformed. `""` resolves to the current page (a bare `#fragment`, or a
 * `Page#Section` where `Page` is the current one).
 */
export function resolvePageRoute(
  currentRoute: string,
  target: string,
): string | null {
  const [pagePartRaw] = splitTarget(target);
  let pagePart = pyUnquote(pagePartRaw).replaceAll("\\", "/").trim();
  if (pagePart.startsWith("/")) return null;
  const suffix = suffixOf(pagePart);
  if (
    suffix === ".md" || suffix === ".yaml" || suffix === ".yml" ||
    suffix === ".json"
  ) {
    pagePart = pagePart.slice(0, -suffix.length);
  }
  const currentDir = posixDirname(currentRoute);
  const raw = pagePart === "" ? "." : pagePart;
  let combined = normalizeRoute(
    currentDir === "" ? raw : `${currentDir}/${raw}`,
  );
  if (combined === ".") combined = currentRoute;
  if (combined.startsWith("../") || combined === "..") return null;
  let parts = combined.split("/").filter((part) => part !== "" && part !== ".");
  if (parts.length > 0 && parts[parts.length - 1] === "index") {
    parts = parts.slice(0, -1);
  }
  return parts.join("/");
}

/** `posixpath.dirname`. */
function posixDirname(path: string): string {
  const index = path.lastIndexOf("/");
  return index < 0 ? "" : path.slice(0, index);
}

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

/** The wiki-relative markdown path of a route, as a link target. */
export function markdownLinkTarget(route: string): string {
  return `${route}.md`;
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
    `expected standard or wikilink, got ${pyReprStr(style)}`,
  );
}

function pyReprStr(text: string): string {
  return text.includes("'") && !text.includes('"') ? `"${text}"` : `'${text}'`;
}
