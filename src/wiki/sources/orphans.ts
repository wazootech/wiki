import { pathExists } from "../fspath.ts";
import type { Config } from "../config.ts";
import { describeValue } from "../describe.ts";
import type { Lockfile } from "../schemas/sources.ts";
import {
  deleteLockedSource,
  logger,
  type MutableLockfile,
  setLockedSource,
  sourceCacheDir,
} from "./basics.ts";
import { removeTree } from "./git.ts";

export function reportOrphans(config: Config, lockfile: Lockfile): void {
  const topLevel = new Set(config.sources.map((source) => source.name));
  for (const [name, entry] of lockfile.sources) {
    if (!topLevel.has(name) && entry.required_by.length > 0) {
      logger.warning(
        `Source ${describeValue(name)} (required_by=${
          describeValue(entry.required_by)
        }) may be orphaned. ` +
          `Run 'wiki remove ${name}' to clean up.`,
      );
    }
  }
}

export function removeOrphans(
  config: Config,
  lockfile: MutableLockfile,
  removedName: string,
): void {
  const topLevel = new Set(config.sources.map((source) => source.name));
  for (const [name, entry] of lockfile.sources) {
    if (entry.required_by.includes(removedName)) {
      setLockedSource(lockfile, name, {
        ...entry,
        required_by: entry.required_by.filter((parent) =>
          parent !== removedName
        ),
      });
    }
  }

  const orphaned = [...lockfile.sources]
    .filter(([name, entry]) =>
      entry.required_by.length === 0 && !topLevel.has(name)
    )
    .map(([name]) => name);
  for (const orphan of orphaned) {
    const cacheDir = sourceCacheDir(config, orphan);
    if (pathExists(cacheDir)) {
      removeTree(cacheDir);
      logger.debug(
        `Removed cache for orphaned transitive source ${describeValue(orphan)}`,
      );
    }
    deleteLockedSource(lockfile, orphan);
    logger.debug(
      `Removed orphaned transitive source ${
        describeValue(orphan)
      } from lockfile`,
    );
    removeOrphans(config, lockfile, orphan);
  }
}
