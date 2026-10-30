import { basename, dirname, join, resolve } from "@std/path";
import type { FilePlan } from "./plan_support.ts";

/** The filesystem calls a commit makes; injectable so tests can fail one. */
export interface CommitIo {
  writeFile(path: string, data: Uint8Array): void;
  rename(from: string, to: string): void;
  remove(path: string): void;
  mkdir(path: string): void;
}

const DENO_IO: CommitIo = {
  writeFile: (path, data) => Deno.writeFileSync(path, data),
  rename: (from, to) => Deno.renameSync(from, to),
  remove: (path) => Deno.removeSync(path),
  mkdir: (path) => Deno.mkdirSync(path, { recursive: true }),
};

/**
 * Write every staged file, or none of them.
 *
 * All new contents go to sibling temp files first, so the commit itself is
 * only renames (atomic per file on POSIX and, via `MoveFileExW` with
 * `REPLACE_EXISTING`, on Windows). Deletes go last because they are the one
 * step a rename cannot stage. If any step fails, what was done is undone in
 * reverse from the byte-exact pre-images, and the original error is rethrown.
 */
export function commitFiles(
  plans: readonly FilePlan[],
  io: CommitIo = DENO_IO,
): void {
  const token = crypto.randomUUID().slice(0, 8);
  const temps = new Map<FilePlan, string>();
  const done: FilePlan[] = [];
  // Directories this commit creates, so a rollback can take them away again.
  const createdDirs: string[] = [];
  try {
    for (const plan of plans) {
      if (plan.after === null) continue;
      for (const dir of missingAncestors(dirname(plan.path))) {
        if (!createdDirs.includes(dir)) createdDirs.push(dir);
      }
      io.mkdir(dirname(plan.path));
      const temp = join(
        dirname(plan.path),
        `.${basename(plan.path)}.${token}.wiki-edit.tmp`,
      );
      io.writeFile(temp, new TextEncoder().encode(plan.after));
      temps.set(plan, temp);
    }
    for (const [plan, temp] of temps) {
      io.rename(temp, plan.path);
      temps.delete(plan);
      done.push(plan);
    }
    for (const plan of plans) {
      if (plan.after !== null) continue;
      io.remove(plan.path);
      done.push(plan);
    }
  } catch (error) {
    for (const temp of temps.values()) {
      try {
        Deno.removeSync(temp);
      } catch {
        // A temp that was never written has nothing to clean up.
      }
    }
    for (const plan of done.reverse()) restore(plan);
    removeEmptyDirs(createdDirs);
    throw error;
  }
}

/** `dir` and its ancestors that do not exist yet, outermost first. */
function missingAncestors(dir: string): string[] {
  const missing: string[] = [];
  let cursor = resolve(dir);
  while (true) {
    try {
      Deno.statSync(cursor);
      break;
    } catch {
      missing.unshift(cursor);
    }
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return missing;
}

/**
 * Remove directories a failed commit created, deepest first, but only while
 * empty: anything another process put there in the meantime is not ours.
 */
function removeEmptyDirs(dirs: readonly string[]): void {
  const deepestFirst = [...dirs].sort((a, b) => b.length - a.length);
  for (const dir of deepestFirst) {
    try {
      Deno.removeSync(dir);
    } catch {
      // Not empty, or already gone: either way it is not ours to remove.
    }
  }
}

/** Put one file back exactly as it was before the edit. */
function restore(plan: FilePlan): void {
  if (plan.before === null) {
    Deno.removeSync(plan.path);
    return;
  }
  const temp = `${plan.path}.wiki-edit-restore.tmp`;
  Deno.writeFileSync(temp, plan.before);
  Deno.renameSync(temp, plan.path);
}
