import { pathExists } from "../fspath.ts";
import { ValueError } from "../errors.ts";
import type { Wiki } from "../wiki.ts";
import { EXIT_FAILURE, EXIT_OK, usageError } from "./usage.ts";

interface ParsedRenderCommand {
  readonly files: readonly string[];
  readonly noInference: boolean;
  readonly reload: boolean;
  readonly cache: boolean;
  readonly check: boolean;
  readonly verbose: boolean;
}

export function parseRenderCommandArgs(
  args: readonly string[],
): ParsedRenderCommand | number {
  const files: string[] = [];
  let noInference = false;
  let reload = false;
  let cache = false;
  let check = false;
  let verbose = false;
  let optionsEnded = false;

  for (const token of args) {
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
        "Usage: wiki render [OPTIONS] [FILES]...\n\n" +
          "Render inline SPARQL blocks in markdown files.\n\n" +
          "Options:\n" +
          "  --no-inference  Skip OWL-RL inference\n" +
          "  --reload        Rebuild the graph before rendering\n" +
          "  --cache         Persist the graph under .wiki/cache\n" +
          "  --check         Check for stale blocks without writing\n" +
          "  -v, --verbose   Print a render summary",
      );
      return EXIT_OK;
    } else if (token === "--no-inference") {
      noInference = true;
    } else if (token === "--reload") {
      reload = true;
    } else if (token === "--cache") {
      cache = true;
    } else if (token === "--check") {
      check = true;
    } else if (token === "-v" || token === "--verbose") {
      verbose = true;
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

  return { files, noInference, reload, cache, check, verbose };
}

export async function runRenderCommand(
  wiki: Wiki,
  parsed: ParsedRenderCommand,
): Promise<number> {
  let report: Awaited<ReturnType<Wiki["render"]>>;
  try {
    report = await wiki.render(parsed.files.length > 0 ? parsed.files : null, {
      check: parsed.check,
      reload: parsed.reload,
      cache: parsed.cache,
      noInference: parsed.noInference,
    });
  } catch (error) {
    if (error instanceof ValueError) {
      console.error(`Error: ${error.message}`);
      return EXIT_FAILURE;
    }
    throw error;
  }

  for (const error of report.render_errors) console.error(error);
  if (parsed.check) {
    if (report.stale_files.length > 0) {
      console.error(
        "Error: Inline SPARQL blocks are out of date in the following files:",
      );
      for (const stale of report.stale_files) console.error(`  - ${stale}`);
      return EXIT_FAILURE;
    }
    if (parsed.verbose) {
      console.log("All dynamic SPARQL blocks are fully up to date.");
    }
    return EXIT_OK;
  }

  if (parsed.verbose) {
    const parts = [`Updated ${report.updated_count} files`];
    if (report.error_count > 0) parts.push(`${report.error_count} errors`);
    console.log(`Rendered SPARQL: ${parts.join(", ")}.`);
  }
  return EXIT_OK;
}
