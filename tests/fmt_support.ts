import { dirname, join } from "@std/path";
import { fromFileUrl } from "@std/path";
import { BOM } from "../src/wiki/parser.ts";

const CLI_ENTRY = fromFileUrl(new URL("../src/wiki/cli.ts", import.meta.url));
const DECODER = new TextDecoder();

/** A unique temp directory, to be removed with {@link cleanup}. */
export function tempRoot(): string {
  return Deno.makeTempDirSync({ prefix: "wiki-fmt-" });
}

export function cleanup(root: string): void {
  try {
    Deno.removeSync(root, { recursive: true });
  } catch {
    // Windows keeps a handle open long enough to lose this race occasionally.
  }
}

/** Write a file below `root`, creating parent directories. */
export function write(
  root: string,
  relative: string,
  content: string,
  options: { readonly bom?: boolean } = {},
): string {
  const target = join(root, ...relative.split("/"));
  Deno.mkdirSync(dirname(target), { recursive: true });
  Deno.writeTextFileSync(
    target,
    options.bom ? BOM + content : content,
  );
  return target;
}

/**
 * A wiki root whose pages are the markdown files beside its config.
 *
 * The Python tests author no config at all and rely on `--input` overriding the
 * default. The port writes one, so `config_root` is the temp directory whatever
 * the working directory is — the CLI tests otherwise depend on where the test
 * runner happened to start, and here the wiki root *is* the corpus.
 */
export function wikiRoot(): string {
  const root = tempRoot();
  write(root, "wiki.yml", "wiki:\n  input: [.]\n");
  return root;
}

interface CliResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Run the real CLI as a subprocess, in `cwd`, with the permissions it needs:
 * `run` for the CLI itself, `env` for the RDF stack.
 *
 * Output is compared with `\n`. The Python CLI writes CRLF on Windows through
 * text-mode stdout; the migration targets normalised output rather than byte
 * parity, for the reason recorded in `CONTEXT.md`.
 */
export async function runCli(
  args: readonly string[],
  cwd: string,
): Promise<CliResult> {
  const { code, stdout, stderr } = await new Deno.Command(Deno.execPath(), {
    args: ["run", "--quiet", "--allow-all", CLI_ENTRY, ...args],
    cwd,
    stdout: "piped",
    stderr: "piped",
  }).output();
  return {
    code,
    stdout: DECODER.decode(stdout),
    stderr: DECODER.decode(stderr),
  };
}
