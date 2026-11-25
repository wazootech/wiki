import {
  normalizePosixPath,
  posixDirname,
  splitTarget,
  suffixOf,
  unquote,
} from "./targets.ts";

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
  let pagePart = unquote(pagePartRaw).replaceAll("\\", "/").trim();
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
  let combined = normalizePosixPath(
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

/**
 * The route a site-root-relative link names, or `null` when it is not one.
 *
 * The inverse of `pageUrl`: `/wiki/Guides/Setup/` under `base_url: /wiki` and
 * `url_style: dir` is the route `Guides/Setup`, and `/wiki/` is the index.
 * `null` covers a link outside `base_url`, a protocol-relative `//host`, and a
 * path that names a file the site would not emit for a page (`.png`), so the
 * caller keeps treating those as it always did.
 */
export function routeFromSiteUrl(
  target: string,
  baseUrl: string,
  urlStyle: string,
): string | null {
  const [pagePart] = splitTarget(target);
  const path = unquote(pagePart).replaceAll("\\", "/");
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  const base = baseUrl.replace(/\/+$/, "");
  let rest: string;
  if (base === "") {
    rest = path;
  } else if (path === base || path.startsWith(`${base}/`)) {
    rest = path.slice(base.length);
  } else {
    return null;
  }
  rest = rest.replace(/^\/+/, "");
  if (urlStyle === "file") {
    if (rest === "" || rest === "index.html") return "";
    if (!rest.endsWith(".html")) return null;
    rest = rest.slice(0, -".html".length);
  } else {
    if (rest.endsWith("/index.html")) {
      rest = rest.slice(0, -"index.html".length);
    }
    if (rest !== "" && !rest.endsWith("/")) return null;
    rest = rest.replace(/\/+$/, "");
  }
  if (rest.split("/").some((part) => part === "." || part === "..")) {
    return null;
  }
  return rest;
}
