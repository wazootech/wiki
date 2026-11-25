import { dirname, fromFileUrl, join } from "@std/path";
import type { DerivedMetadata } from "../src/wiki/derived.ts";
import { Config } from "../src/wiki/config.ts";
import { documentDataFromPath } from "../src/wiki/parser.ts";
import type { Wiki } from "../src/wiki/wiki.ts";

const CLI_ENTRY = fromFileUrl(new URL("../src/wiki/cli.ts", import.meta.url));
const DECODER = new TextDecoder();
export const SCHEMA = "https://schema.org/";

export function tempRoot(): string {
  return Deno.makeTempDirSync({ prefix: "wiki-derived-" });
}

export function cleanup(root: string): void {
  try {
    Deno.removeSync(root, { recursive: true });
  } catch {
    // Windows keeps a handle open long enough to lose this race occasionally.
  }
}

export function write(root: string, relative: string, content: string): string {
  const path = join(root, ...relative.split("/"));
  Deno.mkdirSync(dirname(path), { recursive: true });
  Deno.writeTextFileSync(path, content);
  return path;
}

export function git(
  root: string,
  args: readonly string[],
  date?: string,
): void {
  const env: Record<string, string> = {
    GIT_AUTHOR_NAME: "Wiki Tests",
    GIT_AUTHOR_EMAIL: "wiki-tests@example.invalid",
    GIT_COMMITTER_NAME: "Wiki Tests",
    GIT_COMMITTER_EMAIL: "wiki-tests@example.invalid",
  };
  if (date !== undefined) {
    env.GIT_AUTHOR_DATE = date;
    env.GIT_COMMITTER_DATE = date;
  }
  const result = new Deno.Command("git", {
    args: ["-c", "commit.gpgsign=false", ...args],
    cwd: root,
    env,
    stdout: "piped",
    stderr: "piped",
  }).outputSync();
  if (result.code !== 0) {
    throw new Error(DECODER.decode(result.stderr));
  }
}

export function commit(root: string, message: string, date: string): void {
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", message], date);
}

/** A wiki at `root` whose pages live in `wiki/`, inside a fresh repository. */
export function gitWiki(lint = ""): string {
  const root = tempRoot();
  write(root, "wiki.yml", `wiki:\n  input: [wiki]\n${lint}`);
  git(root, ["init", "-q", "--initial-branch=main"]);
  return root;
}

export const NOTHING: DerivedMetadata = {
  headline: null,
  dateCreated: null,
  dateModified: null,
  dateSource: null,
};

export async function runCli(
  root: string,
  args: readonly string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  const { code, stdout, stderr } = await new Deno.Command(Deno.execPath(), {
    args: ["run", "--quiet", "--allow-all", CLI_ENTRY, ...args],
    cwd: root,
    stdout: "piped",
    stderr: "piped",
  }).output();
  return {
    code,
    stdout: DECODER.decode(stdout),
    stderr: DECODER.decode(stderr),
  };
}

/** Every file's bytes and mtime under `dir`, for a "nothing was written" check. */
export function snapshot(dir: string): Map<string, string> {
  const files = new Map<string, string>();
  const walk = (current: string) => {
    for (const entry of Deno.readDirSync(current)) {
      const path = join(current, entry.name);
      if (entry.isDirectory) {
        walk(path);
      } else {
        const stat = Deno.statSync(path);
        files.set(
          path,
          `${stat.mtime?.getTime()}:${
            Array.from(Deno.readFileSync(path)).join(",")
          }`,
        );
      }
    }
  };
  walk(dir);
  return files;
}

// ---------------------------------------------------------------------------
// The graph
// ---------------------------------------------------------------------------

export function objects(
  graph: Awaited<ReturnType<Wiki["graph"]>>,
  subject: string,
  predicate: string,
): Array<{ value: string; datatype: string | undefined }> {
  return [...graph.match(
    { termType: "NamedNode", value: subject } as never,
    { termType: "NamedNode", value: predicate } as never,
    null,
  )].map((quad) => ({
    value: quad.object.value,
    datatype: quad.object.termType === "Literal"
      ? quad.object.datatype.value
      : undefined,
  }));
}

// ---------------------------------------------------------------------------
// Redundancy
// ---------------------------------------------------------------------------

export function config(): Config {
  return new Config({ wiki: { input: ["wiki"] }, config_root: "." });
}

export function dataOf(frontmatter: string): Record<string, unknown> {
  const root = tempRoot();
  try {
    return documentDataFromPath(
      write(root, "Page.md", `---\n${frontmatter}---\n\n# Ignored\n`),
    )!;
  } finally {
    cleanup(root);
  }
}

export const DERIVED: DerivedMetadata = {
  headline: "Title",
  dateCreated: "2026-01-01T21:34:05Z",
  dateModified: "2026-03-04T10:00:00Z",
  dateSource: "git",
};

// ---------------------------------------------------------------------------
// `wiki export` and `wiki file show`
// ---------------------------------------------------------------------------

/** One derived page and one whose frontmatter overrides the headline. */
export function exportWiki(): string {
  const root = gitWiki();
  write(root, "wiki/Page.md", "---\ntype: Article\n---\n\n# Page Title\n");
  write(
    root,
    "wiki/Chosen.md",
    "---\ntype: Article\nheadline: Chosen\n---\n\n# Derived\n",
  );
  commit(root, "create", "2026-02-03T04:05:06Z");
  return root;
}
