import { walkSync } from "@std/fs";
import {
  basename,
  isAbsolute,
  join,
  normalize,
  relative,
  resolve,
  SEPARATOR,
} from "@std/path";
import { ValueError } from "./errors.ts";

export const IS_WINDOWS = SEPARATOR === "\\";

export function pathExists(path: string): boolean {
  try {
    Deno.lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

export function isFile(path: string): boolean {
  try {
    return Deno.statSync(path).isFile;
  } catch {
    return false;
  }
}

export function isDirectory(path: string): boolean {
  try {
    return Deno.statSync(path).isDirectory;
  } catch {
    return false;
  }
}

export function isSymlink(path: string): boolean {
  try {
    return Deno.lstatSync(path).isSymlink;
  } catch {
    return false;
  }
}

export function readText(path: string): string {
  const text = Deno.readTextFileSync(path);
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function resolveForContainment(path: string): string {
  const absolute = resolve(path);
  try {
    return Deno.realPathSync(absolute);
  } catch {
    let cursor = absolute;
    const missing: string[] = [];
    while (true) {
      missing.unshift(basename(cursor));
      const parent = resolve(cursor, "..");
      if (parent === cursor) return absolute;
      try {
        return join(Deno.realPathSync(parent), ...missing);
      } catch {
        cursor = parent;
      }
    }
  }
}

export function relativeWithin(path: string, base: string): string {
  const candidate = resolveForContainment(path);
  const root = resolveForContainment(base);
  const result = relative(root, candidate);
  if (result === "" || /^\.\.(?:[\\/]|$)/.test(result) || isAbsolute(result)) {
    throw new ValueError(`${path} is not in the subpath of ${base}`);
  }
  return result;
}

export function sortPaths(paths: readonly string[]): string[] {
  return [...paths].sort();
}

/**
 * Every file and directory under `root`, sorted, excluding `root` itself.
 *
 * Symlinks are never followed or listed: a symlinked entry in a wiki input —
 * including one fetched by `wiki install` from a remote repo — must not let
 * `fmt`/`render` write through it, nor `build`/`export` read through it. That
 * is `@std/fs`'s `includeSymlinks: false` (`followSymlinks` already defaults to
 * false), so the tree walk is the standard one rather than a hand-rolled
 * recursion. Matches the asset walk's precedent.
 */
export function walkTree(root: string): string[] {
  const rootPath = normalize(root);
  const paths: string[] = [];
  for (const entry of walkSync(root, { includeSymlinks: false })) {
    // `walkSync` yields the root itself first; callers want descendants only.
    if (normalize(entry.path) === rootPath) continue;
    if (!entry.isFile && !entry.isDirectory) continue;
    paths.push(entry.path);
  }
  return sortPaths(paths);
}

export function sortedTreePaths(root: string): string[] {
  return walkTree(root);
}
