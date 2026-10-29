import { pathExists } from "../fspath.ts";
import { ValueError } from "../errors.ts";
import type { Wiki } from "../wiki.ts";
import { EXIT_FAILURE, EXIT_OK, usageError } from "./usage.ts";

interface ParsedLinkCommand {
  readonly files: readonly string[];
  readonly apply: boolean;
  readonly fixBroken: boolean;
  readonly dryRun: boolean;
  readonly check: boolean;
  readonly verbose: boolean;
}

export function parseLinkCommandArgs(
  args: readonly string[],
): ParsedLinkCommand | number {
  const files: string[] = [];
  let apply = false;
  let fixBroken = false;
  let dryRun = false;
  let check = false;
  let verbose = false;
  let optionsEnded = false;

  for (let index = 0; index < args.length; index += 1) {
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
      console.log(`Usage: wiki link [OPTIONS] [FILES]...

  Suggest or repair internal links for wiki pages.

Options:
  --apply        Insert suggested internal links (format from link.style in
                 config file).
  --fix-broken   Repair unambiguous broken internal links.
  -n, --dry-run  Preview apply/fix changes without writing files.
  -c, --check    Exit 1 if link opportunities or broken links remain.
  -v, --verbose  Show target titles in suggestions; list changed files when
                 applying.
  --help         Show this message and exit.`);
      return EXIT_OK;
    } else if (token === "--apply") {
      apply = true;
    } else if (token === "--fix-broken") {
      fixBroken = true;
    } else if (token === "-n" || token === "--dry-run") {
      dryRun = true;
    } else if (token === "-c" || token === "--check") {
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

  return { files, apply, fixBroken, dryRun, check, verbose };
}

export async function runLinkCommand(
  wiki: Wiki,
  parsed: ParsedLinkCommand,
): Promise<number> {
  let report: Awaited<ReturnType<Wiki["link"]>>;
  try {
    report = await wiki.link(parsed.files.length > 0 ? parsed.files : null, {
      apply: parsed.apply,
      fixBroken: parsed.fixBroken,
      dryRun: parsed.dryRun,
      check: parsed.check,
      verbose: parsed.verbose,
    });
  } catch (error) {
    if (error instanceof ValueError) {
      console.error(`Error: ${error.message}`);
      return EXIT_FAILURE;
    }
    throw error;
  }

  for (const line of report.lines) console.log(line);
  if (parsed.fixBroken && report.fixes > 0 && parsed.verbose) {
    const prefix = parsed.dryRun ? "would fix" : "fixed";
    for (const path of report.changed_paths) console.log(`${prefix} ${path}`);
  } else if (
    parsed.apply && report.changed_paths.length > 0 &&
    (parsed.verbose || parsed.dryRun)
  ) {
    const prefix = parsed.dryRun ? "would update" : "updated";
    for (const path of report.changed_paths) console.log(`${prefix} ${path}`);
  }

  if (parsed.check && !report.ok) return EXIT_FAILURE;
  if (parsed.fixBroken && !parsed.apply) return EXIT_OK;
  if (parsed.apply) return EXIT_OK;
  if (report.opportunities === 0) return EXIT_OK;
  return parsed.check ? EXIT_FAILURE : EXIT_OK;
}
