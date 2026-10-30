import { join } from "@std/path";
import { pathExists } from "../fspath.ts";
import { ValueError } from "../errors.ts";
import { normalizeBaseIri } from "../schemas/wiki_config.ts";
import { decoder } from "./options.ts";
import { normalizeBaseUrl } from "./normalize.ts";

export function parseGithubRepo(value: string): [string, string] {
  const text = value.trim();
  const patterns = [
    /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i,
    /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i,
    /^([^/]+)\/([^/]+?)(?:\.git)?\/?$/,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) return [match[1]!, match[2]!];
  }
  throw new ValueError(
    `Invalid GitHub repo: ${
      JSON.stringify(value)
    } (expected owner/repo, https://github.com/owner/repo, or git@github.com:owner/repo.git)`,
  );
}

export function inferGithubPagesUrls(
  owner: string,
  repo: string,
): [string, string] {
  return [
    normalizeBaseIri(`https://${owner}.github.io/${repo}`),
    normalizeBaseUrl(`/${repo}`),
  ];
}

function runGit(
  args: string[],
  cwd: string,
): { code: number; stdout: string; stderr: string } {
  const output = new Deno.Command("git", {
    args,
    cwd,
    stdout: "piped",
    stderr: "piped",
  }).outputSync();
  return {
    code: output.code,
    stdout: decoder.decode(output.stdout),
    stderr: decoder.decode(output.stderr),
  };
}

export function detectOriginRepo(cwd: string): string | null {
  const root = cwd;
  if (!pathExists(join(root, ".git"))) return null;
  let output: ReturnType<typeof runGit>;
  try {
    output = runGit(["remote", "get-url", "origin"], root);
  } catch {
    return null;
  }
  const remote = output.stdout.trim();
  if (output.code !== 0 || remote === "") return null;
  try {
    return parseGithubRepo(remote).join("/");
  } catch {
    return null;
  }
}

export function defaultGitRunner(
  cwd: string,
): { code: number; stderr: string } {
  const result = runGit(["init"], cwd);
  return { code: result.code, stderr: result.stderr };
}
