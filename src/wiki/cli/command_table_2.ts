import { EXIT_OK, graphListUsageError, graphUsageError } from "./usage.ts";
import { loadWiki } from "./audit.ts";
import { parseInitCommandArgs } from "./init_args.ts";
import { runInitCommand } from "./init.ts";
import { parseInstallCommandArgs } from "./sources_args.ts";
import { runInstallCommand } from "./sources.ts";
import type { CommandDefinition } from "./command_types.ts";

export const COMMANDS_2: readonly CommandDefinition[] = [
  {
    names: ["graph"],
    description: "Inspect read-only RDF named graph provenance.",
    run: async ({ args, configPath, wikiInputs }) => {
      const graphCommand = args[0];
      if (graphCommand === "--help" || graphCommand === "-h") {
        console.log([
          "Usage: wiki graph [OPTIONS] COMMAND [ARGS]...",
          "",
          "  Inspect read-only RDF named graph provenance.",
          "",
          "Options:",
          "  --help  Show this message and exit.",
          "",
          "Commands:",
          "  list  List named graphs available to SPARQL GRAPH queries.",
        ].join("\n"));
        return EXIT_OK;
      }
      if (
        graphCommand === "list" &&
        (args[1] === "--help" || args[1] === "-h")
      ) {
        console.log([
          "Usage: wiki graph list [OPTIONS]",
          "",
          "  List named graphs available to SPARQL GRAPH queries.",
          "",
          "Options:",
          "  --help  Show this message and exit.",
        ].join("\n"));
        return EXIT_OK;
      }
      if (graphCommand === undefined) {
        return graphUsageError("Missing command.");
      }
      if (graphCommand !== "list") {
        return graphUsageError(`No such command '${graphCommand}'.`);
      }
      if (args.length > 1) {
        return graphListUsageError(
          `Got unexpected extra argument (${args[1]})`,
        );
      }
      const wiki = await loadWiki(configPath, wikiInputs);
      if (typeof wiki === "number") return wiki;
      const descriptors = wiki.graphs();
      const headers = ["name", "kind", "uri", "commit", "required_by"];
      const rows = descriptors.map((descriptor) => [
        descriptor.name,
        descriptor.kind,
        descriptor.uri,
        descriptor.resolved_ref?.slice(0, 12) ?? "",
        descriptor.required_by.join(","),
      ]);
      const widths = headers.map((header, index) =>
        Math.max(header.length, ...rows.map((row) => row[index]!.length))
      );
      console.log(
        headers.map((header, index) => header.padEnd(widths[index]!)).join(
          "  ",
        ),
      );
      console.log(widths.map((width) => "-".repeat(width)).join("  "));
      for (const row of rows) {
        console.log(
          row.map((value, index) => value.padEnd(widths[index]!)).join("  "),
        );
      }
      return EXIT_OK;
    },
  },
  {
    names: ["init"],
    description: "Scaffold a new wiki project in the current directory.",
    run: async ({ args }) => {
      const parsed = parseInitCommandArgs(args);
      if (typeof parsed === "number") return parsed;
      return await runInitCommand(parsed);
    },
  },
  {
    names: ["install", "i"],
    description: "Fetch and lock external data sources.",
    run: async ({ command, args, configPath, wikiInputs }) => {
      const parsed = parseInstallCommandArgs(
        args,
        command === "i" ? "i" : "install",
      );
      if (typeof parsed === "number") return parsed;
      const wiki = await loadWiki(configPath, wikiInputs);
      if (typeof wiki === "number") return wiki;
      return runInstallCommand(wiki, parsed);
    },
  },
];
