import { errorText } from "../errors.ts";
import { EXIT_OK, usageError } from "./usage.ts";

export interface ParsedQueryCommand {
  readonly queryArgs: readonly string[];
  readonly format: import("../format.ts").QueryFormat;
  readonly output: string | null;
  readonly noInference: boolean;
  readonly reload: boolean;
  readonly cache: boolean;
  readonly jq: string | null;
  readonly pretty: boolean;
  readonly verbose: boolean;
}

export async function parseQueryCommandArgs(
  args: readonly string[],
): Promise<ParsedQueryCommand | number> {
  const queryArgs: string[] = [];
  let format = "table";
  let output: string | null = null;
  let noInference = false;
  let reload = false;
  let cache = false;
  let jq: string | null = null;
  let pretty = false;
  let verbose = false;
  let optionsEnded = false;

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]!;
    if (optionsEnded) {
      queryArgs.push(token);
    } else if (token === "--") {
      optionsEnded = true;
    } else if (token === "--help" || token === "-h") {
      console.log(
        "Usage: wiki query [OPTIONS] [QUERY_ARGS]...\n\n" +
          "Run SPARQL SELECT or CONSTRUCT (query argument or stdin).\n\n" +
          "Options:\n" +
          "  -f, --format FORMAT  table, json, csv, tsv, turtle, n3, markdown\n" +
          "  -o, --output PATH    Write output to a file\n" +
          "  --no-inference       Skip OWL-RL inference\n" +
          "  --reload             Rebuild the graph before querying\n" +
          "  --cache              Persist the graph under .wiki/cache\n" +
          "  --jq PATH            Extract values from JSON output\n" +
          "  --pretty             Render a table for stdout",
      );
      return EXIT_OK;
    } else if (token === "--no-inference") {
      noInference = true;
    } else if (token === "--reload") {
      reload = true;
    } else if (token === "--cache") {
      cache = true;
    } else if (token === "--pretty") {
      pretty = true;
    } else if (token === "-v" || token === "--verbose") {
      verbose = true;
    } else if (token === "-f" || token === "--format") {
      const value = args[index + 1];
      if (value === undefined) {
        return usageError(`Error: Option '${token}' requires an argument.`);
      }
      format = value;
      index += 1;
    } else if (token.startsWith("--format=")) {
      format = token.slice("--format=".length);
    } else if (token === "-o" || token === "--output") {
      const value = args[index + 1];
      if (value === undefined) {
        return usageError(`Error: Option '${token}' requires an argument.`);
      }
      output = value;
      index += 1;
    } else if (token.startsWith("--output=")) {
      output = token.slice("--output=".length);
    } else if (token === "--jq") {
      const value = args[index + 1];
      if (value === undefined) {
        return usageError("Error: Option '--jq' requires an argument.");
      }
      jq = value;
      index += 1;
    } else if (token.startsWith("--jq=")) {
      jq = token.slice("--jq=".length);
    } else if (token.startsWith("-") && token !== "-") {
      return usageError(`Error: No such option: ${token}`);
    } else {
      queryArgs.push(token);
    }
  }

  try {
    const { normalizeQueryFormat } = await import("../format.ts");
    return {
      queryArgs,
      format: normalizeQueryFormat(format),
      output,
      noInference,
      reload,
      cache,
      jq,
      pretty,
      verbose,
    };
  } catch (error) {
    return usageError(
      `Error: ${errorText(error)}`,
    );
  }
}
