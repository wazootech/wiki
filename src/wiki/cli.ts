#!/usr/bin/env -S deno run
/**
 * CLI entrypoint — Deno port of `src/wiki/cli.py`.
 *
 * Scaffold state: only `--version` is implemented, and it is verified against
 * the Python CLI's exact output. The full surface is 15 commands plus the `i`
 * alias for `install` — `check`, `lint`, `link`, `query`, `mcp`, `render`,
 * `build`, `export`, `serve`, `init`, `fmt`, `install`/`i`, `update`,
 * `remove`, `upgrade` — and lands one group at a time in later milestones.
 *
 * Until a command is ported, invoking it stays a usage error. That is not a
 * placeholder choice: it is the same exit code the Python CLI returns for a
 * name it does not recognise, so the differential harness can assert the exit
 * code from day one while the help text is still pending.
 *
 * Line endings differ from the Python CLI on Windows: Click writes `\r\n`
 * through text-mode stdout, while `console.log` writes `\n`. The migration
 * targets normalised output, not byte parity — see the ADR.
 */
import { VERSION } from "./version.ts";

/** Program name in usage and version output (mirrors Click's `prog_name`). */
export const PROG_NAME = "wiki";

/** Exit code for a successful run. */
export const EXIT_OK = 0;

/** Exit code for usage errors — matches Click's `UsageError.exit_code`. */
export const EXIT_USAGE = 2;

const USAGE_LINES = [
  `Usage: ${PROG_NAME} [OPTIONS] COMMAND [ARGS]...`,
  `Try '${PROG_NAME} --help' for help.`,
];

/**
 * Run the CLI and return the process exit code.
 *
 * Synchronous today because nothing it dispatches to is async. It becomes
 * async (`Promise<number>`) when the first subcommand owning long-lived work —
 * `serve` or `mcp` — is ported.
 */
export function main(argv: readonly string[] = Deno.args): number {
  // Click's `version_option(prog_name="wiki")` prints "<prog>, version <ver>"
  // to stdout and exits 0.
  if (argv.length === 1 && argv[0] === "--version") {
    console.log(`${PROG_NAME}, version ${VERSION}`);
    return EXIT_OK;
  }

  const command = argv.find((arg) => !arg.startsWith("-"));
  if (command === undefined) {
    // Click invoked with no subcommand prints the group help to stderr and
    // exits 2. The help text is ported with the command surface; the exit code
    // is the part of the contract that holds today.
    console.error(USAGE_LINES.join("\n"));
    return EXIT_USAGE;
  }

  console.error(
    [...USAGE_LINES, "", `Error: No such command '${command}'.`].join("\n"),
  );
  return EXIT_USAGE;
}

if (import.meta.main) {
  Deno.exit(main());
}
