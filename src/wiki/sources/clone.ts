import { join } from "@std/path";
import { pathExists } from "../fspath.ts";
import { describeValue } from "../describe.ts";
import type { SourceConfig } from "../schemas/sources.ts";
import { assertSafeSourceName, FULL_SHA } from "./basics.ts";
import { checkedGit, gitDetails, removeTree, runGit } from "./git.ts";

export function cloneOrFetch(source: SourceConfig, cacheDir: string): string {
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

export function prepareRef(source: SourceConfig, repoDir: string): void {
  if (source.ref !== null && source.ref !== undefined) {
    checkedGit(
      ["checkout", source.ref, "--"],
      repoDir,
      `Failed to check out ref ${describeValue(source.ref)} for ${source.url}`,
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
