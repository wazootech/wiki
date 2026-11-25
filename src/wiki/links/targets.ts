import { headingSlug } from "../headings.ts";

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

/**
 * `true` for a link the engine will not try to resolve inside the wiki.
 *
 * Beyond the named schemes, anything of the form `scheme://` or `//host` is a
 * URL by construction (`ftp://`, `obsidian://`, `vscode://`), so it is never a
 * wiki path. A bare `Talk:Page.md` carries no `//` and stays a wiki path.
 */
export function isExternalLink(target: string): boolean {
  if (target.startsWith("//")) return true;
  if (/^[A-Za-z][A-Za-z0-9+.\-]*:\/\//.test(target)) return true;
  const scheme = schemeOf(target).toLowerCase();
  return EXTERNAL_SCHEMES.has(scheme);
}

/**
 * A markdown link destination split around its target: `before` and `after`
 * hold the `<` `>` brackets, whitespace, and `"title"` that surround it, so a
 * rewrite can swap the target and keep the rest byte for byte.
 */
export interface MarkdownDestination {
  readonly before: string;
  readonly target: string;
  readonly after: string;
}

/**
 * Split the raw text between a link's parentheses into target and decoration.
 *
 * CommonMark allows `(<Page.md>)`, `(Page.md "Title")`, and both together. The
 * link scanner captures all of it, so treating the capture as the target made
 * every titled link "point to a missing asset" and left it out of backlinks.
 * Text that does not parse as one destination plus an optional title (a bare
 * space in the path, say) is returned whole as the target, as before.
 */
export function parseMarkdownDestination(raw: string): MarkdownDestination {
  const wrapped = /^(\s*<)([^<>\r\n]*)(>[\s\S]*)$/.exec(raw);
  if (wrapped !== null) {
    return {
      before: wrapped[1] as string,
      target: wrapped[2] as string,
      after: wrapped[3] as string,
    };
  }
  const titled = /^(\s*)(\S+?)(\s+(?:"[^"]*"|'[^']*'|\([^()]*\)))?(\s*)$/.exec(
    raw,
  );
  if (titled === null) return { before: "", target: raw, after: "" };
  return {
    before: titled[1] as string,
    target: titled[2] as string,
    after: `${titled[3] ?? ""}${titled[4] ?? ""}`,
  };
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
  return headingSlug(unquote(fragment).trim());
}

/** `urllib.parse.unquote`. */
export function unquote(text: string): string {
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
export function suffixOf(pagePart: string): string {
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
 *
 * Exported because the asset resolver needs the same normalisation on the same
 * kind of string — a wiki-relative POSIX path — and Python reaches for
 * `posixpath` from both modules. One difference, accepted: `posixpath` keeps a
 * leading `//` (POSIX's implementation-defined form) where this collapses it,
 * and no wiki path starts with two slashes.
 */
export function normalizePosixPath(path: string): string {
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

/** `posixpath.dirname`. */
export function posixDirname(path: string): string {
  const index = path.lastIndexOf("/");
  return index < 0 ? "" : path.slice(0, index);
}

/** The wiki-relative markdown path of a route, as a link target. */
export function markdownLinkTarget(route: string): string {
  return `${route}.md`;
}
