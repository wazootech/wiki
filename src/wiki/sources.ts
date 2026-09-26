/** External Git source lifecycle and lockfile resolution. */

import { basename, extname, join, resolve as resolvePath } from "@std/path";
import { isDirectory, isSymlink, pathExists } from "./fspath.ts";
import { parse as parseToml } from "@std/toml";
import { parse as parseYaml } from "@std/yaml";
import { isSeq, parseDocument } from "yaml";
import { type Config, CONFIG_FILENAMES } from "./config.ts";

import { getLogger } from "./logging.ts";
import { readTextTolerant } from "./parser.ts";
import { pyRepr } from "./pyrepr.ts";
import {
  coerceSourceConfig,
  emptyLockfile,
  loadLockfile,
  type LockedSource,
  type Lockfile,
  LOCKFILE_FILENAME,
  lockfileTimestamp,
  saveLockfile,
  type SourceConfig,
} from "./schemas/sources.ts";
import type { ValidationIssue } from "./schemas/validation.ts";

type MutableLockfile = Omit<Lockfile, "sources"> & {
  readonly sources: Map<string, LockedSource>;
};

function mutableLockfile(lockfile: Lockfile): MutableLockfile {
  return { ...lockfile, sources: new Map(lockfile.sources) };
}

const logger = getLogger("wiki.sources");
const OWNER_REPO_SHORTHAND =
  /^([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+?)(?:\.git)?$/;
const FULL_SHA = /^[0-9a-f]{40}$/;

function lockfilePath(config: Config): string {
  return join(config.config_root, LOCKFILE_FILENAME);
}

function setLockedSource(
  lockfile: MutableLockfile,
  name: string,
  source: LockedSource,
): void {
  lockfile.sources.set(name, source);
}

function deleteLockedSource(lockfile: MutableLockfile, name: string): void {
  lockfile.sources.delete(name);
}

function sourceRoot(config: Config): string {
  return join(config.config_root, ".wiki", "sources");
}

function assertSafeSourceName(name: string): void {
  if (!name || name === "." || name === ".." || /[\\/]/.test(name)) {
    throw new Error(`Unsafe source name ${pyRepr(name)}`);
  }
}

function sourceCacheDir(config: Config, sourceName: string): string {
  assertSafeSourceName(sourceName);
  return join(sourceRoot(config), sourceName);
}

function configPath(config: Config): string {
  for (const name of CONFIG_FILENAMES) {
    const candidate = join(config.config_root, name);
    if (pathExists(candidate)) return candidate;
  }
  return join(config.config_root, "wiki.yml");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function loadDataFile(path: string): Record<string, unknown> {
  const raw = readTextTolerant(path);
  let data: unknown;
  if (extname(path).toLowerCase() === ".json") data = JSON.parse(raw);
  else if (extname(path).toLowerCase() === ".toml") data = parseToml(raw);
  else data = parseYaml(raw);
  if (!isRecord(data)) {
    throw new Error(`${basename(path)}: top-level content must be a mapping`);
  }
  return data;
}

function requireYamlConfig(path: string): void {
  if (extname(path).toLowerCase() === ".toml") {
    throw new Error(
      "Source management requires a YAML config file. " +
        "Edit wiki.toml manually or use wiki.yml for source management.",
    );
  }
}

function writeYamlConfig(path: string, data: Record<string, unknown>): void {
  const source = readTextTolerant(path);
  const document = parseDocument(source, { uniqueKeys: true });
  if (document.errors.length > 0) {
    throw new Error(
      `${basename(path)}: ${
        document.errors.map((error) => error.message).join("; ")
      }`,
    );
  }

  const nextSources = data["sources"];
  const currentSources = document.get("sources", true);
  if (nextSources === undefined) {
    document.delete("sources");
  } else if (isSeq(currentSources) && Array.isArray(nextSources)) {
    const previous = currentSources.toJSON() as unknown[];
    if (nextSources.length === previous.length + 1) {
      const names = new Set(
        previous.filter(isRecord).map((entry) => entry["name"]),
      );
      const added = nextSources.find((entry) =>
        isRecord(entry) && !names.has(entry["name"])
      );
      if (added === undefined) document.set("sources", nextSources);
      else currentSources.add(added);
    } else if (nextSources.length === previous.length - 1) {
      const names = new Set(
        nextSources.filter(isRecord).map((entry) => entry["name"]),
      );
      const removedIndex = previous.findIndex((entry) =>
        isRecord(entry) && !names.has(entry["name"])
      );
      if (removedIndex < 0) document.set("sources", nextSources);
      else currentSources.items.splice(removedIndex, 1);
    } else {
      document.set("sources", nextSources);
    }
  } else {
    document.set("sources", nextSources);
  }

  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const serialized = document.toString({
    flowCollectionPadding: false,
    lineWidth: 0,
  });
  Deno.writeTextFileSync(
    path,
    newline === "\n" ? serialized : serialized.replaceAll("\n", newline),
  );
}

function addToConfig(config: Config, source: SourceConfig): void {
  const path = configPath(config);
  requireYamlConfig(path);
  if (!pathExists(path)) throw new Error("No wiki config file found");

  const data = loadDataFile(path);
  const rawSources = data["sources"];
  const sources = rawSources == null ? [] : rawSources;
  if (!Array.isArray(sources)) {
    throw new Error("sources must be a list in the config file");
  }
  for (const existing of sources) {
    if (isRecord(existing) && existing["name"] === source.name) {
      throw new Error(
        `Source ${pyRepr(source.name)} already exists in the config file`,
      );
    }
  }

  const entry: Record<string, unknown> = {
    name: source.name,
    type: "git",
    url: source.url,
  };
  if (source.ref) entry["ref"] = source.ref;
  if (source.path) entry["path"] = source.path;
  sources.push(entry);
  data["sources"] = sources;
  writeYamlConfig(path, data);
}

function removeFromConfig(config: Config, name: string): void {
  const path = configPath(config);
  requireYamlConfig(path);
  if (!pathExists(path)) return;

  const data = loadDataFile(path);
  const sources = data["sources"];
  if (!Array.isArray(sources)) return;

  const remaining = sources.filter((entry) =>
    !(isRecord(entry) && entry["name"] === name)
  );
  if (remaining.length === sources.length) {
    throw new Error(`Source ${pyRepr(name)} not found in config file`);
  }
  if (remaining.length > 0) data["sources"] = remaining;
  else delete data["sources"];
  writeYamlConfig(path, data);
}

function expandSourceUrl(url: string): string {
  const match = OWNER_REPO_SHORTHAND.exec(url);
  return match ? `https://github.com/${match[1]}/${match[2]}.git` : url;
}

function parseUrlRef(url: string): [string, string | null] {
  const hash = url.lastIndexOf("#");
  if (hash < 0) return [url, null];
  return [url.slice(0, hash), url.slice(hash + 1) || null];
}

function inferNameFromUrl(url: string): string {
  const tail = url.replace(/\/+$/, "").split("/").at(-1) ?? "";
  const stem = tail.replace(/(?:\.wiki|\.git)$/i, "");
  return stem || "source";
}

interface GitResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

function runGit(args: readonly string[], cwd?: string): GitResult {
  const command = new Deno.Command("git", {
    args: [...args],
    ...(cwd === undefined ? {} : { cwd: cwd }),
    stdout: "piped",
    stderr: "piped",
  });
  const result = command.outputSync();
  const decoder = new TextDecoder();
  return {
    code: result.code,
    stdout: decoder.decode(result.stdout),
    stderr: decoder.decode(result.stderr),
  };
}

function gitDetails(result: GitResult): string {
  return [result.stderr.trim(), result.stdout.trim()].filter(Boolean).join(
    "\n",
  );
}

function checkedGit(
  args: readonly string[],
  cwd: string,
  message: string,
): GitResult {
  const result = runGit(args, cwd);
  if (result.code !== 0) {
    const details = gitDetails(result);
    throw new Error(details ? `${message}: ${details}` : message);
  }
  return result;
}

function removeTree(path: string): void {
  if (!pathExists(path)) return;
  try {
    Deno.removeSync(path, { recursive: true });
  } catch (firstError) {
    const makeWritable = (entry: string): void => {
      if (isSymlink(entry)) return;
      if (isDirectory(entry)) {
        for (const child of Deno.readDirSync(entry)) {
          makeWritable(join(entry, child.name));
        }
      }
      try {
        const mode = Deno.statSync(entry).mode;
        if (mode !== null) Deno.chmodSync(entry, mode | 0o200);
      } catch {
        throw firstError;
      }
    };
    makeWritable(path);
    Deno.removeSync(path, { recursive: true });
  }
}

function cloneOrFetch(source: SourceConfig, cacheDir: string): string {
  assertSafeSourceName(source.name);
  const repoDir = join(cacheDir, "repo");
  if (pathExists(repoDir)) {
    const remote = runGit(["remote", "get-url", "origin"], repoDir);
    if (remote.code === 0 && remote.stdout.trim() !== source.url) {
      checkedGit(
        ["remote", "set-url", "origin", source.url],
        repoDir,
        `Failed to update remote URL for ${source.name}`,
      );
    }

    const detach = runGit(["checkout", "--detach"], repoDir);
    if (detach.code !== 0) {
      const details = gitDetails(detach);
      throw new Error(
        details
          ? `Failed to prepare ${source.url}: ${details}`
          : `Failed to prepare ${source.url}`,
      );
    }

    const fetch = runGit([
      "fetch",
      "--tags",
      "--force",
      "origin",
      "+refs/heads/*:refs/heads/*",
    ], repoDir);
    if (fetch.code !== 0) {
      const details = gitDetails(fetch);
      throw new Error(
        details
          ? `Failed to fetch ${source.url}: ${details}`
          : `Failed to fetch ${source.url}`,
      );
    }

    if (source.ref && FULL_SHA.test(source.ref)) {
      const shallow = runGit(["rev-parse", "--is-shallow-repository"], repoDir);
      if (shallow.stdout.trim() === "true") {
        checkedGit(
          ["fetch", "--unshallow", "origin"],
          repoDir,
          `Failed to fetch full history for ${source.url}`,
        );
      }
    }
    return repoDir;
  }

  Deno.mkdirSync(cacheDir, { recursive: true });
  const depth = source.ref && FULL_SHA.test(source.ref) ? [] : ["--depth", "1"];
  const clone = runGit(["clone", ...depth, source.url, repoDir]);
  if (clone.code !== 0) {
    removeTree(cacheDir);
    const details = gitDetails(clone);
    throw new Error(
      details
        ? `Failed to clone ${source.url}: ${details}`
        : `Failed to clone ${source.url}`,
    );
  }
  return repoDir;
}

function prepareRef(source: SourceConfig, repoDir: string): void {
  if (source.ref !== null && source.ref !== undefined) {
    checkedGit(
      ["checkout", source.ref, "--"],
      repoDir,
      `Failed to check out ref ${pyRepr(source.ref)} for ${source.url}`,
    );
    return;
  }

  const branch = runGit(["rev-parse", "--abbrev-ref", "HEAD"], repoDir);
  if (branch.stdout.trim() !== "HEAD") return;

  const symbolic = runGit(
    ["symbolic-ref", "refs/remotes/origin/HEAD"],
    repoDir,
  );
  if (symbolic.code === 0) {
    const defaultBranch = symbolic.stdout.trim().replace(
      /^refs\/remotes\/origin\//,
      "",
    );
    checkedGit(
      ["checkout", defaultBranch, "--"],
      repoDir,
      `Failed to check out default branch ${defaultBranch}`,
    );
    return;
  }

  const remoteBranches = runGit(["branch", "-r"], repoDir);
  if (remoteBranches.code !== 0) return;
  const refs = remoteBranches.stdout.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("origin/"))
    .map((line) => line.slice("origin/".length));
  const fallback = refs.find((ref) => ref === "main") ??
    refs.find((ref) => ref === "master") ?? refs[0];
  if (fallback) {
    checkedGit(
      ["checkout", fallback, "--"],
      repoDir,
      `Failed to check out default branch ${fallback}`,
    );
  }
}

function resolveGitRef(ref: string, repoDir: string): string {
  const result = runGit(["rev-parse", ref], repoDir);
  if (result.code !== 0) {
    const details = gitDetails(result);
    throw new Error(
      `Failed to resolve git ref ${pyRepr(ref)}${
        details ? `: ${details}` : ""
      }`,
    );
  }
  return result.stdout.trim();
}

function resolvedSourcePath(
  source: Pick<SourceConfig, "name" | "path">,
  repoDir: string,
): string {
  const base = source.path ? join(repoDir, source.path) : repoDir;
  if (!pathExists(base)) {
    throw new Error(
      `Source ${pyRepr(source.name)}: path ${
        pyRepr(source.path ?? null)
      } does not exist`,
    );
  }
  return resolvePath(base);
}

function discoverSources(repoDir: string): SourceConfig[] {
  for (const name of CONFIG_FILENAMES) {
    const path = join(repoDir, name);
    if (!pathExists(path)) continue;
    try {
      const data = loadDataFile(path);
      const rawSources = data["sources"];
      if (!Array.isArray(rawSources)) return [];
      const sources: SourceConfig[] = [];
      for (const [index, raw] of rawSources.entries()) {
        const issues: ValidationIssue[] = [];
        const source = coerceSourceConfig(raw, ["sources", index], issues);
        if (issues.length > 0) {
          logger.warning(
            `Skipping invalid source entry in ${path}: ${
              issues.map((issue) => issue.msg).join("; ")
            }`,
          );
          continue;
        }
        sources.push(source);
      }
      return sources;
    } catch (error) {
      logger.warning(`Failed to read sources from ${path}: ${String(error)}`);
      return [];
    }
  }
  return [];
}

function lockedSource(
  source: SourceConfig,
  resolvedRef: string,
  requiredBy: readonly string[] = [],
): LockedSource {
  return {
    url: source.url,
    resolved_ref: resolvedRef,
    ref: source.ref ?? null,
    path: source.path ?? null,
    fetched_at: lockfileTimestamp(),
    required_by: [...requiredBy],
  };
}

function installTree(
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
          `Source ${pyRepr(source.name)} conflict: already locked as ` +
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
      `Locked source ${pyRepr(source.name)} at ${
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

function reportOrphans(config: Config, lockfile: Lockfile): void {
  const topLevel = new Set(config.sources.map((source) => source.name));
  for (const [name, entry] of lockfile.sources) {
    if (!topLevel.has(name) && entry.required_by.length > 0) {
      logger.warning(
        `Source ${pyRepr(name)} (required_by=${
          pyRepr(entry.required_by)
        }) may be orphaned. ` +
          `Run 'wiki remove ${name}' to clean up.`,
      );
    }
  }
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
      logger.warning(`Source ${pyRepr(name)} not found in config file.`);
    }
    return updateResult(updates);
  }

  for (const source of sources) {
    const locked = lockfile.sources.get(source.name);
    if (!locked) {
      logger.warning(
        `Source ${
          pyRepr(source.name)
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

function removeOrphans(
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
        `Removed cache for orphaned transitive source ${pyRepr(orphan)}`,
      );
    }
    deleteLockedSource(lockfile, orphan);
    logger.debug(
      `Removed orphaned transitive source ${pyRepr(orphan)} from lockfile`,
    );
    removeOrphans(config, lockfile, orphan);
  }
}

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
    logger.debug(`Removed cache for source ${pyRepr(name)}`);
  }

  removeFromConfig(config, name);
  if (lockfile.sources.has(name)) {
    deleteLockedSource(lockfile, name);
    removeOrphans(config, lockfile, name);
    saveLockfile(lockfile, lockfilePath(config));
    logger.debug(`Removed lock entry for source ${pyRepr(name)}`);
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
        `Source '${name}': ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  return resolved;
}
