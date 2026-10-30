import type { Config } from "../config.ts";
import { describeValue } from "../describe.ts";
import {
  emptyLockfile,
  loadLockfile,
  type Lockfile,
  saveLockfile,
  type SourceConfig,
} from "../schemas/sources.ts";
import {
  assertSafeSourceName,
  lockfilePath,
  logger,
  type MutableLockfile,
  mutableLockfile,
  setLockedSource,
  sourceCacheDir,
} from "./basics.ts";
import { addToConfig } from "./config_file.ts";
import {
  discoverSources,
  expandSourceUrl,
  inferNameFromUrl,
  lockedSource,
  parseUrlRef,
  resolvedSourcePath,
} from "./source_urls.ts";
import { resolveGitRef } from "./git.ts";
import { cloneOrFetch, prepareRef } from "./clone.ts";

export function installTree(
  config: Config,
  sources: readonly SourceConfig[],
  lockfile: MutableLockfile,
  parent: string | null,
  visited: Set<string>,
  path: readonly string[],
): void {
  for (const source of sources) {
    if (path.includes(source.name)) {
      throw new Error(
        `Circular dependency detected: ${[...path, source.name].join(" -> ")}`,
      );
    }

    if (visited.has(source.name)) {
      const existing = lockfile.sources.get(source.name);
      if (!existing) continue;
      if (
        existing.url !== source.url ||
        (existing.ref ?? null) !== (source.ref ?? null)
      ) {
        throw new Error(
          `Source ${describeValue(source.name)} conflict: already locked as ` +
            `${existing.url}@${existing.ref || "HEAD"}, but ${
              parent ?? "root"
            } ` +
            `declares ${source.url}@${source.ref || "HEAD"}`,
        );
      }
      if (parent !== null && !existing.required_by.includes(parent)) {
        setLockedSource(lockfile, source.name, {
          ...existing,
          required_by: [...existing.required_by, parent],
        });
      }
      continue;
    }

    visited.add(source.name);
    const cacheDir = sourceCacheDir(config, source.name);
    const repoDir = cloneOrFetch(source, cacheDir);
    prepareRef(source, repoDir);
    const resolvedRef = resolveGitRef("HEAD", repoDir);
    const resolvedPath = resolvedSourcePath(source, repoDir);
    setLockedSource(
      lockfile,
      source.name,
      lockedSource(source, resolvedRef, parent === null ? [] : [parent]),
    );
    logger.debug(
      `Locked source ${describeValue(source.name)} at ${
        resolvedRef.slice(0, 12)
      } -> ${resolvedPath}`,
    );

    const transitive = discoverSources(repoDir);
    if (transitive.length > 0) {
      installTree(config, transitive, lockfile, source.name, visited, [
        ...path,
        source.name,
      ]);
    }
  }
}

/** Fetch declared sources (or add and fetch one URL), then save `wiki.lock`. */
export function install(config: Config, url?: string | null): Lockfile {
  let sources = [...config.sources];
  if (url) {
    const [rawUrl, ref] = parseUrlRef(url);
    const expandedUrl = expandSourceUrl(rawUrl);
    const source: SourceConfig = {
      name: inferNameFromUrl(expandedUrl),
      type: "git",
      url: expandedUrl,
      ref,
      path: null,
    };
    assertSafeSourceName(source.name);
    addToConfig(config, source);
    sources = [...sources, source];
    const mutableConfig = config as unknown as {
      sources: readonly SourceConfig[];
    };
    mutableConfig.sources = sources;
  } else if (sources.length === 0) {
    logger.debug("No sources declared in config file.");
    return emptyLockfile();
  }

  const lockfile = mutableLockfile(loadLockfile(lockfilePath(config)));
  installTree(
    config,
    sources,
    lockfile,
    null,
    new Set(lockfile.sources.keys()),
    [],
  );
  saveLockfile(lockfile, lockfilePath(config));
  return lockfile;
}
