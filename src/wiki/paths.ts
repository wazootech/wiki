/**
 * Path, route, URL, and output-manifest helpers for wiki pages.
 *
 * Port of `src/wiki/paths.py`. A page's *route* is the identity the whole
 * engine agrees on — links, audits, the site manifest, and the served URLs all
 * derive from it — so the rules that turn a file path into a route are worth
 * stating plainly:
 *
 * - The route is the path relative to its input directory, with the extension
 *   dropped and `index` elided, so `games/index.md` and `games.md` are both
 *   `games`.
 * - Route segments must be URL-safe: no spaces, control characters, or `?#%`.
 *   A violation is reported rather than silently encoded, because a page whose
 *   URL cannot be written down is a page nobody can link to.
 * - Output collisions are detected case-insensitively, which is the only
 *   behaviour that is correct on both a case-preserving and a case-folding
 *   filesystem.
 */

import { join } from "@std/path";
import { ValueError } from "./errors.ts";
import type { Config } from "./config.ts";
import { quote } from "./urlquote.ts";
import type { OutputEntry, PageRoute } from "./schemas/domain.ts";
import { routeForDocumentFile } from "./paths/routes.ts";
import { iterDocumentFiles, selectMarkdownPaths } from "./paths/iterate.ts";

export {
  compilePythonRegex,
  detectOutputCollisions,
  routeForDocumentFile,
  UNSAFE_ROUTE_CHARS,
  validateFilenamePattern,
} from "./paths/routes.ts";
export {
  iterDocumentFiles,
  iterMarkdownFiles,
  pathWithinRoot,
  resolveConfigRelativePath,
  selectDocumentPaths,
  selectMarkdownPaths,
} from "./paths/iterate.ts";

/** The routes of the given explicit markdown paths. */
export function routesFromMarkdownFiles(
  config: Config,
  paths: readonly string[],
): Set<string> {
  return new Set(
    selectMarkdownPaths(config, paths).map((path) =>
      routeForDocumentFile(config, path)
    ),
  );
}

/** Every page route in the wiki. */
export function pageRoutes(config: Config): PageRoute[] {
  return iterDocumentFiles(config).map((filePath) => ({
    source: filePath,
    route: routeForDocumentFile(config, filePath),
  }));
}

/**
 * The public URL for a route.
 *
 * `dir` style gives every page a directory with a trailing slash; `file` style
 * gives every page an `.html` file. The empty route is the site root in both
 * styles, which is why an `index.md` at an input root produces the site's front
 * page rather than a page named `index`.
 */
export function pageUrl(
  baseUrl: string,
  route: string,
  urlStyle: string,
): string {
  const base = baseUrl ? baseUrl.replace(/\/+$/, "") : "";
  const encoded = quote(route, "/()_-.$~");
  if (urlStyle === "file") {
    if (encoded !== "") {
      return base ? `${base}/${encoded}.html` : `/${encoded}.html`;
    }
    return base ? `${base}/index.html` : "/index.html";
  }
  if (encoded !== "") return base ? `${base}/${encoded}/` : `/${encoded}/`;
  return base ? `${base}/` : "/";
}

/** Where a route's HTML is written inside the owned output directory. */
export function pageOutputPath(
  ownedOutputDir: string,
  route: string,
  urlStyle: string,
): string {
  if (urlStyle === "file") {
    if (route === "") return join(ownedOutputDir, "index.html");
    const parts = route.split("/");
    const last = parts.pop()!;
    return join(ownedOutputDir, ...parts, `${last}.html`);
  }
  if (route === "") return join(ownedOutputDir, "index.html");
  return join(ownedOutputDir, ...route.split("/"), "index.html");
}

/** The manifest entries for every page in the wiki. */
export function buildPageManifest(
  config: Config,
  ownedOutputDir: string,
  baseUrl: string,
  urlStyle: string,
): OutputEntry[] {
  return pageRoutes(config).map((route) => ({
    source: route.source,
    output_path: pageOutputPath(ownedOutputDir, route.route, urlStyle),
    public_url: pageUrl(baseUrl, route.route, urlStyle),
    kind: "page",
  }));
}

/** Report every document whose path cannot be turned into a safe route. */
export function validateRouteSafety(config: Config): string[] {
  const issues: string[] = [];
  for (const filePath of iterDocumentFiles(config)) {
    try {
      routeForDocumentFile(config, filePath);
    } catch (error) {
      if (error instanceof ValueError) issues.push(error.message);
      else throw error;
    }
  }
  return issues;
}
