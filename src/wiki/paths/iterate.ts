import {
  isDirectory,
  isFile,
  relativeWithin,
  sortedTreePaths,
} from "../fspath.ts";
import { basename, extname, isAbsolute, join, resolve } from "@std/path";
import { ValueError } from "../errors.ts";
import { DOCUMENT_EXTENSIONS } from "../parser.ts";
import type { Config } from "../config.ts";

/**
 * Resolve a config-relative path value, the way three Python modules each do.
 *
 * `frontmatter_schema.resolve_local_schema_path`,
 * `layout.resolve_layout_path`, and `site.layout_template`'s callers all mean
 * the same thing by "a path in the config": strip it, accept backslashes as
 * separators (Windows authors write them), resolve against the config root
 * unless it is already absolute, and canonicalise.
 *
 * One copy rather than three, because the rule that matters is the *pairing*
 * with {@link pathWithinRoot}: a value that resolves outside the root must be
 * rejected, and three copies of the resolver are three chances to forget.
 */
export function resolveConfigRelativePath(raw: string, root: string): string {
  const text = raw.trim().replaceAll("\\", "/");
  const path = text;
  return resolve(isAbsolute(path) ? path : join(root, path));
}

/** `true` when `path` resolves inside `root`. */
export function pathWithinRoot(path: string, root: string): boolean {
  try {
    relativeWithin(resolve(path), resolve(root));
  } catch (error) {
    if (error instanceof ValueError) return false;
    throw error;
  }
  return true;
}

/** Every document file under the configured inputs, sorted, minus exclusions. */
export function iterDocumentFiles(config: Config): string[] {
  const docFiles: string[] = [];
  for (const inputDir of config.wiki.input) {
    if (!isDirectory(inputDir)) continue;
    for (const filePath of sortedTreePaths(inputDir)) {
      if (!isFile(filePath)) continue;
      if (!DOCUMENT_EXTENSIONS.has(extname(filePath).toLowerCase())) continue;
      if (config.isExcluded(filePath)) continue;
      docFiles.push(filePath);
    }
  }
  return docFiles;
}

/** Markdown documents only. */
export function iterMarkdownFiles(config: Config): string[] {
  return iterDocumentFiles(config).filter((filePath) =>
    extname(filePath).toLowerCase() === ".md"
  );
}

/** Map every document's resolved path back to the path it was discovered at. */
function wikiDocumentIndex(config: Config): Map<string, string> {
  const index = new Map<string, string>();
  for (const filePath of iterDocumentFiles(config)) {
    index.set(resolve(filePath), filePath);
  }
  return index;
}

/** Resolve explicit CLI paths to wiki documents, preserving the given order. */
function resolveWikiPaths(
  config: Config,
  paths: readonly string[],
  options: { allowedSuffixes: ReadonlySet<string>; label: string },
): string[] {
  if (paths.length === 0) return [];
  const index = wikiDocumentIndex(config);
  const selected: string[] = [];
  for (const path of paths) {
    const wikiPath = index.get(resolve(path));
    if (wikiPath === undefined) {
      throw new ValueError(
        `${
          basename(path)
        } is not a wiki document under inputs (or is excluded).`,
      );
    }
    if (!options.allowedSuffixes.has(extname(wikiPath).toLowerCase())) {
      const suffixes = [...options.allowedSuffixes].sort().join(", ");
      throw new ValueError(
        `${options.label} only supports ${suffixes} files, got ${
          basename(wikiPath)
        }.`,
      );
    }
    selected.push(wikiPath);
  }
  return selected;
}

/** Resolve explicit CLI paths to wiki documents (`.md`, `.yaml`, `.json`). */
export function selectDocumentPaths(
  config: Config,
  paths: readonly string[],
): string[] {
  return resolveWikiPaths(config, paths, {
    allowedSuffixes: DOCUMENT_EXTENSIONS,
    label: "export",
  });
}

/** Resolve explicit CLI paths to wiki markdown files. */
export function selectMarkdownPaths(
  config: Config,
  paths: readonly string[],
): string[] {
  return resolveWikiPaths(config, paths, {
    allowedSuffixes: new Set([".md"]),
    label: "command",
  });
}
