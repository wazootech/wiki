#!/usr/bin/env -S deno run
/**
 * CLI entrypoint — Deno port of `src/wiki/cli.py`.
 *
 * Ported so far: the group's `--config`/`--input` options, `--version`, and the
 * two audit commands (`check`, `lint`) with their `FILE...` positionals, `-v`,
 * and `--strict`. The remaining 13 commands — `link`, `graph`, `query`, `mcp`,
 * `render`, `build`, `export`, `serve`, `init`, `fmt`, `install`/`i`, `update`,
 * `remove`, `upgrade` — land as their modules do, and until one does, invoking
 * it is a usage error naming that fact rather than a silent success.
 *
 * Three contracts are preserved deliberately, because the differential harness
 * asserts them:
 *
 * - **`--version` prints `wiki, version <v>` to stdout and exits 0**, which is
 *   what Click's `version_option` does.
 * - **An unknown command is a usage error on stderr with exit 2**, spelled the
 *   way Click spells it: the usage lines, a blank line, then
 *   `Error: No such command 'x'.`
 * - **Audit output goes to stderr** through `cli_output.ts`, and the exit code
 *   is the report's, not the printer's.
 *
 * The group's help body is still the short usage: Click's group is declared
 * `no_args_is_help`, so a bare `wiki` prints the full command help to stderr,
 * and that body arrives with the command surface. The divergence is tracked as
 * the `usage-no-command` case in `parity/cases.ts` rather than papered over.
 *
 * Line endings differ from the Python CLI on Windows: Click writes `\r\n`
 * through text-mode stdout, while `console.error` writes `\n`. The migration
 * targets normalised output, not byte parity — see the ADR.
 */
import { exitAuditReport } from "./cli_output.ts";
import { Path, ValueError } from "./fspath.ts";
import { VERSION } from "./version.ts";
// Type-only, so the audit stack is not evaluated on import: `wiki.ts` reaches
// `@zazuko/env`, which reads `process.env` while it loads and therefore needs
// `--allow-env` before any command runs. `--version` and an unknown command must
// work under zero permissions (the CLI test asserts exactly that), so the module
// is imported dynamically inside the command that needs it.
import type { Wiki } from "./wiki.ts";

/** Program name in usage and version output (mirrors Click's `prog_name`). */
export const PROG_NAME = "wiki";

/** Exit code for a successful run. */
export const EXIT_OK = 0;

/** Exit code for a usage error — matches Click's `UsageError.exit_code`. */
export const EXIT_USAGE = 2;

/** Exit code for a failed command — matches Click's `ClickException`. */
export const EXIT_FAILURE = 1;

const USAGE_LINES = [
  `Usage: ${PROG_NAME} [OPTIONS] COMMAND [ARGS]...`,
  `Try '${PROG_NAME} --help' for help.`,
];

/** Every command the Python CLI declares, ported or not. */
const KNOWN_COMMANDS: readonly string[] = [
  "check",
  "lint",
  "link",
  "graph",
  "query",
  "mcp",
  "render",
  "build",
  "export",
  "serve",
  "init",
  "fmt",
  "install",
  "i",
  "update",
  "remove",
  "upgrade",
];

/** The commands this entrypoint implements today. */
const PORTED_COMMANDS: readonly string[] = ["check", "lint"];

/** Write the short usage to stderr, optionally followed by an error line. */
function usageError(detail: string): number {
  console.error([...USAGE_LINES, "", detail].join("\n"));
  return EXIT_USAGE;
}

/** Run an audit command over the wiki the group options resolved to. */
async function runAuditCommand(
  wiki: Wiki,
  command: "check" | "lint",
  files: readonly Path[],
  options: { readonly verbose: boolean; readonly strict: boolean },
): Promise<number> {
  const report = command === "check"
    ? await wiki.check(files.length > 0 ? files : null, {
      strict: options.strict,
    })
    : wiki.lint(files.length > 0 ? files : null, { strict: options.strict });
  return exitAuditReport(report, options);
}

/** Resolve the wiki the group options name, or the exit code that failed. */
async function loadWiki(
  configPath: string,
  wikiInputs: readonly string[],
): Promise<Wiki | number> {
  const { Wiki: WikiClass } = await import("./wiki.ts");
  try {
    return WikiClass.load(configPath, { wikiInputs });
  } catch (error) {
    // Click's `ClickException` prints `Error: <message>` with no usage block and
    // exits 1 — a config that cannot be loaded is a failed run, not a usage
    // error, because the command line itself was well-formed.
    if (error instanceof ValueError) {
      console.error(`Error: ${error.message}`);
      return EXIT_FAILURE;
    }
    throw error;
  }
}

/** The `FILE...` plus flags tail of `check` and `lint`, or a usage error. */
function parseFileCommandArgs(
  args: readonly string[],
): {
  readonly files: Path[];
  readonly verbose: boolean;
  readonly strict: boolean;
} | number {
  const files: Path[] = [];
  let verbose = false;
  let strict = false;

  for (const token of args) {
    if (token === "-v" || token === "--verbose") {
      verbose = true;
      continue;
    }
    if (token === "--strict") {
      strict = true;
      continue;
    }
    if (token === "--help" || token === "-h") {
      // Click prints the command's help to stdout and exits 0. The body is the
      // short usage until the full surface lands, which is the same pending
      // divergence the group's help carries.
      console.log(USAGE_LINES.join("\n"));
      return EXIT_OK;
    }
    if (token.startsWith("-") && token !== "-") {
      return usageError(`Error: No such option: ${token}`);
    }
    const path = new Path(token);
    if (!path.exists()) {
      return usageError(
        `Error: Invalid value for '[FILES]...': Path '${token}' does not exist.`,
      );
    }
    files.push(path);
  }

  return { files, verbose, strict };
}

/**
 * Run the CLI and return the process exit code.
 *
 * Asynchronous since `check` became so: the audit's SHACL pass reads the graph
 * through loaders that fetch, and the group resolves the wiki before any command
 * runs.
 */
export async function main(
  argv: readonly string[] = Deno.args,
): Promise<number> {
  let configPath = ".";
  const wikiInputs: string[] = [];

  let index = 0;
  for (; index < argv.length; index += 1) {
    const token = argv[index] as string;

    // Click's `version_option` is eager: it wins wherever it appears before the
    // command, and prints to stdout.
    if (token === "--version") {
      console.log(`${PROG_NAME}, version ${VERSION}`);
      return EXIT_OK;
    }
    if (token === "--help" || token === "-h") {
      console.log(USAGE_LINES.join("\n"));
      return EXIT_OK;
    }
    if (token === "-c" || token === "--config") {
      const value = argv[index + 1];
      if (value === undefined) {
        return usageError(`Error: Option '${token}' requires an argument.`);
      }
      configPath = value;
      index += 1;
      continue;
    }
    if (token.startsWith("--config=")) {
      configPath = token.slice("--config=".length);
      continue;
    }
    if (token === "--input") {
      const value = argv[index + 1];
      if (value === undefined) {
        return usageError("Error: Option '--input' requires an argument.");
      }
      wikiInputs.push(value);
      index += 1;
      continue;
    }
    if (token.startsWith("--input=")) {
      wikiInputs.push(token.slice("--input=".length));
      continue;
    }
    if (token.startsWith("-") && token !== "-") {
      return usageError(`Error: No such option: ${token}`);
    }
    break;
  }

  const command = argv[index];
  if (command === undefined) {
    // Click's group is declared `no_args_is_help`, so an empty argv prints the
    // *full* help — not `USAGE_LINES` — to stderr and exits 2. Only the exit
    // code is contractual today; the help body arrives with the command surface
    // in phase 9, and the divergence is tracked as the `usage-no-command` case
    // in `parity/cases.ts` rather than papered over here.
    return usageError("");
  }

  if (!KNOWN_COMMANDS.includes(command)) {
    return usageError(`Error: No such command '${command}'.`);
  }

  if (!PORTED_COMMANDS.includes(command)) {
    return usageError(`Error: The '${command}' command is not ported yet.`);
  }

  const parsed = parseFileCommandArgs(argv.slice(index + 1));
  if (typeof parsed === "number") return parsed;

  const wiki = await loadWiki(configPath, wikiInputs);
  if (typeof wiki === "number") return wiki;

  return await runAuditCommand(
    wiki,
    command as "check" | "lint",
    parsed.files,
    parsed,
  );
}

if (import.meta.main) {
  Deno.exit(await main());
}
