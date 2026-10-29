import { EXIT_OK, usageError } from "./usage.ts";

const EDIT_HELP = [
  "Usage: wiki edit [OPTIONS]",
  "",
  "  Validate a batch of file edits and, with --apply, write them atomically.",
  "",
  '  The edit is JSON: {"ops": [...]}, each op one of create, replace, delete,',
  "  set, patch, or move (wiki file new, set, patch, mv, and rm build one for you).",
  "  Paths are relative to the config root. Nothing is written without",
  "  --apply, and nothing is written if the edit introduces check or lint errors",
  '  (unless --force) or an op\'s "expect" hash no longer matches the file.',
  "",
  "  Exit codes: 0 valid (or applied), 1 rejected, 2 usage, 3 conflict.",
  "",
  "Options:",
  "  --from FILE  Read the edit from FILE, or '-' for stdin (default: -).",
  "  --apply      Write the edit. Without it, validate and report only.",
  "  --force      Write even if the edit introduces errors.",
  "  -f, --format [text|json]",
  "               Output format (default: text). json writes the edit report",
  "               to stdout.",
  "  --json       Shorthand for --format json.",
  "  --help       Show this message and exit.",
].join("\n");

export interface ParsedEditCommand {
  readonly from: string;
  readonly apply: boolean;
  readonly force: boolean;
  readonly format: "text" | "json";
}

export function parseEditCommandArgs(
  args: readonly string[],
): ParsedEditCommand | number {
  let from = "-";
  let apply = false;
  let force = false;
  let format: "text" | "json" = "text";
  for (let i = 0; i < args.length; i++) {
    const token = args[i]!;
    if (token === "--help" || token === "-h") {
      console.log(EDIT_HELP);
      return EXIT_OK;
    }
    if (token === "--apply") {
      apply = true;
    } else if (token === "--force") {
      force = true;
    } else if (token === "--json") {
      format = "json";
    } else if (
      token === "--from" || token === "-f" || token === "--format"
    ) {
      const value = args[++i];
      if (value === undefined) {
        return usageError(`Error: Option '${token}' requires an argument.`);
      }
      if (token === "--from") {
        from = value;
      } else if (value === "text" || value === "json") {
        format = value;
      } else {
        return usageError(
          `Error: Invalid value for '-f' / '--format': '${value}' is not one of 'text', 'json'.`,
        );
      }
    } else if (token.startsWith("--from=")) {
      from = token.slice("--from=".length);
    } else if (token.startsWith("--format=")) {
      const value = token.slice("--format=".length);
      if (value !== "text" && value !== "json") {
        return usageError(
          `Error: Invalid value for '-f' / '--format': '${value}' is not one of 'text', 'json'.`,
        );
      }
      format = value;
    } else if (token.startsWith("-")) {
      return usageError(`Error: No such option: ${token}`);
    } else {
      return usageError(`Error: Got unexpected extra argument (${token}).`);
    }
  }
  return { from, apply, force, format };
}
