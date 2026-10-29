import { EXIT_OK, usageError } from "./usage.ts";

export interface ParsedBuildCommand {
  readonly outputDir: string;
  readonly baseUrl: string | null;
  readonly urlStyle: "file" | "dir" | null;
  readonly render: boolean;
  readonly reload: boolean;
  readonly cache: boolean;
  readonly noCheck: boolean;
  readonly verbose: boolean;
}

export function parseBuildCommandArgs(
  args: readonly string[],
): ParsedBuildCommand | number {
  let outputDir = "_site";
  let baseUrl: string | null = null;
  let urlStyle: "file" | "dir" | null = null;
  let render = false;
  let reload = false;
  let cache = false;
  let noCheck = false;
  let verbose = false;

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
        `Usage: wiki build [OPTIONS]\n\nBuild static HTML site from wiki documents.\n\nOptions:\n  --output-dir PATH       Directory to write site files. (default: _site)\n  --site-base-url TEXT    Override site.base_url. Empty string for root-level URLs.\n  --site-url-style STYLE  Override site.url_style: file or dir.\n  --render                Render inline SPARQL blocks before building.\n  --reload                Rebuild graph before --render.\n  --cache                 Persist graph under .wiki/cache when using --render.\n  --no-check              Skip lint and check preflight before building.\n  -v, --verbose           Print generated file paths.`,
      );
      return EXIT_OK;
    }
    if (token === "--render") render = true;
    else if (token === "--reload") reload = true;
    else if (token === "--cache") cache = true;
    else if (token === "--no-check") noCheck = true;
    else if (token === "-v" || token === "--verbose") verbose = true;
    else if (token === "--output-dir") {
      const value = readValue();
      if (typeof value === "number") return value;
      outputDir = value;
    } else if (token.startsWith("--output-dir=")) {
      outputDir = token.slice("--output-dir=".length);
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
  return {
    outputDir,
    baseUrl,
    urlStyle,
    render,
    reload,
    cache,
    noCheck,
    verbose,
  };
}
