import { pathExists } from "../fspath.ts";
import { errorText } from "../errors.ts";
import type { Wiki } from "../wiki.ts";
import { EXIT_CONFLICT, EXIT_FAILURE, EXIT_OK, usageError } from "./usage.ts";

interface ParsedFixCommand {
  readonly files: readonly string[];
  readonly apply: boolean;
  readonly verbose: boolean;
}

const FIX_HELP = `Usage: wiki fix [OPTIONS] [FILES]...

  Remove frontmatter that repeats a value the graph derives: a headline equal
  to the page's first H1, or a dateCreated/dateModified equal to its Git
  dates. Previews by default; only exact repeats are removed, and every other
  byte of the page is kept.

Options:
  --apply        Write the changes (validated, all files or none).
  -n, --dry-run  Preview without writing files (the default).
  -v, --verbose  Name each removed field and the value it repeats.
  --help         Show this message and exit.`;

export function parseFixCommandArgs(
  args: readonly string[],
): ParsedFixCommand | number {
  const files: string[] = [];
  let apply = false;
  let dryRun = false;
  let verbose = false;
  let optionsEnded = false;
  for (const token of args) {
    if (!optionsEnded && (token === "--help" || token === "-h")) {
      console.log(FIX_HELP);
      return EXIT_OK;
    } else if (!optionsEnded && token === "--") {
      optionsEnded = true;
    } else if (!optionsEnded && token === "--apply") {
      apply = true;
    } else if (!optionsEnded && (token === "-n" || token === "--dry-run")) {
      dryRun = true;
    } else if (!optionsEnded && (token === "-v" || token === "--verbose")) {
      verbose = true;
    } else if (!optionsEnded && token.startsWith("-") && token !== "-") {
      return usageError(`Error: No such option: ${token}`);
    } else {
      if (!pathExists(token)) {
        return usageError(
          `Error: Invalid value for '[FILES]...': Path '${token}' does not exist.`,
        );
      }
      files.push(token);
    }
  }
  if (apply && dryRun) {
    return usageError("Error: --apply and --dry-run cannot be used together.");
  }
  return { files, apply, verbose };
}

/** Run `fix`: preview or remove redundant derived frontmatter (wiki#319). */
export async function runFixCommand(
  wiki: Wiki,
  parsed: ParsedFixCommand,
): Promise<number> {
  let report;
  try {
    report = await wiki.fix(parsed.files.length > 0 ? parsed.files : null, {
      apply: parsed.apply,
    });
  } catch (error) {
    console.error(`Error: ${errorText(error)}`);
    return EXIT_FAILURE;
  }

  let fields = 0;
  let files = 0;
  for (const file of report.files) {
    for (const skipped of file.skipped) {
      console.error(
        `warning: ${file.path}: kept '${skipped.key}': ${skipped.reason}.`,
      );
    }
    if (file.removed.length === 0) continue;
    files += 1;
    fields += file.removed.length;
    if (parsed.verbose) {
      for (const field of file.removed) {
        console.log(
          `${file.path}: ${field.key} (schema:${field.property} = ${
            JSON.stringify(field.value)
          })`,
        );
      }
    } else {
      console.log(file.path);
    }
  }
  const counted = `${fields} redundant field${fields === 1 ? "" : "s"} ` +
    `from ${files} file${files === 1 ? "" : "s"}`;

  switch (report.status) {
    case "clean":
      if (fields === 0) console.log("No redundant frontmatter.");
      return EXIT_OK;
    case "dry_run":
      console.log(`Would remove ${counted}. Re-run with --apply to write.`);
      return EXIT_OK;
    case "applied":
      console.log(`Removed ${counted}.`);
      return EXIT_OK;
    case "conflict":
      console.error("Not written: the files changed while fix was running.");
      return EXIT_CONFLICT;
    case "rejected":
      for (const issue of report.edit?.introduced ?? []) {
        console.error(`${issue.severity}: ${issue.message}`);
      }
      console.error(
        "Not written: removing these fields introduces the errors above.",
      );
      return EXIT_FAILURE;
  }
}
