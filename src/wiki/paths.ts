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

import { DOCUMENT_EXTENSIONS } from "./parser.ts";
import type { Config } from "./config.ts";
import { type Path, sortedRglob, ValueError } from "./fspath.ts";
import { quote } from "./urlquote.ts";
import type { OutputEntry, PageRoute } from "./schemas/domain.ts";

/** Characters a route may never contain, because a URL cannot quote them. */
export const UNSAFE_ROUTE_CHARS: ReadonlySet<string> = new Set(["?", "#", "%"]);

/** Every document file under the configured inputs, sorted, minus exclusions. */
export function iterDocumentFiles(config: Config): Path[] {
  const docFiles: Path[] = [];
  for (const inputDir of config.wiki.input) {
    if (!inputDir.isDir()) continue;
    for (const filePath of sortedRglob(inputDir)) {
      if (!filePath.isFile()) continue;
      if (!DOCUMENT_EXTENSIONS.has(filePath.suffix.toLowerCase())) continue;
      if (config.isExcluded(filePath)) continue;
      docFiles.push(filePath);
    }
  }
  return docFiles;
}

/** Markdown documents only. */
export function iterMarkdownFiles(config: Config): Path[] {
  return iterDocumentFiles(config).filter((filePath) =>
    filePath.suffix.toLowerCase() === ".md"
  );
}

/** Map every document's resolved path back to the path it was discovered at. */
function wikiDocumentIndex(config: Config): Map<string, Path> {
  const index = new Map<string, Path>();
  for (const filePath of iterDocumentFiles(config)) {
    index.set(filePath.resolve().toString(), filePath);
  }
  return index;
}

/** Resolve explicit CLI paths to wiki documents, preserving the given order. */
function resolveWikiPaths(
  config: Config,
  paths: readonly Path[],
  options: { allowedSuffixes: ReadonlySet<string>; label: string },
): Path[] {
  if (paths.length === 0) return [];
  const index = wikiDocumentIndex(config);
  const selected: Path[] = [];
  for (const path of paths) {
    const wikiPath = index.get(path.resolve().toString());
    if (wikiPath === undefined) {
      throw new ValueError(
        `${path.name} is not a wiki document under inputs (or is excluded).`,
      );
    }
    if (!options.allowedSuffixes.has(wikiPath.suffix.toLowerCase())) {
      const suffixes = [...options.allowedSuffixes].sort().join(", ");
      throw new ValueError(
        `${options.label} only supports ${suffixes} files, got ${wikiPath.name}.`,
      );
    }
    selected.push(wikiPath);
  }
  return selected;
}

/** Resolve explicit CLI paths to wiki documents (`.md`, `.yaml`, `.json`). */
export function selectDocumentPaths(
  config: Config,
  paths: readonly Path[],
): Path[] {
  return resolveWikiPaths(config, paths, {
    allowedSuffixes: DOCUMENT_EXTENSIONS,
    label: "export",
  });
}

/** Resolve explicit CLI paths to wiki markdown files. */
export function selectMarkdownPaths(
  config: Config,
  paths: readonly Path[],
): Path[] {
  return resolveWikiPaths(config, paths, {
    allowedSuffixes: new Set([".md"]),
    label: "command",
  });
}

/** The routes of the given explicit markdown paths. */
export function routesFromMarkdownFiles(
  config: Config,
  paths: readonly Path[],
): Set<string> {
  return new Set(
    selectMarkdownPaths(config, paths).map((path) =>
      routeForDocumentFile(config, path)
    ),
  );
}

/**
 * The route a document file is published at.
 *
 * Both `index` elision and route safety live here, so every consumer inherits
 * the same answer for `games/index.md`.
 */
export function routeForDocumentFile(config: Config, filePath: Path): string {
  const rel = relativeToInputDir(config, filePath).withSuffix("").asPosix();
  let parts = rel.split("/").filter((part) => part !== "");
  if (parts.length > 0 && parts[parts.length - 1] === "index") {
    parts = parts.slice(0, -1);
  }
  validateRouteParts(parts, filePath);
  return parts.join("/");
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
  ownedOutputDir: Path,
  route: string,
  urlStyle: string,
): Path {
  if (urlStyle === "file") {
    if (route === "") return ownedOutputDir.joinpath("index.html");
    const parts = route.split("/");
    const last = parts.pop()!;
    return ownedOutputDir.joinpath(...parts, `${last}.html`);
  }
  if (route === "") return ownedOutputDir.joinpath("index.html");
  return ownedOutputDir.joinpath(...route.split("/"), "index.html");
}

/** The manifest entries for every page in the wiki. */
export function buildPageManifest(
  config: Config,
  ownedOutputDir: Path,
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

/**
 * Report output-path and public-URL collisions.
 *
 * Comparison is case-folded on both dimensions: on Windows and macOS two routes
 * differing only in case would overwrite each other, so a case-only collision
 * is a real deployment bug on the platforms the engine supports, not a
 * theoretical one.
 */
export function detectOutputCollisions(
  entries: readonly OutputEntry[],
): string[] {
  const issues: string[] = [];
  const seenPaths = new Map<string, OutputEntry>();
  const seenUrls = new Map<string, OutputEntry>();
  for (const entry of entries) {
    const pathKey = entry.output_path.toString().toLowerCase();
    const urlKey = entry.public_url.toLowerCase();
    const previousPath = seenPaths.get(pathKey);
    if (previousPath !== undefined) {
      issues.push(collisionMessage("output path", previousPath, entry));
    } else {
      seenPaths.set(pathKey, entry);
    }
    const previousUrl = seenUrls.get(urlKey);
    if (previousUrl !== undefined) {
      issues.push(collisionMessage("public URL", previousUrl, entry));
    } else {
      seenUrls.set(urlKey, entry);
    }
  }
  return issues;
}

/**
 * Check a markdown filename against `wiki.filename_pattern`.
 *
 * The pattern is a Python regex applied with `fullmatch`, so the port
 * translates the Python-only spellings a config is likely to contain and
 * anchors explicitly rather than relying on `$`, which Python treats as
 * matching before a trailing newline and JavaScript does not.
 */
export function validateFilenamePattern(
  config: Config,
  mdFile: Path,
): string | null {
  const pattern = config.wiki.filename_pattern;
  if (!pattern) return null;
  if (mdFile.suffix.toLowerCase() !== ".md") return null;
  let regex: RegExp;
  try {
    regex = compilePythonRegex(pattern);
  } catch (error) {
    return `Invalid filename_pattern: ${(error as Error).message}`;
  }
  if (regex.exec(mdFile.name) === null) {
    return `Filename '${mdFile.name}' does not match filename_pattern.`;
  }
  return null;
}

/**
 * Translate the Python-only regex spellings the engine's configs use.
 *
 * Named groups are the common case (`(?P<year>\d{4})`). Inline flags and atomic
 * groups have no JavaScript equivalent and are left alone: a pattern that needs
 * them fails loudly at compile time rather than silently matching differently.
 */
export function compilePythonRegex(pattern: string): RegExp {
  const translated = pattern
    .replaceAll(/\(\?P<([A-Za-z_][A-Za-z0-9_]*)>/g, "(?<$1>")
    .replaceAll(/\(\?P=([A-Za-z_][A-Za-z0-9_]*)\)/g, "\\k<$1>");
  // `^(?:...)$` is exactly `re.fullmatch` here: without the `m` flag, `$` only
  // matches the end of input.
  return new RegExp(`^(?:${translated})$`);
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

/** The input directory a document lives under, or the path itself. */
function relativeToInputDir(config: Config, mdFile: Path): Path {
  for (const root of config.wiki.input) {
    try {
      return mdFile.relativeTo(root);
    } catch {
      continue;
    }
  }
  return mdFile;
}

/** Reject route segments that cannot appear in a URL. */
function validateRouteParts(parts: readonly string[], source: Path): void {
  for (const part of parts) {
    if (part === "" || part === "." || part === "..") {
      throw new ValueError(
        `Unsafe route for ${source}: path segments cannot be empty, '.', or '..'.`,
      );
    }
    if (/\s/.test(part)) {
      throw new ValueError(
        `Unsafe route for ${source}: spaces are not allowed in page paths.`,
      );
    }
    // deno-lint-ignore no-control-regex -- route safety is defined per character code.
    if (/[\u0000-\u001f]/.test(part)) {
      throw new ValueError(
        `Unsafe route for ${source}: control characters are not allowed in page paths.`,
      );
    }
    const found = [...UNSAFE_ROUTE_CHARS].filter((char) => part.includes(char))
      .sort();
    if (found.length > 0) {
      throw new ValueError(
        `Unsafe route for ${source}: characters '${
          found.join("")
        }' are not allowed in page paths.`,
      );
    }
  }
}

/** The sentence describing one output collision. */
function collisionMessage(
  kind: string,
  first: OutputEntry,
  second: OutputEntry,
): string {
  return `Output collision on ${kind} '${first.public_url}': ` +
    `${sourceLabel(first)} conflicts with ${sourceLabel(second)}.`;
}

/** How an entry is named in a collision message. */
function sourceLabel(entry: OutputEntry): string {
  if (entry.source === null) return entry.kind;
  return `${entry.kind} ${entry.source}`;
}
