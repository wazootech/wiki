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
import { overlayKey, overlayStore, stagedEntry } from "./fspath/overlay.ts";

export {
  activeOverlay,
  type FileOverlay,
  fileStat,
  IS_WINDOWS,
  isDirectory,
  isFile,
  isSymlink,
  overlayKey,
  pathExists,
  readText,
  withOverlay,
} from "./fspath/overlay.ts";

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
  let onDisk = true;
  try {
    Deno.statSync(root);
  } catch {
    // A directory that exists only in the overlay has nothing on disk to walk.
    onDisk = false;
  }
  if (onDisk) {
    for (const entry of walkSync(root, { includeSymlinks: false })) {
      // `walkSync` yields the root itself first; callers want descendants only.
      if (normalize(entry.path) === rootPath) continue;
      if (!entry.isFile && !entry.isDirectory) continue;
      if (stagedEntry(entry.path) === null) continue;
      paths.push(entry.path);
    }
  }
  return sortPaths(withStagedPaths(root, paths));
}

/**
 * Add the overlay's created files under `root`, and their new parent
 * directories, spelled the way `walkSync` spells paths (`join(root, rel)`), so
 * route and manifest code cannot tell a staged page from one on disk.
 */
function withStagedPaths(root: string, paths: string[]): string[] {
  const overlay = overlayStore.getStore();
  if (overlay === undefined) return paths;
  const rootKey = overlayKey(root);
  const seen = new Set(paths.map(overlayKey));
  const out = [...paths];
  for (const [key, text] of overlay.files) {
    if (text === null || !key.startsWith(rootKey + SEPARATOR)) continue;
    const parts = relative(rootKey, key).split(SEPARATOR);
    for (let depth = 1; depth <= parts.length; depth++) {
      const candidate = join(root, ...parts.slice(0, depth));
      const candidateKey = overlayKey(candidate);
      if (seen.has(candidateKey)) continue;
      seen.add(candidateKey);
      out.push(candidate);
    }
  }
  return out;
}

export function sortedTreePaths(root: string): string[] {
  return walkTree(root);
}
