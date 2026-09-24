import { assertEquals } from "@std/assert";
import { fromFileUrl } from "@std/path";
import { EXIT_OK, EXIT_USAGE, PROG_NAME } from "../src/wiki/cli.ts";
import { VERSION } from "../src/wiki/version.ts";

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
 * `docs/adr/0001-deno-rewrite.md`.
 */
async function runCli(args: readonly string[]): Promise<CliResult> {
  const { code, stdout, stderr } = await new Deno.Command(Deno.execPath(), {
    args: ["run", "--quiet", CLI_ENTRY, ...args],
    stdout: "piped",
    stderr: "piped",
  }).output();
  return {
    code,
    stdout: DECODER.decode(stdout),
    stderr: DECODER.decode(stderr),
  };
}

Deno.test(
  "--version matches the Python CLI output",
  { permissions: { run: true } },
  async () => {
    const result = await runCli(["--version"]);
    assertEquals(result.code, EXIT_OK);
    assertEquals(result.stdout, `${PROG_NAME}, version ${VERSION}\n`);
    assertEquals(result.stderr, "");
  },
);

Deno.test(
  "an unrecognised subcommand is a usage error on stderr",
  { permissions: { run: true } },
  async () => {
    const result = await runCli(["bogus"]);
    assertEquals(result.code, EXIT_USAGE);
    assertEquals(result.stdout, "");
    assertEquals(
      result.stderr,
      `Usage: ${PROG_NAME} [OPTIONS] COMMAND [ARGS]...\n` +
        `Try '${PROG_NAME} --help' for help.\n` +
        `\n` +
        `Error: No such command 'bogus'.\n`,
    );
  },
);

// Only the exit code is asserted here. Click's group is `no_args_is_help`, so
// the real stderr for an empty argv is the full group help, which arrives with
// the command surface in phase 9; the divergence is tracked as the
// `usage-no-command` case in `parity/cases.ts`.
Deno.test(
  "no subcommand is a usage error, not a silent success",
  { permissions: { run: true } },
  async () => {
    const result = await runCli([]);
    assertEquals(result.code, EXIT_USAGE);
  },
);
