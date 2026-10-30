import { relativeWithin } from "../fspath.ts";
import { basename, extname } from "@std/path";
import { ValueError } from "../errors.ts";
import type { Config } from "../config.ts";
import type { OutputEntry } from "../schemas/domain.ts";

/** Characters a route may never contain, because a URL cannot quote them. */
export const UNSAFE_ROUTE_CHARS: ReadonlySet<string> = new Set(["?", "#", "%"]);

/**
 * The route a document file is published at.
 *
 * Both `index` elision and route safety live here, so every consumer inherits
 * the same answer for `games/index.md`.
 */
export function routeForDocumentFile(config: Config, filePath: string): string {
  const relativePath = relativeToInputDir(config, filePath);
  const extension = extname(relativePath);
  const rel =
    (extension === "" ? relativePath : relativePath.slice(0, -extension.length))
      .replaceAll("\\", "/");
  let parts = rel.split("/").filter((part) => part !== "");
  if (parts.length > 0 && parts[parts.length - 1] === "index") {
    parts = parts.slice(0, -1);
  }
  validateRouteParts(parts, filePath);
  return parts.join("/");
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
    const pathKey = entry.output_path.toLowerCase();
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
  mdFile: string,
): string | null {
  const pattern = config.wiki.filename_pattern;
  if (!pattern) return null;
  if (extname(mdFile).toLowerCase() !== ".md") return null;
  let regex: RegExp;
  try {
    regex = compilePythonRegex(pattern);
  } catch (error) {
    return `Invalid filename_pattern: ${(error as Error).message}`;
  }
  if (regex.exec(basename(mdFile)) === null) {
    return `Filename '${basename(mdFile)}' does not match filename_pattern.`;
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

/** The input directory a document lives under, or the path itself. */
function relativeToInputDir(config: Config, mdFile: string): string {
  for (const root of config.wiki.input) {
    try {
      return relativeWithin(mdFile, root);
    } catch {
      continue;
    }
  }
  return mdFile;
}

/** Reject route segments that cannot appear in a URL. */
function validateRouteParts(parts: readonly string[], source: string): void {
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
