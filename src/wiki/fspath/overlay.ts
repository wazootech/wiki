import { AsyncLocalStorage } from "node:async_hooks";
import { resolve, SEPARATOR } from "@std/path";

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
export const overlayStore = new AsyncLocalStorage<FileOverlay>();

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
export function stagedEntry(path: string): string | null | undefined {
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
