import { errorText } from "../errors.ts";
import { exitAuditReport } from "../cli_output.ts";
import type { Wiki } from "../wiki.ts";
import { EXIT_FAILURE, EXIT_OK } from "./usage.ts";
import type { ParsedBuildCommand } from "./build_args.ts";

export async function runBuildCommand(
  wiki: Wiki,
  parsed: ParsedBuildCommand,
): Promise<number> {
  let result: Awaited<ReturnType<Wiki["build"]>>;
  try {
    result = await wiki.build(parsed.outputDir, {
      baseUrl: parsed.baseUrl,
      urlStyle: parsed.urlStyle,
      render: parsed.render,
      reload: parsed.reload,
      cache: parsed.cache,
      noCheck: parsed.noCheck,
      verbose: parsed.verbose,
    });
  } catch (error) {
    console.error(
      `Error: ${errorText(error)}`,
    );
    return EXIT_FAILURE;
  }
  if (parsed.render && parsed.verbose && result.ok) {
    console.log("Rendered SPARQL dynamic blocks before build.");
  }
  if (!result.ok) {
    if (result.error_message) {
      console.error(`Error: ${result.error_message}`);
      return EXIT_FAILURE;
    }
    if (result.preflight) {
      return exitAuditReport(result.preflight, {
        verbose: parsed.verbose,
        strict: false,
      });
    }
    return EXIT_FAILURE;
  }
  if (parsed.verbose) {
    for (const path of result.written_paths) console.log(`  ${path}`);
    console.log(
      `\nBuilt ${result.page_count} pages and ${result.asset_count} assets to ${parsed.outputDir}`,
    );
  }
  return EXIT_OK;
}
