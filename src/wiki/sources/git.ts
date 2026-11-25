import { join } from "@std/path";
import { isDirectory, isSymlink, pathExists } from "../fspath.ts";
import { describeValue } from "../describe.ts";

interface GitResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

export function runGit(args: readonly string[], cwd?: string): GitResult {
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

export function gitDetails(result: GitResult): string {
  return [result.stderr.trim(), result.stdout.trim()].filter(Boolean).join(
    "\n",
  );
}

export function checkedGit(
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

export function removeTree(path: string): void {
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

export function resolveGitRef(ref: string, repoDir: string): string {
  const result = runGit(["rev-parse", ref], repoDir);
  if (result.code !== 0) {
    const details = gitDetails(result);
    throw new Error(
      `Failed to resolve git ref ${describeValue(ref)}${
        details ? `: ${details}` : ""
      }`,
    );
  }
  return result.stdout.trim();
}
