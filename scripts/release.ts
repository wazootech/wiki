import { dirname, fromFileUrl, join } from "@std/path";
import { currentVersion, updateVersions } from "./set_version.ts";

const ROOT = dirname(dirname(fromFileUrl(import.meta.url)));
const DOCS_TO_FORMAT = ["docs/wiki/wiki.md", "docs/wiki/wiki_render.md"];
const RELEASE_FILES = [
  "CHANGELOG.md",
  "deno.json",
  "docs/wiki/wiki.md",
  "docs/wiki/wiki_render.md",
  "package-lock.json",
  "package.json",
  "src/wiki/version.ts",
];

interface Options {
  bump: string;
  message: string;
  issue: string | undefined;
  push: boolean;
  watch: boolean;
  full: boolean;
  noCommit: boolean;
}

async function capture(args: string[]): Promise<string> {
  const [command, ...commandArgs] = args;
  if (command === undefined) throw new Error("Missing command");
  const result = await new Deno.Command(command, {
    args: commandArgs,
    cwd: ROOT,
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!result.success) {
    throw new Error(new TextDecoder().decode(result.stderr).trim());
  }
  return new TextDecoder().decode(result.stdout).trim();
}

async function run(args: string[], check = true): Promise<void> {
  const [command, ...commandArgs] = args;
  if (command === undefined) throw new Error("Missing command");
  console.log(`$ ${args.join(" ")}`);
  const status = await new Deno.Command(command, {
    args: commandArgs,
    cwd: ROOT,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  }).spawn().status;
  if (check && !status.success) {
    throw new Error(`Command failed (${status.code}): ${args.join(" ")}`);
  }
}

function nextVersion(current: string, bump: string): string {
  const parts = current.split(".").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) {
    throw new Error(`Current version is not X.Y.Z: ${current}`);
  }
  const [major, minor, patch] = parts as [number, number, number];
  if (bump === "major") return `${major + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  if (bump === "patch") return `${major}.${minor}.${patch + 1}`;
  if (/^\d+\.\d+\.\d+$/.test(bump)) return bump;
  throw new Error("version must be patch, minor, major, or X.Y.Z");
}

async function ensureCleanWorktree(): Promise<void> {
  if (await capture(["git", "status", "--short"])) {
    throw new Error(
      "Working tree must be clean before release. Commit or stash changes first.",
    );
  }
}

async function updateChangelog(
  version: string,
  message: string,
  issue?: string,
): Promise<void> {
  const path = join(ROOT, "CHANGELOG.md");
  const content = await Deno.readTextFile(path);
  if (content.includes(`## ${version} `)) {
    throw new Error(`CHANGELOG.md already contains ${version}`);
  }
  const issueSuffix = issue
    ? ` ([#${issue}](https://github.com/wazootech/wiki/issues/${issue}))`
    : "";
  const entry = `## ${version} — ${new Date().toISOString().slice(0, 10)}\n\n` +
    "### Fixed\n\n" +
    `- ${message.trim().replace(/\.+$/, "")}.${issueSuffix}\n\n`;
  const anchor = "## Unreleased\n\n";
  if (!content.includes(anchor)) {
    throw new Error("CHANGELOG.md has no '## Unreleased' section");
  }
  await Deno.writeTextFile(path, content.replace(anchor, `${anchor}${entry}`));
}

async function cli(args: string[]): Promise<void> {
  await run([Deno.execPath(), "run", "-A", "src/wiki/cli.ts", ...args]);
}

async function prepareRelease(
  version: string,
  message: string,
  issue?: string,
): Promise<void> {
  await updateVersions(version);
  await updateChangelog(version, message, issue);
  await cli(["-c", "docs/wiki.yml", "render"]);
  await cli(["-c", "docs/wiki.yml", "fmt", ...DOCS_TO_FORMAT]);
}

async function runChecks(full: boolean): Promise<void> {
  await run([Deno.execPath(), "task", "check"]);
  await run([Deno.execPath(), "task", "test"]);
  await run([Deno.execPath(), "task", "lint"]);
  await run([Deno.execPath(), "task", "fmt:check"]);
  await cli(["-c", "docs/wiki.yml", "fmt", "--check"]);
  await cli(["-c", "docs/wiki.yml", "lint", "--strict"]);
  await cli(["-c", "docs/wiki.yml", "check", "--strict"]);
  await cli(["-c", "docs/wiki.yml", "render", "--check"]);
  if (full) await run(["npm", "run", "test:npm"]);
}

async function commitTagPush(
  version: string,
  push: boolean,
  watch: boolean,
): Promise<void> {
  if (push) {
    const branch = await capture(["git", "branch", "--show-current"]);
    if (branch !== "main") {
      throw new Error(
        `Refusing to push release from branch '${branch}'; use main.`,
      );
    }
  }
  await run(["git", "add", ...RELEASE_FILES]);
  await run(["git", "commit", "-m", `chore: release v${version}`]);
  await run(["git", "tag", `v${version}`]);
  if (!push) return;
  await run(["git", "push", "origin", "main"]);
  await run(["git", "push", "origin", `v${version}`]);
  if (!watch) return;
  const runId = await capture([
    "gh",
    "run",
    "list",
    "--repo",
    "wazootech/wiki",
    "--workflow",
    "Release",
    "--branch",
    `v${version}`,
    "--limit",
    "1",
    "--json",
    "databaseId",
    "--jq",
    ".[0].databaseId",
  ]);
  if (runId) {
    await run([
      "gh",
      "run",
      "watch",
      runId,
      "--repo",
      "wazootech/wiki",
      "--exit-status",
    ], false);
  }
}

function parseArgs(args: string[]): Options {
  const bump = args[0];
  if (bump === undefined || bump.startsWith("-")) {
    throw new Error(
      "Usage: deno run -A scripts/release.ts <patch|minor|major|X.Y.Z> --message TEXT [--issue NUMBER] [--push] [--watch] [--full] [--no-commit]",
    );
  }
  let message: string | undefined;
  let issue: string | undefined;
  let push = false;
  let watch = false;
  let full = false;
  let noCommit = false;
  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--message") message = args[++index];
    else if (arg === "--issue") issue = args[++index];
    else if (arg === "--push") push = true;
    else if (arg === "--watch") watch = true;
    else if (arg === "--full") full = true;
    else if (arg === "--no-commit") noCommit = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (message === undefined || message.trim() === "") {
    throw new Error("--message is required and must not be empty");
  }
  if (issue !== undefined && !/^\d+$/.test(issue)) {
    throw new Error("--issue must be a numeric GitHub issue number");
  }
  if (push && noCommit) {
    throw new Error("--push cannot be used with --no-commit");
  }
  if (watch && !push) throw new Error("--watch requires --push");
  return { bump, message, issue, push, watch, full, noCommit };
}

async function main(args: string[]): Promise<void> {
  const options = parseArgs(args);
  await ensureCleanWorktree();
  const version = nextVersion(await currentVersion(), options.bump);
  await prepareRelease(version, options.message, options.issue);
  await runChecks(options.full);
  if (!options.noCommit) {
    await commitTagPush(version, options.push, options.watch);
  }
  console.log(`Prepared release v${version}`);
}

if (import.meta.main) {
  try {
    await main(Deno.args);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    Deno.exitCode = 1;
  }
}
