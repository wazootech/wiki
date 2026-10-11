import { AsyncLocalStorage } from "node:async_hooks";
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

/**
 * Staged file contents that reads see in place of the disk.
 *
 * `wiki edit` validates a change before writing it, and the validator is the
 * ordinary `check`/`lint` pipeline. Rather than copy the wiki to a temp
 * directory, the edit stages its new contents here and every read below
 * consults them first, so `check` sees the proposed tree with no writes at all.
 * Keys are {@link overlayKey}s; `null` means the file is staged as deleted.
 */
export interface FileOverlay {
  /** Unique per edit, so a graph cached for one staged tree never serves another. */
  readonly id: string;
  readonly files: ReadonlyMap<string, string | null>;
}

// `AsyncLocalStorage`, not a module variable: `check` awaits throughout, and a
// long-lived process (`serve`, `mcp`) may validate one edit while answering an
// unrelated request. Each sees only the overlay its own call chain installed.
const overlayStore = new AsyncLocalStorage<FileOverlay>();

/** Run `fn` with reads resolved through `overlay`. */
export function withOverlay<T>(overlay: FileOverlay, fn: () => T): T {
  return overlayStore.run(overlay, fn);
}

/** The overlay installed for the current call chain, if any. */
export function activeOverlay(): FileOverlay | undefined {
  return overlayStore.getStore();
}

/** The key a path is staged under: absolute and separator-normalized. */
export function overlayKey(path: string): string {
  return resolve(path);
}

/** The staged entry for `path`: text, `null` (deleted), or `undefined` (not staged). */
function stagedEntry(path: string): string | null | undefined {
  const overlay = overlayStore.getStore();
  if (overlay === undefined) return undefined;
  return overlay.files.get(overlayKey(path));
}

/** Whether a staged (not deleted) file sits somewhere under directory `path`. */
function stagedUnder(path: string): boolean {
  const overlay = overlayStore.getStore();
  if (overlay === undefined) return false;
  const prefix = overlayKey(path) + SEPARATOR;
  for (const [key, text] of overlay.files) {
    if (text !== null && key.startsWith(prefix)) return true;
  }
  return false;
}

export function pathExists(path: string): boolean {
  const staged = stagedEntry(path);
  if (staged !== undefined) return staged !== null;
  if (stagedUnder(path)) return true;
  try {
    Deno.lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

export function isFile(path: string): boolean {
  const staged = stagedEntry(path);
  if (staged !== undefined) return staged !== null;
  try {
    return Deno.statSync(path).isFile;
  } catch {
    return false;
  }
}

export function isDirectory(path: string): boolean {
  if (stagedEntry(path) !== undefined) return false;
  if (stagedUnder(path)) return true;
  try {
    return Deno.statSync(path).isDirectory;
  } catch {
    return false;
  }
}

export function isSymlink(path: string): boolean {
  if (stagedEntry(path) !== undefined) return false;
  try {
    return Deno.lstatSync(path).isSymlink;
  } catch {
    return false;
  }
}

export function readText(path: string): string {
  const staged = stagedEntry(path);
  if (staged === null) {
    throw new Deno.errors.NotFound(`No such file (staged as deleted): ${path}`);
  }
  const text = staged ?? Deno.readTextFileSync(path);
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

/**
 * Size and modification time of a file, as the graph cache fingerprints it.
 *
 * A staged file reports its encoded size and an mtime of `0`; the cache also
 * keys on the overlay's id (see `wikiFingerprint`), so the zero mtime can never
 * collide with a real file's entry.
 */
export function fileStat(path: string): { size: number; mtimeMs: number } {
  const staged = stagedEntry(path);
  if (staged !== undefined && staged !== null) {
    return { size: new TextEncoder().encode(staged).byteLength, mtimeMs: 0 };
  }
  const stat = Deno.statSync(path);
  return {
    size: stat.size,
    mtimeMs: stat.mtime === null ? 0 : stat.mtime.getTime(),
  };
}

export function sortedTreePaths(root: string): string[] {
  return walkTree(root);
}
