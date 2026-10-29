import { EXIT_OK, usageError } from "./usage.ts";

const SHOW_HELP = [
  "Usage: wiki file show [OPTIONS] PATH",
  "",
  "  Describe one file as the engine sees it: frontmatter, the values the graph",
  "  derives (headline from the H1, dates from Git), compacted JSON-LD, heading",
  "  outline, outbound links, and the content hash to pass as an edit op's",
  '  "expect". PATH is relative to the config root, as in wiki edit.',
  "",
  "Options:",
  "  --field KEY  Print only this field: frontmatter first, then a derived",
  "               schema:headline/dateCreated/dateModified (exit 1 when unset).",
  "  -f, --format [text|json]",
  "               Output format (default: text).",
  "  --json       Shorthand for --format json.",
  "  --help       Show this message and exit.",
].join("\n");

const REFS_HELP = [
  "Usage: wiki file refs [OPTIONS] PATH",
  "",
  "  List the files that link to PATH and the files PATH links to.",
  "  PATH is relative to the config root, as in wiki edit.",
  "",
  "Options:",
  "  -f, --format [text|json]",
  "               Output format (default: text).",
  "  --json       Shorthand for --format json.",
  "  --help       Show this message and exit.",
].join("\n");

export interface ParsedReadCommand {
  readonly path: string;
  readonly field: string | null;
  readonly format: "text" | "json";
}

/** Shared parser for `show` and `refs`: one PATH, a format, and `show`'s `--field`. */
export function parseReadCommandArgs(
  command: "show" | "refs",
  args: readonly string[],
): ParsedReadCommand | number {
  let path: string | null = null;
  let field: string | null = null;
  let format: "text" | "json" = "text";
  const invalidFormat = (value: string) =>
    usageError(
      `Error: Invalid value for '-f' / '--format': '${value}' is not one of 'text', 'json'.`,
    );
  for (let i = 0; i < args.length; i++) {
    const token = args[i]!;
    if (token === "--help" || token === "-h") {
      console.log(command === "show" ? SHOW_HELP : REFS_HELP);
      return EXIT_OK;
    }
    if (token === "--json") {
      format = "json";
    } else if (token === "-f" || token === "--format") {
      const value = args[++i];
      if (value === undefined) {
        return usageError(`Error: Option '${token}' requires an argument.`);
      }
      if (value !== "text" && value !== "json") return invalidFormat(value);
      format = value;
    } else if (token.startsWith("--format=")) {
      const value = token.slice("--format=".length);
      if (value !== "text" && value !== "json") return invalidFormat(value);
      format = value;
    } else if (command === "show" && token === "--field") {
      const value = args[++i];
      if (value === undefined) {
        return usageError(`Error: Option '${token}' requires an argument.`);
      }
      field = value;
    } else if (command === "show" && token.startsWith("--field=")) {
      field = token.slice("--field=".length);
    } else if (token.startsWith("-") && token !== "-") {
      return usageError(`Error: No such option: ${token}`);
    } else if (path === null) {
      path = token;
    } else {
      return usageError(`Error: Got unexpected extra argument (${token}).`);
    }
  }
  if (path === null) return usageError("Error: Missing argument 'PATH'.");
  return { path, field, format };
}
