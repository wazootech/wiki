import { pathExists } from "../fspath.ts";
import { errorText } from "../errors.ts";
import { EXIT_OK, usageError } from "./usage.ts";

export interface ParsedExportCommand {
  readonly files: readonly string[];
  readonly output: string | null;
  readonly format: import("../export.ts").ExportFormat;
  readonly mode: "expanded" | "compacted";
}

export async function parseExportCommandArgs(
  args: readonly string[],
): Promise<ParsedExportCommand | number> {
  const files: string[] = [];
  let output: string | null = null;
  let format = "dict";
  let mode: "expanded" | "compacted" = "expanded";
  let optionsEnded = false;

  for (let index = 0; index < args.length; index++) {
    const token = args[index]!;
    if (optionsEnded) {
      const path = token;
      if (!pathExists(path)) {
        return usageError(
          `Error: Invalid value for '[FILES]...': Path '${token}' does not exist.`,
        );
      }
      files.push(path);
    } else if (token === "--") {
      optionsEnded = true;
    } else if (token === "--help" || token === "-h") {
      console.log(
        "Usage: wiki export [OPTIONS] [FILES]...\n\n" +
          "Export document frontmatter, with the values the graph derives,\n" +
          "as RDF or JSON-LD.\n\n" +
          "Options:\n" +
          "  -o, --output PATH   File to write serialized RDF output\n" +
          "  -f, --format FORMAT dict, json-ld, turtle, xml (deferred), n3, nt, trig, nquads\n" +
          "      --mode MODE     expanded or compacted JSON-LD",
      );
      return EXIT_OK;
    } else if (token === "-f" || token === "--format") {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("-")) {
        return usageError(`Error: Option '${token}' requires an argument.`);
      }
      format = value;
      index += 1;
    } else if (token.startsWith("--format=")) {
      format = token.slice("--format=".length);
    } else if (token === "--mode") {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("-")) {
        return usageError("Error: Option '--mode' requires an argument.");
      }
      const normalized = value.toLowerCase();
      if (normalized !== "expanded" && normalized !== "compacted") {
        return usageError(
          `Error: Invalid value for '--mode': '${value}' is not one of 'expanded', 'compacted'.`,
        );
      }
      mode = normalized;
      index += 1;
    } else if (token.startsWith("--mode=")) {
      const value = token.slice("--mode=".length).toLowerCase();
      if (value !== "expanded" && value !== "compacted") {
        return usageError(
          `Error: Invalid value for '--mode': '${value}' is not one of 'expanded', 'compacted'.`,
        );
      }
      mode = value;
    } else if (token === "-o" || token === "--output") {
      const value = args[index + 1];
      if (value === undefined || (value.startsWith("-") && value !== "-")) {
        return usageError(`Error: Option '${token}' requires an argument.`);
      }
      output = value;
      index += 1;
    } else if (token.startsWith("--output=")) {
      output = token.slice("--output=".length);
    } else if (token.startsWith("-") && token !== "-") {
      return usageError(`Error: No such option: ${token}`);
    } else {
      const path = token;
      if (!pathExists(path)) {
        return usageError(
          `Error: Invalid value for '[FILES]...': Path '${token}' does not exist.`,
        );
      }
      files.push(path);
    }
  }

  try {
    const { normalizeExportFormat } = await import("../export.ts");
    return { files, output, format: normalizeExportFormat(format), mode };
  } catch (error) {
    return usageError(
      `Error: ${errorText(error)}`,
    );
  }
}
