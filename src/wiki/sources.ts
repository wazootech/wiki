/** External Git source lifecycle and lockfile resolution. */

import { join } from "@std/path";
import { errorText } from "./errors.ts";
import { pathExists } from "./fspath.ts";
import type { Config } from "./config.ts";
import { describeValue } from "./describe.ts";
import { loadLockfile, saveLockfile } from "./schemas/sources.ts";
import {
  assertSafeSourceName,
  deleteLockedSource,
  lockfilePath,
  logger,
  mutableLockfile,
  sourceCacheDir,
} from "./sources/basics.ts";
import { removeFromConfig } from "./sources/config_file.ts";
import { resolvedSourcePath } from "./sources/source_urls.ts";
import { removeTree } from "./sources/git.ts";
import { removeOrphans } from "./sources/orphans.ts";

export { install } from "./sources/install.ts";
export {
  type SourceUpdate,
  update,
  type UpdateResult,
} from "./sources/update.ts";

/** Remove a source and transitives no longer required by another source. */
export function remove(config: Config, name: string): void {
  assertSafeSourceName(name);
  const lockfile = mutableLockfile(loadLockfile(lockfilePath(config)));
  for (const sourceName of lockfile.sources.keys()) {
    assertSafeSourceName(sourceName);
  }

  const cacheDir = sourceCacheDir(config, name);
  if (pathExists(cacheDir)) {
    removeTree(cacheDir);
    logger.debug(`Removed cache for source ${describeValue(name)}`);
  }

  removeFromConfig(config, name);
  if (lockfile.sources.has(name)) {
    deleteLockedSource(lockfile, name);
    removeOrphans(config, lockfile, name);
    saveLockfile(lockfile, lockfilePath(config));
    logger.debug(`Removed lock entry for source ${describeValue(name)}`);
  }
}

/** Resolve locked sources to their existing local paths without fetching. */
export function resolve(config: Config): string[] {
  const lockfile = loadLockfile(lockfilePath(config));
  if (lockfile.sources.size === 0) return [];

  const resolved: string[] = [];
  for (const [name, locked] of lockfile.sources) {
    let repoDir: string;
    try {
      repoDir = join(sourceCacheDir(config, name), "repo");
    } catch (error) {
      logger.warning(String(error));
      continue;
    }
    if (!pathExists(repoDir)) {
      logger.warning(
        `Source '${name}' is not cached. Run 'wiki install' first.`,
      );
      continue;
    }

    try {
      resolved.push(resolvedSourcePath({ name, path: locked.path }, repoDir));
    } catch (error) {
      logger.warning(
        `Source '${name}': ${errorText(error)}`,
      );
    }
  }
  return resolved;
}
