import { EXIT_OK, usageError } from "./usage.ts";

interface ParsedUpgradeCommand {
  readonly checkOnly: boolean;
  readonly yes: boolean;
  readonly verbose: boolean;
}

export function parseUpgradeCommandArgs(
  args: readonly string[],
): ParsedUpgradeCommand | number {
  let checkOnly = false;
  let yes = false;
  let verbose = false;
  for (const token of args) {
    if (token === "--help" || token === "-h") {
      console.log(
        "Usage: wiki upgrade [OPTIONS]\n\nCheck for updates and upgrade the wiki CLI.\n\nOptions:\n  -c, --check    Check for updates without upgrading. Exits 1 when outdated.\n  -y, --yes      Skip confirmation and upgrade the global Deno install.\n  -v, --verbose  Show installer command and output.\n  --help         Show this message and exit.",
      );
      return EXIT_OK;
    }
    if (token === "-c" || token === "--check") checkOnly = true;
    else if (token === "-y" || token === "--yes") yes = true;
    else if (token === "-v" || token === "--verbose") verbose = true;
    else return usageError(`Error: No such option: ${token}`);
  }
  return { checkOnly, yes, verbose };
}

export async function runUpgradeCommand(
  options: ParsedUpgradeCommand,
): Promise<number> {
  const { runUpgrade } = await import("../upgrade.ts");
  return await runUpgrade(options);
}
