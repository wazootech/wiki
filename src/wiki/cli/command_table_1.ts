import { EXIT_OK, fileUsageError } from "./usage.ts";
import { loadWiki, parseFileCommandArgs, runAuditCommand } from "./audit.ts";
import { runFmtCommand } from "./fmt.ts";
import { parseFixCommandArgs, runFixCommand } from "./fix.ts";
import { parseExportCommandArgs } from "./export_args.ts";
import { runExportCommand } from "./export.ts";
import { parseBuildCommandArgs } from "./build_args.ts";
import { runBuildCommand } from "./build.ts";
import { parseEditCommandArgs } from "./edit_args.ts";
import { runEditCommand } from "./edit.ts";
import type { CommandDefinition } from "./command_types.ts";
import { FILE_COMMAND_BY_NAME, FILE_HELP_LINES } from "./file_commands.ts";

export const COMMANDS_1: readonly CommandDefinition[] = [
  {
    names: ["build"],
    description: "Build static HTML site from wiki documents.",
    run: async ({ args, configPath, wikiInputs }) => {
      const parsed = parseBuildCommandArgs(args);
      if (typeof parsed === "number") return parsed;
      const wiki = await loadWiki(configPath, wikiInputs);
      if (typeof wiki === "number") return wiki;
      return await runBuildCommand(wiki, parsed);
    },
  },
  {
    names: ["check"],
    description: "Integrity checks: SHACL, JSON Schema, routes, collisions,...",
    run: async ({ command, args, configPath, wikiInputs }) => {
      const parsed = parseFileCommandArgs(command, args);
      if (typeof parsed === "number") return parsed;
      const wiki = await loadWiki(configPath, wikiInputs);
      if (typeof wiki === "number") return wiki;
      return await runAuditCommand(wiki, "check", parsed.files, parsed);
    },
  },
  {
    names: ["edit"],
    description: "Validate a batch of file edits and write them atomically.",
    run: async ({ args, configPath, wikiInputs }) => {
      const parsed = parseEditCommandArgs(args);
      if (typeof parsed === "number") return parsed;
      const wiki = await loadWiki(configPath, wikiInputs);
      if (typeof wiki === "number") return wiki;
      return await runEditCommand(wiki, parsed);
    },
  },
  {
    names: ["export"],
    description: "Export document frontmatter as RDF or JSON-LD.",
    run: async ({ args, configPath, wikiInputs }) => {
      const parsed = await parseExportCommandArgs(args);
      if (typeof parsed === "number") return parsed;
      const wiki = await loadWiki(configPath, wikiInputs);
      if (typeof wiki === "number") return wiki;
      return await runExportCommand(wiki, parsed);
    },
  },
  {
    names: ["file"],
    description:
      "Create, change, move, delete, or inspect one wiki document file.",
    run: async ({ args, configPath, wikiInputs }) => {
      const fileCommand = args[0];
      if (fileCommand === "--help" || fileCommand === "-h") {
        console.log(FILE_HELP_LINES.join("\n"));
        return EXIT_OK;
      }
      if (fileCommand === undefined) {
        return fileUsageError("Missing command.");
      }
      const definition = FILE_COMMAND_BY_NAME.get(fileCommand);
      if (definition === undefined) {
        return fileUsageError(`No such command '${fileCommand}'.`);
      }
      return await definition.run({
        command: fileCommand,
        args: args.slice(1),
        configPath,
        wikiInputs,
      });
    },
  },
  {
    names: ["fix"],
    description: "Remove frontmatter that repeats a derived value.",
    run: async ({ args, configPath, wikiInputs }) => {
      const parsed = parseFixCommandArgs(args);
      if (typeof parsed === "number") return parsed;
      const wiki = await loadWiki(configPath, wikiInputs);
      if (typeof wiki === "number") return wiki;
      return await runFixCommand(wiki, parsed);
    },
  },
  {
    names: ["fmt"],
    description: "Format markdown wiki pages with the Deno formatter.",
    run: async ({ command, args, configPath, wikiInputs }) => {
      const parsed = parseFileCommandArgs(command, args);
      if (typeof parsed === "number") return parsed;
      const wiki = await loadWiki(configPath, wikiInputs);
      if (typeof wiki === "number") return wiki;
      return await runFmtCommand(wiki, parsed);
    },
  },
];
