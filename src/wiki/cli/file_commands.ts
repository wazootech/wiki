import { EXIT_OK, PROG_NAME } from "./usage.ts";
import { loadWiki } from "./audit.ts";
import { NEW_HELP, PATCH_HELP, SET_HELP } from "./write_verb_help.ts";
import { runNewCommand, runSetCommand } from "./new_set.ts";
import { runPatchCommand } from "./patch.ts";
import { MV_HELP, RM_HELP, runMvCommand, runRmCommand } from "./mv_rm.ts";
import { parseReadCommandArgs } from "./read_args.ts";
import { runRefsCommand, runShowCommand } from "./show.ts";
import type { CommandDefinition } from "./command_types.ts";

/**
 * FILE_COMMANDS are the single-file verbs, grouped under `wiki file`. Each is
 * sugar over one `wiki edit` (or a read), so the batch engine stays top-level.
 */
const FILE_COMMANDS: readonly CommandDefinition[] = [
  {
    names: ["mv"],
    description: "Move or rename a file and repoint links to it (an edit).",
    run: async ({ args, configPath, wikiInputs }) => {
      if (args.includes("--help") || args.includes("-h")) {
        console.log(MV_HELP);
        return EXIT_OK;
      }
      const wiki = await loadWiki(configPath, wikiInputs);
      if (typeof wiki === "number") return wiki;
      return await runMvCommand(wiki, args);
    },
  },
  {
    names: ["new"],
    description: "Create a file of a known type (an edit; --apply to write).",
    run: async ({ args, configPath, wikiInputs }) => {
      if (args.includes("--help") || args.includes("-h")) {
        console.log(NEW_HELP);
        return EXIT_OK;
      }
      const wiki = await loadWiki(configPath, wikiInputs);
      if (typeof wiki === "number") return wiki;
      return await runNewCommand(wiki, args);
    },
  },
  {
    names: ["patch"],
    description: "Append to, prepend to, or replace a file section (an edit).",
    run: async ({ args, configPath, wikiInputs }) => {
      if (args.includes("--help") || args.includes("-h")) {
        console.log(PATCH_HELP);
        return EXIT_OK;
      }
      const wiki = await loadWiki(configPath, wikiInputs);
      if (typeof wiki === "number") return wiki;
      return await runPatchCommand(wiki, args);
    },
  },
  {
    names: ["refs"],
    description: "List the files linking to and from one file.",
    run: async ({ args, configPath, wikiInputs }) => {
      const parsed = parseReadCommandArgs("refs", args);
      if (typeof parsed === "number") return parsed;
      const wiki = await loadWiki(configPath, wikiInputs);
      if (typeof wiki === "number") return wiki;
      return await runRefsCommand(wiki, parsed);
    },
  },
  {
    names: ["rm"],
    description: "Delete a file, refusing while others link to it (an edit).",
    run: async ({ args, configPath, wikiInputs }) => {
      if (args.includes("--help") || args.includes("-h")) {
        console.log(RM_HELP);
        return EXIT_OK;
      }
      const wiki = await loadWiki(configPath, wikiInputs);
      if (typeof wiki === "number") return wiki;
      return await runRmCommand(wiki, args);
    },
  },
  {
    names: ["set"],
    description: "Set or remove one frontmatter field (an edit).",
    run: async ({ args, configPath, wikiInputs }) => {
      if (args.includes("--help") || args.includes("-h")) {
        console.log(SET_HELP);
        return EXIT_OK;
      }
      const wiki = await loadWiki(configPath, wikiInputs);
      if (typeof wiki === "number") return wiki;
      return await runSetCommand(wiki, args);
    },
  },
  {
    names: ["show"],
    description: "Describe one file: frontmatter, JSON-LD, outline, hash.",
    run: async ({ args, configPath, wikiInputs }) => {
      const parsed = parseReadCommandArgs("show", args);
      if (typeof parsed === "number") return parsed;
      const wiki = await loadWiki(configPath, wikiInputs);
      if (typeof wiki === "number") return wiki;
      return await runShowCommand(wiki, parsed);
    },
  },
];

export const FILE_COMMAND_BY_NAME = new Map<string, CommandDefinition>();
for (const command of FILE_COMMANDS) {
  for (const name of command.names) FILE_COMMAND_BY_NAME.set(name, command);
}

/** FILE_COMMAND_NAMES lists the `wiki file` subcommands. */
export const FILE_COMMAND_NAMES: readonly string[] = FILE_COMMANDS.flatMap(
  ({ names }) => names,
);

const FILE_HELP_WIDTH = Math.max(
  ...FILE_COMMANDS.map(({ names }) => names.join(", ").length),
);
export const FILE_HELP_LINES = [
  `Usage: ${PROG_NAME} file [OPTIONS] COMMAND [ARGS]...`,
  "",
  "  Create, change, move, delete, or inspect one wiki document file",
  "  (.md, .yaml, .yml, .json, .toml under wiki.input). These are validated,",
  "  link-aware edits, not plain file operations: each builds one wiki edit",
  "  (see wiki edit), and write verbs are dry runs unless --apply.",
  "",
  "Options:",
  "  --help  Show this message and exit.",
  "",
  "Commands:",
  ...FILE_COMMANDS.map(({ names, description }) =>
    `  ${names.join(", ").padEnd(FILE_HELP_WIDTH)}  ${description}`
  ),
];
