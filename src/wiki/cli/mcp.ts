import { errorText } from "../errors.ts";
import type { Wiki } from "../wiki.ts";
import { EXIT_FAILURE, EXIT_OK, usageError } from "./usage.ts";

interface ParsedMcpCommand {
  readonly mode: "stdio";
  readonly cache: boolean;
  readonly allowWrite: boolean;
}

export function parseMcpCommandArgs(
  args: readonly string[],
): ParsedMcpCommand | number {
  let mode = "stdio";
  let cache = false;
  let allowWrite = false;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]!;
    if (token === "--help" || token === "-h") {
      console.log(
        `Usage: wiki mcp [OPTIONS]\n\nStart a read-only MCP server for the wiki graph. With --allow-write it also lists the page-edit tools.\n\nOptions:\n  --mode MODE    MCP transport mode. (default: stdio)\n  --cache        Persist graph under .wiki/cache for faster reuse across launches.\n  --allow-write  Also list the page-edit tools (wiki_edit_apply and single-op conveniences).\n                 Each defaults to a dry run; applying needs dry_run=false.`,
      );
      return EXIT_OK;
    }
    if (token === "--allow-write") {
      allowWrite = true;
      continue;
    }
    if (token === "--cache") {
      cache = true;
    } else if (token === "--mode") {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("-")) {
        return usageError(`Error: Option '${token}' requires an argument.`);
      }
      mode = value.toLowerCase();
      index += 1;
    } else if (token.startsWith("--mode=")) {
      mode = token.slice("--mode=".length).toLowerCase();
    } else {
      return usageError(
        token.startsWith("-")
          ? `Error: No such option: ${token}`
          : `Error: Got unexpected extra argument (${token})`,
      );
    }
  }
  if (mode !== "stdio") {
    return usageError(`Error: Invalid value for '--mode': '${mode}'.`);
  }
  return { mode: "stdio", cache, allowWrite };
}

export async function runMcpCommand(
  wiki: Wiki,
  parsed: ParsedMcpCommand,
): Promise<number> {
  try {
    const { runMcpServer } = await import("../mcp.ts");
    await runMcpServer(wiki, {
      mode: parsed.mode,
      diskCache: parsed.cache,
      allowWrite: parsed.allowWrite,
    });
    return EXIT_OK;
  } catch (error) {
    console.error(
      `Error: ${errorText(error)}`,
    );
    return EXIT_FAILURE;
  }
}
