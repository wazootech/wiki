import { loadWiki, parseFileCommandArgs, runAuditCommand } from "./audit.ts";
import { parseQueryCommandArgs } from "./query_args.ts";
import { runQueryCommand } from "./query.ts";
import { parseLinkCommandArgs, runLinkCommand } from "./link.ts";
import { parseRenderCommandArgs, runRenderCommand } from "./render.ts";
import { parseServeCommandArgs, runServeCommand } from "./serve.ts";
import { parseMcpCommandArgs, runMcpCommand } from "./mcp.ts";
import {
  parseRemoveCommandArgs,
  parseUpdateCommandArgs,
} from "./sources_args.ts";
import { runRemoveCommand, runUpdateCommand } from "./sources.ts";
import type { CommandDefinition } from "./command_types.ts";

export const COMMANDS_3: readonly CommandDefinition[] = [
  {
    names: ["link"],
    description: "Suggest or repair internal links for wiki pages.",
    run: async ({ args, configPath, wikiInputs }) => {
      const parsed = parseLinkCommandArgs(args);
      if (typeof parsed === "number") return parsed;
      const wiki = await loadWiki(configPath, wikiInputs);
      if (typeof wiki === "number") return wiki;
      return await runLinkCommand(wiki, parsed);
    },
  },
  {
    names: ["lint"],
    description:
      "Convention audits: links, filenames, headings, and link style.",
    run: async ({ command, args, configPath, wikiInputs }) => {
      const parsed = parseFileCommandArgs(command, args);
      if (typeof parsed === "number") return parsed;
      const wiki = await loadWiki(configPath, wikiInputs);
      if (typeof wiki === "number") return wiki;
      return await runAuditCommand(wiki, "lint", parsed.files, parsed);
    },
  },
  {
    names: ["mcp"],
    description: "Start a read-only MCP server for the wiki graph.",
    run: async ({ args, configPath, wikiInputs }) => {
      const parsed = parseMcpCommandArgs(args);
      if (typeof parsed === "number") return parsed;
      const wiki = await loadWiki(configPath, wikiInputs);
      if (typeof wiki === "number") return wiki;
      return await runMcpCommand(wiki, parsed);
    },
  },
  {
    names: ["query"],
    description: "Run SPARQL SELECT or CONSTRUCT (query argument or stdin).",
    run: async ({ args, configPath, wikiInputs }) => {
      const parsed = await parseQueryCommandArgs(args);
      if (typeof parsed === "number") return parsed;
      const wiki = await loadWiki(configPath, wikiInputs);
      if (typeof wiki === "number") return wiki;
      return await runQueryCommand(wiki, parsed);
    },
  },
  {
    names: ["remove"],
    description:
      "Remove a source from the config file, its cache, and wiki.lock.",
    run: async ({ args, configPath, wikiInputs }) => {
      const parsed = parseRemoveCommandArgs(args);
      if (typeof parsed === "number") return parsed;
      const wiki = await loadWiki(configPath, wikiInputs);
      if (typeof wiki === "number") return wiki;
      return runRemoveCommand(wiki, parsed);
    },
  },
  {
    names: ["render"],
    description: "Render inline SPARQL blocks in markdown files.",
    run: async ({ args, configPath, wikiInputs }) => {
      const parsed = parseRenderCommandArgs(args);
      if (typeof parsed === "number") return parsed;
      const wiki = await loadWiki(configPath, wikiInputs);
      if (typeof wiki === "number") return wiki;
      return await runRenderCommand(wiki, parsed);
    },
  },
  {
    names: ["serve"],
    description: "Start a local HTTP server for browsing the wiki.",
    run: async ({ args, configPath, wikiInputs }) => {
      const parsed = parseServeCommandArgs(args);
      if (typeof parsed === "number") return parsed;
      const wiki = await loadWiki(configPath, wikiInputs);
      if (typeof wiki === "number") return wiki;
      return await runServeCommand(wiki, parsed);
    },
  },
  {
    names: ["update"],
    description: "Check locked sources for newer commits and update wiki.lock.",
    run: async ({ args, configPath, wikiInputs }) => {
      const parsed = parseUpdateCommandArgs(args);
      if (typeof parsed === "number") return parsed;
      const wiki = await loadWiki(configPath, wikiInputs);
      if (typeof wiki === "number") return wiki;
      return runUpdateCommand(wiki, parsed);
    },
  },
];
