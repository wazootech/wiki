import { errorText } from "../errors.ts";
import type { Wiki } from "../wiki.ts";
import { EXIT_FAILURE, EXIT_OK, usageError } from "./usage.ts";

interface ParsedServeCommand {
  readonly host: string;
  readonly port: number;
  readonly baseUrl: string | null;
  readonly urlStyle: "file" | "dir" | null;
  readonly watch: boolean;
}

export function parseServeCommandArgs(
  args: readonly string[],
): ParsedServeCommand | number {
  let host = "127.0.0.1";
  let port = 8080;
  let baseUrl: string | null = null;
  let urlStyle: "file" | "dir" | null = null;
  let watch = false;

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]!;
    const readValue = (): string | number => {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("-")) {
        return usageError(`Error: Option '${token}' requires an argument.`);
      }
      index += 1;
      return value;
    };
    if (token === "--help" || token === "-h") {
      console.log(
        `Usage: wiki serve [OPTIONS]\n\nStart a local HTTP server for browsing the wiki.\n\nOptions:\n  --host TEXT             Host to bind the server to. (default: 127.0.0.1)\n  --port INTEGER          Port to serve on. (default: 8080)\n  --site-base-url TEXT    Override site.base_url. Empty string for root-level URLs.\n  --site-url-style STYLE  Override site.url_style: file or dir.\n  --watch                 Watch wiki inputs and reload the browser on changes.`,
      );
      return EXIT_OK;
    }
    if (token === "--watch") watch = true;
    else if (token === "--host") {
      const value = readValue();
      if (typeof value === "number") return value;
      host = value;
    } else if (token.startsWith("--host=")) {
      host = token.slice("--host=".length);
    } else if (token === "--port") {
      const value = readValue();
      if (typeof value === "number") return value;
      if (!/^[+-]?\d+$/.test(value)) {
        return usageError(
          `Error: Invalid value for '--port': '${value}' is not a valid integer.`,
        );
      }
      port = Number(value);
    } else if (token.startsWith("--port=")) {
      const value = token.slice("--port=".length);
      if (!/^[+-]?\d+$/.test(value)) {
        return usageError(
          `Error: Invalid value for '--port': '${value}' is not a valid integer.`,
        );
      }
      port = Number(value);
    } else if (token === "--site-base-url") {
      const value = readValue();
      if (typeof value === "number") return value;
      baseUrl = value;
    } else if (token.startsWith("--site-base-url=")) {
      baseUrl = token.slice("--site-base-url=".length);
    } else if (token === "--site-url-style") {
      const value = readValue();
      if (typeof value === "number") return value;
      if (value !== "file" && value !== "dir") {
        return usageError(
          `Error: Invalid value for '--site-url-style': '${value}'.`,
        );
      }
      urlStyle = value;
    } else if (token.startsWith("--site-url-style=")) {
      const value = token.slice("--site-url-style=".length);
      if (value !== "file" && value !== "dir") {
        return usageError(
          `Error: Invalid value for '--site-url-style': '${value}'.`,
        );
      }
      urlStyle = value;
    } else {
      return usageError(
        token.startsWith("-")
          ? `Error: No such option: ${token}`
          : `Error: Got unexpected extra argument (${token})`,
      );
    }
  }
  return { host, port, baseUrl, urlStyle, watch };
}

export async function runServeCommand(
  wiki: Wiki,
  parsed: ParsedServeCommand,
): Promise<number> {
  try {
    await wiki.serve(parsed);
    return EXIT_OK;
  } catch (error) {
    console.error(
      `Error: ${errorText(error)}`,
    );
    return EXIT_FAILURE;
  }
}
