#!/usr/bin/env -S deno run
/**
 * CLI entrypoint — Deno port of `src/wiki/cli.py`.
 *
 * Ported commands cover wiki validation, formatting, graph/query/export,
 * links, static build/preview, read-only MCP, initialization, Git sources, and
 * self-upgrade. RDF/XML serialization remains an explicit deferral.
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
 * The root help body is shared by `--help` and an empty invocation, with the
 * latter returning Click's usage-error exit code on stderr.
 *
 * Line endings differ from the Python CLI on Windows: Click writes `\r\n`
 * through text-mode stdout, while `console.error` writes `\n`. The migration
 * targets normalised output, not byte parity — see CONTEXT.md.
 */
import { VERSION } from "./version.ts";
import {
  EXIT_OK,
  EXIT_USAGE,
  PROG_NAME,
  ROOT_HELP_HEADER_LINES,
  usageError,
} from "./cli/usage.ts";
import { parseUpgradeCommandArgs, runUpgradeCommand } from "./cli/upgrade.ts";
import type { CommandDefinition } from "./cli/command_types.ts";
import { COMMANDS_1 } from "./cli/command_table_1.ts";
import { COMMANDS_2 } from "./cli/command_table_2.ts";
import { COMMANDS_3 } from "./cli/command_table_3.ts";
import { FILE_COMMAND_BY_NAME } from "./cli/file_commands.ts";

export {
  EXIT_CONFLICT,
  EXIT_FAILURE,
  EXIT_OK,
  EXIT_USAGE,
  PROG_NAME,
} from "./cli/usage.ts";
export { FILE_COMMAND_NAMES } from "./cli/file_commands.ts";

const COMMANDS_4: readonly CommandDefinition[] = [
  {
    names: ["upgrade"],
    description: "Check for updates and upgrade the wiki CLI.",
    run: async ({ args }) => {
      const parsed = parseUpgradeCommandArgs(args);
      if (typeof parsed === "number") return parsed;
      return await runUpgradeCommand(parsed);
    },
  },
];

const COMMANDS: readonly CommandDefinition[] = [
  ...COMMANDS_1,
  ...COMMANDS_2,
  ...COMMANDS_3,
  ...COMMANDS_4,
];

export const COMMAND_NAMES: readonly string[] = COMMANDS.flatMap(({ names }) =>
  names
);

const COMMAND_BY_NAME = new Map<string, CommandDefinition>();
for (const command of COMMANDS) {
  for (const name of command.names) COMMAND_BY_NAME.set(name, command);
}

const COMMAND_HELP_WIDTH = Math.max(
  ...COMMANDS.map(({ names }) => names.join(", ").length),
);
const ROOT_HELP_LINES = [
  ...ROOT_HELP_HEADER_LINES,
  ...COMMANDS.map(({ names, description }) =>
    `  ${names.join(", ").padEnd(COMMAND_HELP_WIDTH)}  ${description}`
  ),
];
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
      console.log(ROOT_HELP_LINES.join("\n"));
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
    console.error(ROOT_HELP_LINES.join("\n"));
    return EXIT_USAGE;
  }

  const definition = COMMAND_BY_NAME.get(command);
  if (definition === undefined) {
    if (FILE_COMMAND_BY_NAME.has(command)) {
      return usageError(
        `Error: No such command '${command}'. Did you mean '${PROG_NAME} file ${command}'?`,
      );
    }
    return usageError(`Error: No such command '${command}'.`);
  }

  return await definition.run({
    command,
    args: argv.slice(index + 1),
    configPath,
    wikiInputs,
  });
}

if (import.meta.main) {
  Deno.exit(await main());
}
