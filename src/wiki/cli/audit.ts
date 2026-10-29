import { pathExists } from "../fspath.ts";
import { ValueError } from "../errors.ts";
import { exitAuditReport } from "../cli_output.ts";
// Type-only, so the audit stack is not evaluated on import: `wiki.ts` reaches
// `@zazuko/env`, which reads `process.env` while it loads and therefore needs
// `--allow-env` before any command runs. `--version` and an unknown command must
// work under zero permissions (the CLI test asserts exactly that), so the module
// is imported dynamically inside the command that needs it.
import type { Wiki } from "../wiki.ts";
import {
  EXIT_FAILURE,
  EXIT_OK,
  FILE_COMMAND_FLAGS,
  FILE_COMMAND_HELP,
  USAGE_LINES,
  usageError,
} from "./usage.ts";

/** Run an audit command over the wiki the group options resolved to. */
export async function runAuditCommand(
  wiki: Wiki,
  command: "check" | "lint",
  files: readonly string[],
  options: {
    readonly verbose: boolean;
    readonly strict: boolean;
    readonly format?: "text" | "json";
  },
): Promise<number> {
  const report = command === "check"
    ? await wiki.check(files.length > 0 ? files : null, {
      strict: options.strict,
    })
    : await wiki.lint(files.length > 0 ? files : null, {
      strict: options.strict,
    });
  if (options.format === "json") {
    // The payload goes to stdout before the exit code is decided, so CI can
    // read it and still fail on it; the human report stays on stderr.
    const { buildCheckEnvelope } = await import("../check_report.ts");
    const presented = options.strict ? report.applyStrict() : report;
    console.log(
      JSON.stringify(
        buildCheckEnvelope(presented, wiki.config, files),
        null,
        2,
      ),
    );
  }
  return exitAuditReport(report, options);
}

/** Resolve the wiki the group options name, or the exit code that failed. */
export async function loadWiki(
  configPath: string,
  wikiInputs: readonly string[],
): Promise<Wiki | number> {
  const { Wiki: WikiClass } = await import("../wiki.ts");
  try {
    return WikiClass.load(configPath, { wikiInputs });
  } catch (error) {
    // Click's `ClickException` prints `Error: <message>` with no usage block and
    // exits 1 — a config that cannot be loaded is a failed run, not a usage
    // error, because the command line itself was well-formed.
    if (error instanceof ValueError) {
      console.error(`Error: ${error.message}`);
      return EXIT_FAILURE;
    }
    throw error;
  }
}

/** The `FILE...` plus flags tail of a `FILE...` command, or a usage error. */
export function parseFileCommandArgs(
  command: string,
  args: readonly string[],
): {
  readonly files: string[];
  readonly verbose: boolean;
  readonly strict: boolean;
  readonly check: boolean;
  readonly format: "text" | "json";
} | number {
  const flags = FILE_COMMAND_FLAGS[command] ?? [];
  const files: string[] = [];
  let verbose = false;
  let strict = false;
  let check = false;
  let format: "text" | "json" = "text";

  for (let i = 0; i < args.length; i++) {
    const token = args[i]!;
    if (token === "--json" && flags.includes("--json")) {
      format = "json";
      continue;
    }
    if (
      (token === "-f" || token === "--format" ||
        token.startsWith("--format=")) && flags.includes("--format")
    ) {
      let value: string | undefined;
      if (token.startsWith("--format=")) {
        value = token.slice("--format=".length);
      } else {
        value = args[++i];
        if (value === undefined) {
          return usageError(`Error: Option '${token}' requires an argument.`);
        }
      }
      if (value !== "text" && value !== "json") {
        return usageError(
          `Error: Invalid value for '-f' / '--format': '${value}' is not one of 'text', 'json'.`,
        );
      }
      format = value;
      continue;
    }
    if (token === "-v" || token === "--verbose") {
      verbose = true;
      continue;
    }
    if (token === "--strict" && flags.includes("--strict")) {
      strict = true;
      continue;
    }
    if (token === "--check" && flags.includes("--check")) {
      check = true;
      continue;
    }
    if (token === "--help" || token === "-h") {
      console.log(FILE_COMMAND_HELP[command] ?? USAGE_LINES.join("\n"));
      return EXIT_OK;
    }
    if (token.startsWith("-") && token !== "-") {
      return usageError(`Error: No such option: ${token}`);
    }
    const path = token;
    if (!pathExists(path)) {
      return usageError(
        `Error: Invalid value for '[FILES]...': Path '${token}' does not exist.`,
      );
    }
    files.push(path);
  }

  return { files, verbose, strict, check, format };
}
