import { join } from "@std/path";
import { fromFileUrl } from "@std/path";

const CLI_ENTRY = fromFileUrl(new URL("../src/wiki/cli.ts", import.meta.url));
const DECODER = new TextDecoder();

interface CliResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Run the real CLI as a subprocess so the assertions cover the process
 * contract — exit code plus which stream the bytes land on — rather than just
 * the return value of `main()`.
 *
 * Output is compared with `\n`, not `\r\n`. The Python CLI writes CRLF on
 * Windows through text-mode stdout; the migration targets normalised output
 * rather than byte parity, for the reason recorded in
 * `CONTEXT.md`.
 */
export async function runCli(args: readonly string[]): Promise<CliResult> {
  return await runCliIn(args, undefined, []);
}

/**
 * Run the CLI in a working directory with the permissions a real run needs.
 *
 * The permission-free variant above is not incidental: `--version` and an
 * unknown command must work with *zero* permissions, which is why `cli.ts`
 * imports the wiki session dynamically — the RDF stack reads `process.env`
 * while it loads, so a static import would make even `wiki --version` need
 * `--allow-env`.
 */
export async function runCliIn(
  args: readonly string[],
  cwd: string | undefined,
  flags: readonly string[],
): Promise<CliResult> {
  const { code, stdout, stderr } = await new Deno.Command(Deno.execPath(), {
    args: ["run", "--quiet", ...flags, CLI_ENTRY, ...args],
    ...(cwd === undefined ? {} : { cwd }),
    stdout: "piped",
    stderr: "piped",
  }).output();
  return {
    code,
    stdout: DECODER.decode(stdout),
    stderr: DECODER.decode(stderr),
  };
}

// ---------------------------------------------------------------------------
// The audit commands, driven through the process contract
// ---------------------------------------------------------------------------

/** A wiki whose only findings are a broken wikilink and a missing layout. */
export function writeAuditCorpus(): string {
  const root = Deno.makeTempDirSync({ prefix: "wiki-cli-" });
  const wiki = join(root, "wiki");
  Deno.mkdirSync(wiki, { recursive: true });
  Deno.writeTextFileSync(
    join(root, "wiki.yml"),
    "wiki:\n  input: [wiki]\n",
  );
  Deno.writeTextFileSync(
    join(wiki, "Page.md"),
    "---\ntype: schema:WebPage\nwazoo:layout: layouts/missing.html\n---\n\nSee [[Missing]].\n",
  );
  return root;
}

export function removeCorpus(root: string): void {
  try {
    Deno.removeSync(root, { recursive: true });
  } catch {
    // Windows keeps a handle open long enough to lose this race occasionally.
  }
}

// ---------------------------------------------------------------------------
// The link command, driven through the process contract
// ---------------------------------------------------------------------------

/**
 * A wiki with one link opportunity (bare "Target Page" mention), one
 * repairable broken fragment (`#targt-page`), and one unrepairable broken
 * link. `standard` link style keeps the expected suggestion text stable.
 */
export function writeLinkCorpus(): string {
  const root = Deno.makeTempDirSync({ prefix: "wiki-cli-link-" });
  const wiki = join(root, "wiki");
  Deno.mkdirSync(wiki, { recursive: true });
  Deno.writeTextFileSync(
    join(root, "wiki.yml"),
    "wiki:\n  input: [wiki]\nlink:\n  style: standard\n",
  );
  Deno.writeTextFileSync(
    join(wiki, "Target_Page.md"),
    "---\ntitle: Target Page\n---\n\n# Target Page\n\nContent here.\n",
  );
  Deno.writeTextFileSync(
    join(wiki, "Source_Page.md"),
    "---\ntitle: Source Page\n---\n\n# Source Page\n\nSee Target Page for details.\n\n" +
      "A [frag](Target_Page.md#targt-page) link.\n",
  );
  return root;
}

export async function runLinkIn(
  args: readonly string[],
  root: string,
): Promise<CliResult> {
  return await runCliIn(["-c", "wiki.yml", "link", ...args], root, [
    "--allow-all",
  ]);
}

// ---------------------------------------------------------------------------
// The render command, driven through the process contract
// ---------------------------------------------------------------------------

/** Recursively copy a directory tree (fixture -> temp working copy). */
function copyDirSync(from: string, to: string): void {
  Deno.mkdirSync(to, { recursive: true });
  for (const entry of Deno.readDirSync(from)) {
    const source = join(from, entry.name);
    const target = join(to, entry.name);
    if (entry.isDirectory) {
      copyDirSync(source, target);
    } else if (entry.isFile) {
      Deno.copyFileSync(source, target);
    }
  }
}

/**
 * A working copy of the micro fixture, whose inline SPARQL blocks are
 * deliberately stale so `render --check` fails and `render` has work to do.
 */
export function writeRenderCorpus(): string {
  const root = Deno.makeTempDirSync({ prefix: "wiki-cli-render-" });
  const fixture = fromFileUrl(new URL("./fixtures/micro", import.meta.url));
  copyDirSync(fixture, root);
  return root;
}
