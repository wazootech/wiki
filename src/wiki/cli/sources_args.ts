import { EXIT_OK, usageError } from "./usage.ts";

export interface ParsedUpdateCommand {
  readonly name: string | null;
  readonly dryRun: boolean;
}

export function parseInstallCommandArgs(
  args: readonly string[],
  command: "install" | "i" = "install",
): string | null | number {
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    console.log(
      `Usage: wiki ${command} [OPTIONS] [URL]\n\n${
        command === "i"
          ? "Alias for install."
          : "Fetch and lock external data sources. With no URL, install declared sources. With a URL, add and fetch one git source."
      }\n\nOptions:\n  --help  Show this message and exit.`,
    );
    return EXIT_OK;
  }
  if (args.length > 1) {
    return usageError(`Error: Got unexpected extra argument (${args[1]}).`);
  }
  if (args.length === 1 && args[0]!.startsWith("-")) {
    return usageError(`Error: No such option: ${args[0]}`);
  }
  return args[0] ?? null;
}

export function parseUpdateCommandArgs(
  args: readonly string[],
): ParsedUpdateCommand | number {
  let name: string | null = null;
  let dryRun = false;
  for (const token of args) {
    if (token === "--help" || token === "-h") {
      console.log(
        "Usage: wiki update [OPTIONS] [NAME]\n\nCheck locked sources for newer commits and update wiki.lock.\n\nOptions:\n  -n, --dry-run  Report changes without modifying wiki.lock.\n  --help         Show this message and exit.",
      );
      return EXIT_OK;
    }
    if (token === "-n" || token === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (token.startsWith("-")) {
      return usageError(`Error: No such option: ${token}`);
    }
    if (name !== null) {
      return usageError(`Error: Got unexpected extra argument (${token}).`);
    }
    name = token;
  }
  return { name, dryRun };
}

export function parseRemoveCommandArgs(
  args: readonly string[],
): string | number {
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    console.log(
      "Usage: wiki remove [OPTIONS] NAME\n\nRemove a source from the config file, its cache, and wiki.lock.\n\nOptions:\n  --help  Show this message and exit.",
    );
    return EXIT_OK;
  }
  if (args.length === 0) return usageError("Error: Missing argument 'NAME'.");
  if (args.length > 1) {
    return usageError(`Error: Got unexpected extra argument (${args[1]}).`);
  }
  if (args[0]!.startsWith("-")) {
    return usageError(`Error: No such option: ${args[0]}`);
  }
  return args[0]!;
}
