import { basename } from "@std/path";
import { ValueError } from "../errors.ts";
import type { Wiki } from "../wiki.ts";
import { EXIT_FAILURE, EXIT_OK } from "./usage.ts";

/**
 * Run `fmt`: format in place, or report which files a run would change.
 *
 * The two modules this needs are imported here rather than at the top of the
 * file, which is what the Python command does too (its imports are inside the
 * function). The port keeps them there because `fmt_util` loads the formatter's
 * WebAssembly plugins,
 * and `cli.ts` must stay importable — and cheap — without permissions so
 * `--version` keeps working.
 */
export async function runFmtCommand(
  wiki: Wiki,
  parsed: {
    readonly files: readonly string[];
    readonly verbose: boolean;
    readonly check: boolean;
  },
): Promise<number> {
  const { describeFmtSource } = await import("../fmt_util.ts");

  try {
    if (parsed.verbose) {
      const explicit = parsed.files[0];
      const probe = explicit ??
        (await import("../paths.ts")).iterMarkdownFiles(wiki.config)[0];
      if (probe !== undefined) {
        console.log(`Using ${describeFmtSource(wiki.config)}.`);
      }
    }

    const report = wiki.format(
      parsed.files.length > 0 ? parsed.files : null,
      { check: parsed.check, verbose: parsed.verbose },
    );

    for (const line of report.verbose_lines) console.log(line);

    if (report.error_message !== null && report.error_message !== undefined) {
      console.error(report.error_message);
      return EXIT_FAILURE;
    }

    if (parsed.check) {
      if (report.stale_files.length > 0) {
        console.error(
          "Error: The following files are not correctly formatted:",
        );
        for (const stale of report.stale_files) {
          console.error(`  - ${basename(stale)}`);
        }
        return EXIT_FAILURE;
      }
      if (parsed.verbose) console.log("All files are correctly formatted.");
      return EXIT_OK;
    }

    if (report.formatted_count > 0) {
      console.log(
        `Format complete. Reformatted ${report.formatted_count} files.`,
      );
    }
    return EXIT_OK;
  } catch (error) {
    if (error instanceof ValueError) {
      console.error(`Error: ${error.message}`);
      return EXIT_FAILURE;
    }
    throw error;
  }
}
