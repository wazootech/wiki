import { dirname, join } from "@std/path";
import { Config } from "../src/wiki/config.ts";

export function withTempDir(body: (root: string) => void): void {
  const root = Deno.makeTempDirSync({ prefix: "wiki-sources-" });
  try {
    body(root);
  } finally {
    Deno.removeSync(root, { recursive: true });
  }
}

export function git(args: string[], cwd: string): string {
  const result = new Deno.Command("git", {
    args,
    cwd: cwd,
    stdout: "piped",
    stderr: "piped",
  }).outputSync();
  const decoder = new TextDecoder();
  const stdout = decoder.decode(result.stdout);
  if (result.code !== 0) {
    throw new Error(decoder.decode(result.stderr) || stdout);
  }
  return stdout.trim();
}

export function initRepo(
  root: string,
  name: string,
  files: Record<string, string>,
): string {
  const repo = join(root, name);
  Deno.mkdirSync(repo, { recursive: true });
  git(["init", "--initial-branch=main"], repo);
  for (const [relative, content] of Object.entries(files)) {
    const file = join(repo, relative);
    Deno.mkdirSync(dirname(file), { recursive: true });
    Deno.writeTextFileSync(file, content);
  }
  git(["add", "."], repo);
  git([
    "-c",
    "user.name=Wiki Tests",
    "-c",
    "user.email=wiki-tests@example.invalid",
    "commit",
    "-m",
    "initial",
  ], repo);
  return repo;
}

export function commitFile(
  repo: string,
  relative: string,
  content: string,
): string {
  const file = join(repo, relative);
  Deno.writeTextFileSync(file, content);
  git(["add", relative], repo);
  git([
    "-c",
    "user.name=Wiki Tests",
    "-c",
    "user.email=wiki-tests@example.invalid",
    "commit",
    "-m",
    "update",
  ], repo);
  return git(["rev-parse", "HEAD"], repo);
}

export function rootConfig(
  root: string,
  sources: readonly { name: string; url: string }[] = [],
): Config {
  const entries = sources.map(({ name, url }) =>
    `  - name: ${name}\n    type: git\n    url: ${url}`
  );
  Deno.writeTextFileSync(
    join(root, "wiki.yml"),
    `wiki:\n  input: wiki\n${
      entries.length ? `sources:\n${entries.join("\n")}\n` : ""
    }`,
  );
  return Config.load(root);
}
