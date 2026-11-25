import { join } from "@std/path";
import { pathExists } from "../fspath.ts";
import type { Config } from "../config.ts";
import { describeValue } from "../describe.ts";
import { loadLockfile, saveLockfile } from "../schemas/sources.ts";
import {
  lockfilePath,
  logger,
  mutableLockfile,
  setLockedSource,
  sourceCacheDir,
} from "./basics.ts";
import { discoverSources, lockedSource } from "./source_urls.ts";
import { resolveGitRef } from "./git.ts";
import { cloneOrFetch, prepareRef } from "./clone.ts";
import { installTree } from "./install.ts";
import { reportOrphans } from "./orphans.ts";

export interface SourceUpdate {
  readonly name: string;
  readonly url: string;
  readonly previous_ref: string;
  readonly current_ref: string;
  readonly updated: boolean;
}

export interface UpdateResult {
  readonly updates: readonly SourceUpdate[];
  readonly count: number;
  readonly changed: readonly SourceUpdate[];
}

function updateResult(updates: SourceUpdate[]): UpdateResult {
  return {
    updates,
    get count() {
      return updates.length;
    },
    get changed() {
      return updates.filter((entry) => entry.updated);
    },
  };
}

/** Fetch declared sources and compare their current commits to `wiki.lock`. */
export function update(
  config: Config,
  name?: string | null,
  options: { readonly dry_run?: boolean } = {},
): UpdateResult {
  const dryRun = options.dry_run ?? false;
  const lockfile = mutableLockfile(loadLockfile(lockfilePath(config)));
  const updates: SourceUpdate[] = [];
  const sources = config.sources.filter((source) =>
    name == null || source.name === name
  );
  if (sources.length === 0) {
    if (name) {
      logger.warning(`Source ${describeValue(name)} not found in config file.`);
    }
    return updateResult(updates);
  }

  for (const source of sources) {
    const locked = lockfile.sources.get(source.name);
    if (!locked) {
      logger.warning(
        `Source ${
          describeValue(source.name)
        } is not locked. Run 'wiki install' first.`,
      );
      continue;
    }

    const repoDir = cloneOrFetch(source, sourceCacheDir(config, source.name));
    prepareRef(source, repoDir);
    const currentRef = resolveGitRef("HEAD", repoDir);
    const previousRef = locked.resolved_ref;
    const changed = currentRef !== previousRef;
    if (changed && !dryRun) {
      setLockedSource(
        lockfile,
        source.name,
        lockedSource(source, currentRef, locked.required_by),
      );
    }
    updates.push({
      name: source.name,
      url: source.url,
      previous_ref: previousRef.slice(0, 12),
      current_ref: currentRef.slice(0, 12),
      updated: changed,
    });
  }

  if (!dryRun) {
    if (updates.some((entry) => entry.updated)) {
      saveLockfile(lockfile, lockfilePath(config));
    }

    const beforeTransitive = JSON.stringify(
      [...lockfile.sources].map(([sourceName, source]) => [sourceName, source]),
    );
    const visited = new Set(lockfile.sources.keys());
    for (const source of config.sources) {
      const repoDir = join(sourceCacheDir(config, source.name), "repo");
      if (!pathExists(repoDir)) continue;
      const transitive = discoverSources(repoDir);
      if (transitive.length > 0) {
        installTree(config, transitive, lockfile, source.name, visited, []);
      }
    }
    const afterTransitive = JSON.stringify(
      [...lockfile.sources].map(([sourceName, source]) => [sourceName, source]),
    );
    if (beforeTransitive !== afterTransitive) {
      saveLockfile(lockfile, lockfilePath(config));
    }
    reportOrphans(config, lockfile);
  }

  return updateResult(updates);
}
