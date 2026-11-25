import { join, resolve as resolvePath } from "@std/path";
import { pathExists } from "../fspath.ts";
import { CONFIG_FILENAMES } from "../config.ts";
import { pathWithinRoot } from "../paths.ts";
import { describeValue } from "../describe.ts";
import {
  coerceSourceConfig,
  type LockedSource,
  lockfileTimestamp,
  type SourceConfig,
} from "../schemas/sources.ts";
import type { ValidationIssue } from "../schemas/validation.ts";
import { logger, OWNER_REPO_SHORTHAND } from "./basics.ts";
import { loadDataFile } from "./config_file.ts";

export function expandSourceUrl(url: string): string {
  const match = OWNER_REPO_SHORTHAND.exec(url);
  return match ? `https://github.com/${match[1]}/${match[2]}.git` : url;
}

export function parseUrlRef(url: string): [string, string | null] {
  const hash = url.lastIndexOf("#");
  if (hash < 0) return [url, null];
  return [url.slice(0, hash), url.slice(hash + 1) || null];
}

export function inferNameFromUrl(url: string): string {
  // Split on both separators. A source URL may be a local path, and on Windows
  // that path uses backslashes, so splitting on "/" alone returned the entire
  // path as the source name -- which then tripped `assertSafeSourceName` and
  // made `wiki install <local-path>` fail outright on Windows.
  const tail = url.replace(/[\\/]+$/, "").split(/[\\/]/).at(-1) ?? "";
  const stem = tail.replace(/(?:\.wiki|\.git)$/i, "");
  return stem || "source";
}

export function resolvedSourcePath(
  source: Pick<SourceConfig, "name" | "path">,
  repoDir: string,
): string {
  const base = source.path ? join(repoDir, source.path) : repoDir;
  if (!pathExists(base)) {
    throw new Error(
      `Source ${describeValue(source.name)}: path ${
        describeValue(source.path ?? null)
      } does not exist`,
    );
  }
  const resolved = resolvePath(base);
  // `path` comes from a *cloned remote repo's* config, so `../../..` — or a
  // symlink inside the clone pointing outside it — would escape the clone
  // dir into the victim's wiki inputs; reject it outright.
  if (!sourcePathWithinRepo(resolved, repoDir)) {
    throw new Error(
      `Source ${describeValue(source.name)}: path ${
        describeValue(source.path ?? null)
      } escapes the cloned repository`,
    );
  }
  return resolved;
}

/**
 * `true` when `resolved` is the repository root itself or a path inside it,
 * following symlinks. The root itself — selected by omitting `path`, or with
 * one that normalises to it such as `"."` — is allowed: `pathWithinRoot` is
 * strict and rejects the root, so the equality case is compared on
 * realpaths. A dangling symlink counts as escaping: there is nothing inside
 * the repo it can resolve to.
 */
function sourcePathWithinRepo(resolved: string, repoDir: string): boolean {
  let realRoot: string;
  let realResolved: string;
  try {
    realRoot = Deno.realPathSync(repoDir);
    realResolved = Deno.realPathSync(resolved);
  } catch {
    return false;
  }
  return realResolved === realRoot || pathWithinRoot(realResolved, realRoot);
}

export function discoverSources(repoDir: string): SourceConfig[] {
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

export function lockedSource(
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
