#!/usr/bin/env -S deno run
/**
 * CLI entrypoint — Deno port of `src/wiki/cli.py`.
 *
 * Ported commands cover wiki validation, formatting, graph/query/export,
 * links, static build/preview, read-only MCP, initialization, Git sources, and
 * self-upgrade. RDF/XML serialization remains an explicit deferral.
 *
 * Three contracts are preserved deliberately, because the differential harness
 * asserts them:
 *
 * - **`--version` prints `wiki, version <v>` to stdout and exits 0**, which is
 *   what Click's `version_option` does.
 * - **An unknown command is a usage error on stderr with exit 2**, spelled the
 *   way Click spells it: the usage lines, a blank line, then
 *   `Error: No such command 'x'.`
 * - **Audit output goes to stderr** through `cli_output.ts`, and the exit code
 *   is the report's, not the printer's.
 *
 * The root help body is shared by `--help` and an empty invocation, with the
 * latter returning Click's usage-error exit code on stderr.
 *
 * Line endings differ from the Python CLI on Windows: Click writes `\r\n`
 * through text-mode stdout, while `console.error` writes `\n`. The migration
 * targets normalised output, not byte parity — see CONTEXT.md.
 */
import { pathExists } from "./fspath.ts";
import { basename } from "@std/path";
import { errorText, ValueError } from "./errors.ts";
import { LEGACY_LINK_STYLE_MAP, LINK_STYLES } from "./schemas/wiki_config.ts";
import { exitAuditReport } from "./cli_output.ts";

import { VERSION } from "./version.ts";
// Type-only, so the audit stack is not evaluated on import: `wiki.ts` reaches
// `@zazuko/env`, which reads `process.env` while it loads and therefore needs
// `--allow-env` before any command runs. `--version` and an unknown command must
// work under zero permissions (the CLI test asserts exactly that), so the module
// is imported dynamically inside the command that needs it.
import type { Wiki, WikiInitOptions } from "./wiki.ts";

/** Program name in usage and version output (mirrors Click's `prog_name`). */
export const PROG_NAME = "wiki";

/** Exit code for a successful run. */
export const EXIT_OK = 0;

/** Exit code for a usage error — matches Click's `UsageError.exit_code`. */
export const EXIT_USAGE = 2;

/** Exit code for a failed command — matches Click's `ClickException`. */
export const EXIT_FAILURE = 1;

/**
 * Exit code for an edit whose `expect` precondition failed: the file changed
 * since the caller read it. Distinct from `1` so an agent knows to re-read and
 * rebuild its plan rather than repair the content.
 */
export const EXIT_CONFLICT = 3;

const USAGE_LINES = [
  `Usage: ${PROG_NAME} [OPTIONS] COMMAND [ARGS]...`,
  `Try '${PROG_NAME} --help' for help.`,
];

const ROOT_HELP_HEADER_LINES = [
  `Usage: ${PROG_NAME} [OPTIONS] COMMAND [ARGS]...`,
  "",
  "  Query, validate, and manage your semantic LLM wiki.",
  "",
  "Options:",
  "  --version          Show the version and exit.",
  "  --input TEXT       Override wiki.input from config file (.md, .yaml, .json,",
  "                     .toml; repeatable).",
  "  -c, --config TEXT  Path to wiki config file or directory containing",
  "                     wiki.yml/wiki.yaml/wiki.json/wiki.toml (default: current",
  "                     directory).",
  "  --help             Show this message and exit.",
  "",
  "Commands:",
];

/** The flags each `FILE...` command accepts, so an unknown one is a usage error. */
const FILE_COMMAND_FLAGS: Readonly<Record<string, readonly string[]>> = {
  check: ["-v", "--verbose", "--strict", "-f", "--format", "--json"],
  lint: ["-v", "--verbose", "--strict"],
  fmt: ["-v", "--verbose", "--check"],
};

const FILE_COMMAND_HELP: Readonly<Record<string, string>> = {
  check: [
    "Usage: wiki check [OPTIONS] [FILES]...",
    "",
    "  Integrity checks: SHACL, JSON Schema, routes, collisions, layout (FILE...:",
    "  SHACL + JSON Schema).",
    "",
    "Options:",
    "  -v, --verbose  Show integrity audit warnings.",
    "  --strict       Elevate all warnings to errors and exit with code 1.",
    "  -f, --format [text|json]",
    "                 Output format (default: text). json writes a structured",
    "                 report to stdout; the text report still goes to stderr.",
    "  --json         Shorthand for --format json.",
    "  --help         Show this message and exit.",
  ].join("\n"),
  lint: [
    "Usage: wiki lint [OPTIONS] [FILES]...",
    "",
    "  Convention audits: links, filenames, headings, and link style.",
    "",
    "Options:",
    "  -v, --verbose  Show convention audit warnings.",
    "  --strict       Elevate all warnings to errors and exit with code 1.",
    "  --help         Show this message and exit.",
  ].join("\n"),
  fmt: [
    "Usage: wiki fmt [OPTIONS] [FILES]...",
    "",
    "  Format markdown wiki pages with the Deno formatter.",
    "",
    "Options:",
    "  --check        Check formatting without writing files back. Exits with code 1 if any files would change.",
    "  -v, --verbose  Print fmt config source and formatted file names.",
    "  --help         Show this message and exit.",
  ].join("\n"),
};

/** Write the short usage to stderr, optionally followed by an error line. */
function usageError(detail: string): number {
  console.error([...USAGE_LINES, "", detail].join("\n"));
  return EXIT_USAGE;
}

function graphUsageError(detail: string): number {
  console.error(
    [
      `Usage: ${PROG_NAME} graph [OPTIONS] COMMAND [ARGS]...`,
      `Try '${PROG_NAME} graph --help' for help.`,
      "",
      `Error: ${detail}`,
    ].join("\n"),
  );
  return EXIT_USAGE;
}

function graphListUsageError(detail: string): number {
  console.error(
    [
      `Usage: ${PROG_NAME} graph list [OPTIONS]`,
      `Try '${PROG_NAME} graph list --help' for help.`,
      "",
      `Error: ${detail}`,
    ].join("\n"),
  );
  return EXIT_USAGE;
}

/** Run an audit command over the wiki the group options resolved to. */
async function runAuditCommand(
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
    const { buildCheckEnvelope } = await import("./check_report.ts");
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
async function loadWiki(
  configPath: string,
  wikiInputs: readonly string[],
): Promise<Wiki | number> {
  const { Wiki: WikiClass } = await import("./wiki.ts");
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
function parseFileCommandArgs(
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
async function runFmtCommand(
  wiki: Wiki,
  parsed: {
    readonly files: readonly string[];
    readonly verbose: boolean;
    readonly check: boolean;
  },
): Promise<number> {
  const { describeFmtSource } = await import("./fmt_util.ts");

  try {
    if (parsed.verbose) {
      const explicit = parsed.files[0];
      const probe = explicit ??
        (await import("./paths.ts")).iterMarkdownFiles(wiki.config)[0];
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

interface ParsedQueryCommand {
  readonly queryArgs: readonly string[];
  readonly format: import("./format.ts").QueryFormat;
  readonly output: string | null;
  readonly noInference: boolean;
  readonly reload: boolean;
  readonly cache: boolean;
  readonly jq: string | null;
  readonly pretty: boolean;
  readonly verbose: boolean;
}

async function parseQueryCommandArgs(
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
    const { normalizeQueryFormat } = await import("./format.ts");
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

interface ParsedLinkCommand {
  readonly files: readonly string[];
  readonly apply: boolean;
  readonly fixBroken: boolean;
  readonly dryRun: boolean;
  readonly check: boolean;
  readonly verbose: boolean;
}

function parseLinkCommandArgs(
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

async function runLinkCommand(
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

interface ParsedExportCommand {
  readonly files: readonly string[];
  readonly output: string | null;
  readonly format: import("./export.ts").ExportFormat;
  readonly mode: "expanded" | "compacted";
}

async function parseExportCommandArgs(
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
          "Export document frontmatter as RDF or JSON-LD.\n\n" +
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
    const { normalizeExportFormat } = await import("./export.ts");
    return { files, output, format: normalizeExportFormat(format), mode };
  } catch (error) {
    return usageError(
      `Error: ${errorText(error)}`,
    );
  }
}

async function runExportCommand(
  wiki: Wiki,
  parsed: ParsedExportCommand,
): Promise<number> {
  let result: Awaited<ReturnType<Wiki["export"]>>;
  try {
    result = await wiki.export(
      parsed.files.length > 0 ? parsed.files : null,
      { format: parsed.format, mode: parsed.mode },
    );
  } catch (error) {
    if (error instanceof ValueError) {
      console.error(`Error: ${error.message}`);
      return EXIT_FAILURE;
    }
    throw error;
  }

  if (!result.ok) {
    console.error(`Error: ${result.error_message ?? "Export failed."}`);
    return EXIT_FAILURE;
  }

  if (parsed.output !== null) {
    try {
      await Deno.writeTextFile(parsed.output, result.output);
    } catch (error) {
      console.error(
        `Error: ${errorText(error)}`,
      );
      return EXIT_FAILURE;
    }
    const rawFormats = new Set(["turtle", "xml", "n3", "nt", "trig", "nquads"]);
    if (rawFormats.has(parsed.format) && parsed.files.length <= 1) {
      console.log(`Written ${parsed.format} output to ${parsed.output}`);
    } else {
      const description = parsed.files.length > 1 ? "payload array" : "payload";
      console.log(`Written ${description} to ${parsed.output}`);
    }
    return EXIT_OK;
  }

  console.log(result.output);
  return EXIT_OK;
}

interface ParsedRenderCommand {
  readonly files: readonly string[];
  readonly noInference: boolean;
  readonly reload: boolean;
  readonly cache: boolean;
  readonly check: boolean;
  readonly verbose: boolean;
}

function parseRenderCommandArgs(
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

async function runRenderCommand(
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

async function runQueryCommand(
  wiki: Wiki,
  parsed: ParsedQueryCommand,
): Promise<number> {
  let sparqlQuery: string;
  if (parsed.queryArgs.length > 0) {
    sparqlQuery = parsed.queryArgs.join(" ");
  } else if (Deno.stdin.isTerminal()) {
    console.error("Error: No query provided.");
    return EXIT_FAILURE;
  } else {
    sparqlQuery = await new Response(Deno.stdin.readable).text();
  }

  if (parsed.pretty && parsed.output !== null) {
    console.error(
      "Error: --pretty writes to stdout only; do not use -o/--output.",
    );
    return EXIT_FAILURE;
  }
  if (parsed.pretty && parsed.jq !== null) {
    console.error("Error: --pretty is incompatible with --jq.");
    return EXIT_FAILURE;
  }
  if (parsed.pretty && parsed.format !== "table") {
    console.error(
      "Error: --pretty only supports table format (default -f table).",
    );
    return EXIT_FAILURE;
  }

  try {
    if (parsed.verbose) {
      const { graphStats, usesNamedGraphs } = await import("./graph.ts");
      const graphOptions = {
        infer: !parsed.noInference,
        reload: parsed.reload,
        diskCache: parsed.cache,
      };
      const graph = usesNamedGraphs(sparqlQuery)
        ? await wiki.dataset(graphOptions)
        : await wiki.graph(graphOptions);
      const stats = graphStats(graph);
      console.log(
        `Graph stats: ${stats.triples} triples, ${stats.subjects} subjects\n`,
      );
    }

    const result = await wiki.query(sparqlQuery, {
      format: parsed.format,
      noInference: parsed.noInference,
      reload: parsed.reload,
      cache: parsed.cache,
      jq: parsed.jq,
      pretty: parsed.pretty,
    });
    if (parsed.output !== null) {
      await Deno.writeTextFile(parsed.output, result);
      console.log(`Written results to ${parsed.output}`);
    } else {
      console.log(result);
    }
    return EXIT_OK;
  } catch (error) {
    console.error(
      `Query Execution Error: ${errorText(error)}`,
    );
    return EXIT_FAILURE;
  }
}

interface ParsedBuildCommand {
  readonly outputDir: string;
  readonly baseUrl: string | null;
  readonly urlStyle: "file" | "dir" | null;
  readonly render: boolean;
  readonly reload: boolean;
  readonly cache: boolean;
  readonly noCheck: boolean;
  readonly verbose: boolean;
}

function parseBuildCommandArgs(
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

interface ParsedServeCommand {
  readonly host: string;
  readonly port: number;
  readonly baseUrl: string | null;
  readonly urlStyle: "file" | "dir" | null;
  readonly watch: boolean;
}

function parseServeCommandArgs(
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

interface ParsedMcpCommand {
  readonly mode: "stdio";
  readonly cache: boolean;
}

function parseMcpCommandArgs(
  args: readonly string[],
): ParsedMcpCommand | number {
  let mode = "stdio";
  let cache = false;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]!;
    if (token === "--help" || token === "-h") {
      console.log(
        `Usage: wiki mcp [OPTIONS]\n\nStart a read-only MCP server for the wiki graph.\n\nOptions:\n  --mode MODE  MCP transport mode. (default: stdio)\n  --cache      Persist graph under .wiki/cache for faster reuse across launches.`,
      );
      return EXIT_OK;
    }
    if (token === "--cache") {
      cache = true;
    } else if (token === "--mode") {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("-")) {
        return usageError(`Error: Option '${token}' requires an argument.`);
      }
      mode = value.toLowerCase();
      index += 1;
    } else if (token.startsWith("--mode=")) {
      mode = token.slice("--mode=".length).toLowerCase();
    } else {
      return usageError(
        token.startsWith("-")
          ? `Error: No such option: ${token}`
          : `Error: Got unexpected extra argument (${token})`,
      );
    }
  }
  if (mode !== "stdio") {
    return usageError(`Error: Invalid value for '--mode': '${mode}'.`);
  }
  return { mode: "stdio", cache };
}

interface ParsedUpgradeCommand {
  readonly checkOnly: boolean;
  readonly yes: boolean;
  readonly verbose: boolean;
}

function parseUpgradeCommandArgs(
  args: readonly string[],
): ParsedUpgradeCommand | number {
  let checkOnly = false;
  let yes = false;
  let verbose = false;
  for (const token of args) {
    if (token === "--help" || token === "-h") {
      console.log(
        "Usage: wiki upgrade [OPTIONS]\n\nCheck for updates and upgrade the wiki CLI.\n\nOptions:\n  -c, --check    Check for updates without upgrading. Exits 1 when outdated.\n  -y, --yes      Skip confirmation and upgrade the global Deno install.\n  -v, --verbose  Show installer command and output.\n  --help         Show this message and exit.",
      );
      return EXIT_OK;
    }
    if (token === "-c" || token === "--check") checkOnly = true;
    else if (token === "-y" || token === "--yes") yes = true;
    else if (token === "-v" || token === "--verbose") verbose = true;
    else return usageError(`Error: No such option: ${token}`);
  }
  return { checkOnly, yes, verbose };
}

interface ParsedUpdateCommand {
  readonly name: string | null;
  readonly dryRun: boolean;
}

function parseInitCommandArgs(
  args: readonly string[],
): WikiInitOptions | number {
  const values: Record<string, unknown> = {
    wiki_inputs: [],
    graph_implicit_types: [],
  };
  const valueOptions: Readonly<Record<string, string>> = {
    "--repo": "repo",
    "--graph-context-wiki": "graph_context_wiki",
    "--site-base-url": "site_base_url",
    "--site-url-style": "site_url_style",
    "--site-layout": "site_layout",
    "--graph-content-predicate": "graph_content_predicate",
    "--link-style": "link_style",
    "--graph-base-iri": "graph_base_iri",
    "--graph-implicit-types-policy": "graph_implicit_types_policy",
    "--template": "template",
  };
  const choices: Readonly<Record<string, readonly string[]>> = {
    "--site-url-style": ["file", "dir"],
    // Derived from the schema so the flag, the scaffold, and the config
    // validator cannot disagree about which link styles exist. The retired
    // spellings are accepted too, because `link.style` in a config file has
    // always honoured them -- the flag and the file must not disagree about
    // which values are legal. `normalizeInitLinkStyle` then rewrites them.
    "--link-style": [...LINK_STYLES, ...Object.keys(LEGACY_LINK_STYLE_MAP)]
      .sort(),
    "--graph-implicit-types-policy": ["fallback", "append"],
  };
  // What a "Choose from" error names. Retired spellings stay accepted but are
  // never advertised, so the message still points at the canonical value.
  const advisedChoices: Readonly<Record<string, readonly string[]>> = {
    "--link-style": [...LINK_STYLES].sort(),
  };
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]!;
    if (token === "--help" || token === "-h") {
      console.log(
        `Usage: wiki init [OPTIONS]\n\nScaffold a new wiki project in the current directory.\n\nOptions:\n  --git                               Run git init after scaffolding.\n  --repo TEXT                         Infer GitHub Pages defaults from owner/repo.\n  --graph-context-wiki TEXT           Override graph.context.wiki.\n  --site-base-url TEXT                Override site.base_url.\n  --site-url-style [file|dir]          Override site.url_style.\n  --site-layout TEXT                  Override site.layout.\n  --graph-content-predicate TEXT      Override graph.content_predicate.\n  --link-style [standard|wikilink]     Override link.style.\n  --input TEXT                        Override wiki.input (repeatable).\n  --graph-base-iri TEXT               Override graph.base_iri.\n  --graph-implicit-types TEXT         Default type for untyped documents (repeatable).\n  --graph-implicit-types-policy TEXT  Strategy for applying implicit types.\n  --graph-include-file-extension      Include .md in graph document URIs.\n  --no-graph-include-file-extension   Omit .md from graph document URIs.\n  --template TEXT                     Use a starter template from wiki-templates.\n  --help                              Show this message and exit.`,
      );
      return EXIT_OK;
    }
    if (token === "--git") {
      values["init_git"] = true;
      continue;
    }
    if (token === "--graph-include-file-extension") {
      values["graph_include_file_extension"] = true;
      continue;
    }
    if (token === "--no-graph-include-file-extension") {
      values["graph_include_file_extension"] = false;
      continue;
    }

    const equalsAt = token.indexOf("=");
    const option = equalsAt < 0 ? token : token.slice(0, equalsAt);
    const field = option === "--input"
      ? "wiki_inputs"
      : option === "--graph-implicit-types"
      ? "graph_implicit_types"
      : valueOptions[option];
    if (field === undefined) {
      return usageError(`Error: No such option: ${token}`);
    }
    let value = equalsAt < 0 ? undefined : token.slice(equalsAt + 1);
    if (value === undefined) {
      value = args[index + 1];
      if (value === undefined || value.startsWith("-")) {
        return usageError(`Error: Option '${option}' requires an argument.`);
      }
      index += 1;
    }
    const allowed = choices[option];
    if (allowed !== undefined && !allowed.includes(value)) {
      const suggested = advisedChoices[option] ?? allowed;
      return usageError(
        `Error: Invalid value for '${option}': '${value}'. Choose from ${
          suggested.map((item) => `'${item}'`).join(", ")
        }.`,
      );
    }
    if (field === "wiki_inputs" || field === "graph_implicit_types") {
      (values[field] as string[]).push(value);
    } else {
      values[field] = value;
    }
  }
  for (const field of ["wiki_inputs", "graph_implicit_types"]) {
    if ((values[field] as string[]).length === 0) delete values[field];
  }
  return values as WikiInitOptions;
}

function parseInstallCommandArgs(
  args: readonly string[],
  command: "install" | "i" = "install",
): string | null | number {
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    console.log(
      `Usage: wiki ${command} [OPTIONS] [URL]\n\n${
        command === "i"
          ? "Alias for install."
          : "Fetch and lock external data sources. With no URL, install declared sources. With a URL, add and fetch one git source."
      }\n\nOptions:\n  --help  Show this message and exit.`,
    );
    return EXIT_OK;
  }
  if (args.length > 1) {
    return usageError(`Error: Got unexpected extra argument (${args[1]}).`);
  }
  if (args.length === 1 && args[0]!.startsWith("-")) {
    return usageError(`Error: No such option: ${args[0]}`);
  }
  return args[0] ?? null;
}

function parseUpdateCommandArgs(
  args: readonly string[],
): ParsedUpdateCommand | number {
  let name: string | null = null;
  let dryRun = false;
  for (const token of args) {
    if (token === "--help" || token === "-h") {
      console.log(
        "Usage: wiki update [OPTIONS] [NAME]\n\nCheck locked sources for newer commits and update wiki.lock.\n\nOptions:\n  -n, --dry-run  Report changes without modifying wiki.lock.\n  --help         Show this message and exit.",
      );
      return EXIT_OK;
    }
    if (token === "-n" || token === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (token.startsWith("-")) {
      return usageError(`Error: No such option: ${token}`);
    }
    if (name !== null) {
      return usageError(`Error: Got unexpected extra argument (${token}).`);
    }
    name = token;
  }
  return { name, dryRun };
}

function parseRemoveCommandArgs(args: readonly string[]): string | number {
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    console.log(
      "Usage: wiki remove [OPTIONS] NAME\n\nRemove a source from the config file, its cache, and wiki.lock.\n\nOptions:\n  --help  Show this message and exit.",
    );
    return EXIT_OK;
  }
  if (args.length === 0) return usageError("Error: Missing argument 'NAME'.");
  if (args.length > 1) {
    return usageError(`Error: Got unexpected extra argument (${args[1]}).`);
  }
  if (args[0]!.startsWith("-")) {
    return usageError(`Error: No such option: ${args[0]}`);
  }
  return args[0]!;
}

function runInstallCommand(wiki: Wiki, url: string | null): number {
  try {
    const lockfile = wiki.install(url);
    const count = lockfile.sources.size;
    if (count === 0) {
      console.log("No sources to install.");
      return EXIT_OK;
    }
    console.log(`Locked ${count} source${count === 1 ? "" : "s"}.`);
    for (const [name, locked] of lockfile.sources) {
      console.log(
        `  ${name}: ${locked.resolved_ref.slice(0, 12)} (${locked.fetched_at})`,
      );
    }
    return EXIT_OK;
  } catch (error) {
    console.error(
      `Error: ${errorText(error)}`,
    );
    return EXIT_FAILURE;
  }
}

function runUpdateCommand(wiki: Wiki, parsed: ParsedUpdateCommand): number {
  try {
    const result = wiki.update(parsed.name, { dryRun: parsed.dryRun });
    if (result.updates.length === 0) {
      console.log("No sources to update.");
      return EXIT_OK;
    }
    if (result.changed.length === 0) {
      console.log("All sources are up to date.");
      return EXIT_OK;
    }
    for (const update of result.changed) {
      const action = parsed.dryRun ? "would update" : "updated";
      console.log(
        `${action} ${update.name}: ${update.previous_ref} -> ${update.current_ref}`,
      );
    }
    if (!parsed.dryRun) {
      const count = result.changed.length;
      console.log(
        `Updated ${count} source${count === 1 ? "" : "s"} in wiki.lock.`,
      );
    }
    return EXIT_OK;
  } catch (error) {
    console.error(
      `Error: ${errorText(error)}`,
    );
    return EXIT_FAILURE;
  }
}

function runRemoveCommand(wiki: Wiki, name: string): number {
  try {
    wiki.remove(name);
    console.log(`Removed source '${name}'.`);
    return EXIT_OK;
  } catch (error) {
    console.error(
      `Error: ${errorText(error)}`,
    );
    return EXIT_FAILURE;
  }
}

async function runUpgradeCommand(
  options: ParsedUpgradeCommand,
): Promise<number> {
  const { runUpgrade } = await import("./upgrade.ts");
  return await runUpgrade(options);
}

async function runInitCommand(options: WikiInitOptions): Promise<number> {
  try {
    const { Wiki: WikiSession } = await import("./wiki.ts");
    const result = WikiSession.init({
      ...options,
      cwd: Deno.cwd(),
      prompt_context_wiki: (defaultValue) => {
        let interactive = false;
        try {
          interactive = Deno.stdin.isTerminal();
        } catch {
          interactive = false;
        }
        if (!interactive) {
          console.error(
            "Non-interactive stdin detected — using the default wiki namespace " +
              `IRI ${defaultValue}. Pass --repo or --graph-context-wiki to control it.`,
          );
          return defaultValue;
        }
        return prompt(
          "Custom wiki namespace IRI (graph.context.wiki)",
          defaultValue,
        )?.trim() || defaultValue;
      },
    });
    if (!result.ok) {
      console.error(
        `Error: ${result.error_message ?? "Initialization failed."}`,
      );
      return EXIT_FAILURE;
    }
    console.log(result.message);
    return EXIT_OK;
  } catch (error) {
    console.error(
      `Error: ${errorText(error)}`,
    );
    return EXIT_FAILURE;
  }
}

async function runBuildCommand(
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

async function runServeCommand(
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

async function runMcpCommand(
  wiki: Wiki,
  parsed: ParsedMcpCommand,
): Promise<number> {
  try {
    const { runMcpServer } = await import("./mcp.ts");
    await runMcpServer(wiki, { mode: parsed.mode, diskCache: parsed.cache });
    return EXIT_OK;
  } catch (error) {
    console.error(
      `Error: ${errorText(error)}`,
    );
    return EXIT_FAILURE;
  }
}
const EDIT_HELP = [
  "Usage: wiki edit [OPTIONS]",
  "",
  "  Validate a batch of page edits and, with --apply, write them atomically.",
  "",
  '  The edit is JSON: {"ops": [...]}, each op one of create, replace, delete,',
  "  set, or patch (wiki new, set, and patch build one for you). Paths are",
  "  relative to the config root. Nothing is written without",
  "  --apply, and nothing is written if the edit introduces check or lint errors",
  '  (unless --force) or an op\'s "expect" hash no longer matches the file.',
  "",
  "  Exit codes: 0 valid (or applied), 1 rejected, 2 usage, 3 conflict.",
  "",
  "Options:",
  "  --from FILE  Read the edit from FILE, or '-' for stdin (default: -).",
  "  --apply      Write the edit. Without it, validate and report only.",
  "  --force      Write even if the edit introduces errors.",
  "  -f, --format [text|json]",
  "               Output format (default: text). json writes the edit report",
  "               to stdout.",
  "  --json       Shorthand for --format json.",
  "  --help       Show this message and exit.",
].join("\n");

interface ParsedEditCommand {
  readonly from: string;
  readonly apply: boolean;
  readonly force: boolean;
  readonly format: "text" | "json";
}

function parseEditCommandArgs(
  args: readonly string[],
): ParsedEditCommand | number {
  let from = "-";
  let apply = false;
  let force = false;
  let format: "text" | "json" = "text";
  for (let i = 0; i < args.length; i++) {
    const token = args[i]!;
    if (token === "--help" || token === "-h") {
      console.log(EDIT_HELP);
      return EXIT_OK;
    }
    if (token === "--apply") {
      apply = true;
    } else if (token === "--force") {
      force = true;
    } else if (token === "--json") {
      format = "json";
    } else if (
      token === "--from" || token === "-f" || token === "--format"
    ) {
      const value = args[++i];
      if (value === undefined) {
        return usageError(`Error: Option '${token}' requires an argument.`);
      }
      if (token === "--from") {
        from = value;
      } else if (value === "text" || value === "json") {
        format = value;
      } else {
        return usageError(
          `Error: Invalid value for '-f' / '--format': '${value}' is not one of 'text', 'json'.`,
        );
      }
    } else if (token.startsWith("--from=")) {
      from = token.slice("--from=".length);
    } else if (token.startsWith("--format=")) {
      const value = token.slice("--format=".length);
      if (value !== "text" && value !== "json") {
        return usageError(
          `Error: Invalid value for '-f' / '--format': '${value}' is not one of 'text', 'json'.`,
        );
      }
      format = value;
    } else if (token.startsWith("-")) {
      return usageError(`Error: No such option: ${token}`);
    } else {
      return usageError(`Error: Got unexpected extra argument (${token}).`);
    }
  }
  return { from, apply, force, format };
}

async function runEditCommand(
  wiki: Wiki,
  parsed: ParsedEditCommand,
): Promise<number> {
  let text: string;
  try {
    text = parsed.from === "-"
      ? await new Response(Deno.stdin.readable).text()
      : await Deno.readTextFile(parsed.from);
  } catch (error) {
    return usageError(
      `Error: Cannot read edit from '${parsed.from}': ${errorText(error)}`,
    );
  }
  let edit: unknown;
  try {
    edit = JSON.parse(text);
  } catch (error) {
    return usageError(`Error: The edit is not valid JSON: ${errorText(error)}`);
  }

  return await applyAndReport(wiki, edit, parsed);
}

interface EditRunOptions {
  readonly apply: boolean;
  readonly force: boolean;
  readonly format: "text" | "json";
}

/**
 * Apply one edit and report it: the shared tail of `wiki edit` and the verbs
 * built on it (`new`, `set`, `patch`, `mv`, `rm`). `extra` adds verb-specific fields to the
 * JSON report, such as `new`'s missing required fields.
 */
async function applyAndReport(
  wiki: Wiki,
  edit: unknown,
  options: EditRunOptions,
  extra: Readonly<Record<string, unknown>> = {},
): Promise<number> {
  const { EditUsageError } = await import("./edit.ts");
  let report;
  try {
    report = await wiki.edit(edit as Parameters<Wiki["edit"]>[0], {
      apply: options.apply,
      force: options.force,
    });
  } catch (error) {
    if (error instanceof EditUsageError) {
      return usageError(`Error: ${error.message}`);
    }
    console.error(`Error: ${errorText(error)}`);
    return EXIT_FAILURE;
  }

  if (options.format === "json") {
    console.log(JSON.stringify({ ...report, ...extra }, null, 2));
  }
  // The human summary always goes to stderr, as `check -f json` does, so a
  // JSON consumer can read stdout and still see why the run failed.
  for (const file of report.files) {
    console.error(`${file.action} ${file.path}`);
  }
  for (const conflict of report.conflicts) {
    console.error(
      `conflict: ${conflict.path} expected ${conflict.expected}, found ${
        conflict.actual ?? "no file"
      }`,
    );
  }
  for (const issue of report.introduced) {
    console.error(`${issue.severity}: ${issue.message}`);
  }
  switch (report.status) {
    case "conflict":
      console.error(
        "Edit not written: the files changed since they were read.",
      );
      return EXIT_CONFLICT;
    case "rejected":
      console.error("Edit not written: it introduces the errors above.");
      return EXIT_FAILURE;
    case "dry_run":
      console.error("Edit is valid. Re-run with --apply to write it.");
      return EXIT_OK;
    case "applied":
      console.error("Edit written.");
      return EXIT_OK;
  }
}

/** Options every write verb takes, listed once for the help texts. */
const WRITE_VERB_OPTIONS = [
  "  --expect HASH  Refuse unless the file's SHA-256 still matches (from wiki",
  "                 show), so a stale read never clobbers a newer write.",
  "  --apply        Write the edit. Without it, validate and report only.",
  "  --force        Write even if the edit introduces errors.",
  "  -f, --format [text|json]",
  "                 Output format (default: text). json writes the edit",
  "                 report to stdout.",
  "  --json         Shorthand for --format json.",
  "  --help         Show this message and exit.",
];

const WRITE_VERB_EXIT_CODES =
  "  Exit codes: 0 valid (or applied), 1 rejected, 2 usage, 3 conflict.";

const NEW_HELP = [
  "Usage: wiki new [OPTIONS] PATH",
  "",
  "  Create a page of a known type, as a wiki edit (see wiki edit).",
  "",
  "  The type's required fields (SHACL sh:minCount, JSON Schema required) come",
  "  first in the frontmatter, then the other --set fields, then an H1 from",
  "  headline or name. A required field you do not --set is left out, so the",
  "  edit is rejected and the report names it. When PATH is a directory, the",
  "  filename comes from the title (Opal Security -> Opal_Security.md).",
  "",
  WRITE_VERB_EXIT_CODES,
  "",
  "Options:",
  "  --type CLASS   The page's type, e.g. schema:Purchase.",
  "  --set KEY=VALUE",
  "                 A frontmatter field; VALUE is YAML (repeatable).",
  "  --body TEXT    Markdown to put under the H1.",
  ...WRITE_VERB_OPTIONS.filter((line) =>
    !line.startsWith("  --expect") && !line.startsWith("                 show)")
  ),
].join("\n");

const SET_HELP = [
  "Usage: wiki set [OPTIONS] PATH FIELD [VALUE]",
  "",
  "  Set one frontmatter field, as a wiki edit (see wiki edit).",
  "",
  "  VALUE is YAML and is written as given (12.00 stays 12.00). FIELD is taken",
  "  literally (schema:price is one key). Comments and key order are kept.",
  "",
  WRITE_VERB_EXIT_CODES,
  "",
  "Options:",
  "  --unset        Remove FIELD instead of setting it.",
  ...WRITE_VERB_OPTIONS,
].join("\n");

const PATCH_HELP = [
  "Usage: wiki patch [OPTIONS] PATH",
  "",
  "  Append to, prepend to, or replace a section of a page, as a wiki edit.",
  "",
  "  The target is the lines under a heading (up to the next heading at the",
  "  same or a higher level), the body, or the frontmatter. Headings match on",
  "  their text or anchor slug; a heading that matches twice is an error.",
  "  Content comes from --content, or stdin.",
  "",
  WRITE_VERB_EXIT_CODES,
  "",
  "Options:",
  "  --heading TEXT  Target the section under this heading.",
  "  --body          Target the whole body.",
  "  --frontmatter   Target the frontmatter YAML.",
  "  --append | --prepend | --replace",
  "                  Where the content goes (exactly one).",
  "  --content TEXT  The content (default: read stdin).",
  ...WRITE_VERB_OPTIONS,
].join("\n");

interface VerbArgs {
  readonly positionals: string[];
  readonly values: Map<string, string[]>;
  readonly flags: Set<string>;
  readonly run: EditRunOptions;
  readonly expect: string | undefined;
}

/**
 * The shared argument parser for the write verbs: the write options
 * every verb takes, plus the verb's own `valueOptions` and `flagOptions`.
 */
function parseVerbArgs(
  args: readonly string[],
  help: string,
  spec: {
    readonly valueOptions: readonly string[];
    readonly flagOptions: readonly string[];
    readonly expect: boolean;
  },
): VerbArgs | number {
  const positionals: string[] = [];
  const values = new Map<string, string[]>();
  const flags = new Set<string>();
  let apply = false;
  let force = false;
  let format: "text" | "json" = "text";
  let expect: string | undefined;
  const valueOptions = new Set([
    ...spec.valueOptions,
    "-f",
    "--format",
    ...(spec.expect ? ["--expect"] : []),
  ]);
  for (let i = 0; i < args.length; i++) {
    const token = args[i]!;
    if (token === "--help" || token === "-h") {
      console.log(help);
      return EXIT_OK;
    }
    let name = token;
    let value: string | undefined;
    if (token.startsWith("--") && token.includes("=")) {
      name = token.slice(0, token.indexOf("="));
      value = token.slice(token.indexOf("=") + 1);
    }
    if (valueOptions.has(name)) {
      value ??= args[++i];
      if (value === undefined) {
        return usageError(`Error: Option '${name}' requires an argument.`);
      }
      if (name === "-f" || name === "--format") {
        if (value !== "text" && value !== "json") {
          return usageError(
            `Error: Invalid value for '-f' / '--format': '${value}' is not one of 'text', 'json'.`,
          );
        }
        format = value;
      } else if (name === "--expect") {
        expect = value;
      } else {
        values.set(name, [...(values.get(name) ?? []), value]);
      }
    } else if (token === "--apply") {
      apply = true;
    } else if (token === "--force") {
      force = true;
    } else if (token === "--json") {
      format = "json";
    } else if (spec.flagOptions.includes(token)) {
      flags.add(token);
    } else if (token.startsWith("-") && token !== "-") {
      return usageError(`Error: No such option: ${token}`);
    } else {
      positionals.push(token);
    }
  }
  return {
    positionals,
    values,
    flags,
    run: { apply, force, format },
    expect,
  };
}

async function runNewCommand(
  wiki: Wiki,
  args: readonly string[],
): Promise<number> {
  const parsed = parseVerbArgs(args, NEW_HELP, {
    valueOptions: ["--type", "--set", "--body"],
    flagOptions: [],
    expect: false,
  });
  if (typeof parsed === "number") return parsed;
  if (parsed.positionals.length !== 1) {
    return usageError("Error: wiki new takes exactly one PATH.");
  }
  const {
    requiredFields,
    scaffoldPage,
    scaffoldTitle,
    titleFilename,
    typeKey,
  } = await import("./edit_ops.ts");
  const { EditOpError } = await import("./edit_ops.ts");
  const { isDirectory } = await import("./fspath.ts");
  const { join, resolve } = await import("@std/path");

  const fields: Array<readonly [string, { yaml: string }]> = [];
  for (const entry of parsed.values.get("--set") ?? []) {
    const at = entry.indexOf("=");
    if (at <= 0) {
      return usageError(`Error: --set takes KEY=VALUE; got '${entry}'.`);
    }
    fields.push([entry.slice(0, at), { yaml: entry.slice(at + 1) }]);
  }
  const type = parsed.values.get("--type")?.at(-1) ?? null;

  let path = parsed.positionals[0]!;
  try {
    if (
      /[\\/]$/.test(path) ||
      isDirectory(resolve(wiki.config.config_root, path))
    ) {
      const title = scaffoldTitle(fields);
      if (title === null) {
        return usageError(
          "Error: PATH is a directory, so the filename comes from the title; --set headline=... or name=....",
        );
      }
      path = join(path, titleFilename(title));
    }
    const required = type === null
      ? []
      : await requiredFields(wiki.config, type);
    const content = scaffoldPage({
      path,
      typeKey: typeKey(wiki.config),
      type,
      required,
      fields,
      body: parsed.values.get("--body")?.at(-1) ?? null,
    });
    const supplied = new Set(fields.map(([key]) => key));
    const missing = required.filter((key) => !supplied.has(key));
    if (missing.length > 0) {
      console.error(`missing required fields: ${missing.join(", ")}`);
    }
    return await applyAndReport(
      wiki,
      { ops: [{ op: "create", path, content, expect: "absent" }] },
      parsed.run,
      { required, missing },
    );
  } catch (error) {
    if (error instanceof EditOpError) {
      return usageError(`Error: ${error.message}`);
    }
    throw error;
  }
}

async function runSetCommand(
  wiki: Wiki,
  args: readonly string[],
): Promise<number> {
  const parsed = parseVerbArgs(args, SET_HELP, {
    valueOptions: [],
    flagOptions: ["--unset"],
    expect: true,
  });
  if (typeof parsed === "number") return parsed;
  const unset = parsed.flags.has("--unset");
  const wanted = unset ? 2 : 3;
  if (parsed.positionals.length !== wanted) {
    return usageError(
      unset
        ? "Error: wiki set --unset takes PATH and FIELD."
        : "Error: wiki set takes PATH, FIELD, and VALUE (or --unset).",
    );
  }
  const [path, field, value] = parsed.positionals as [string, string, string?];
  const op = unset
    ? { op: "set", path, field, value: null }
    : { op: "set", path, field, yaml: value };
  return await applyAndReport(
    wiki,
    { ops: [{ ...op, ...(parsed.expect ? { expect: parsed.expect } : {}) }] },
    parsed.run,
  );
}

async function runPatchCommand(
  wiki: Wiki,
  args: readonly string[],
): Promise<number> {
  const parsed = parseVerbArgs(args, PATCH_HELP, {
    valueOptions: ["--heading", "--content"],
    flagOptions: [
      "--body",
      "--frontmatter",
      "--append",
      "--prepend",
      "--replace",
    ],
    expect: true,
  });
  if (typeof parsed === "number") return parsed;
  if (parsed.positionals.length !== 1) {
    return usageError("Error: wiki patch takes exactly one PATH.");
  }
  const heading = parsed.values.get("--heading")?.at(-1);
  const targets = [
    heading !== undefined,
    parsed.flags.has("--body"),
    parsed.flags.has("--frontmatter"),
  ].filter(Boolean).length;
  if (targets !== 1) {
    return usageError(
      "Error: give exactly one target: --heading TEXT, --body, or --frontmatter.",
    );
  }
  const modes = (["append", "prepend", "replace"] as const).filter((mode) =>
    parsed.flags.has(`--${mode}`)
  );
  if (modes.length !== 1) {
    return usageError(
      "Error: give exactly one of --append, --prepend, or --replace.",
    );
  }
  const content = parsed.values.get("--content")?.at(-1) ??
    await new Response(Deno.stdin.readable).text();
  const target = heading !== undefined
    ? { heading }
    : parsed.flags.has("--body")
    ? { body: true }
    : { frontmatter: true };
  return await applyAndReport(wiki, {
    ops: [{
      op: "patch",
      path: parsed.positionals[0]!,
      target,
      mode: modes[0],
      content,
      ...(parsed.expect ? { expect: parsed.expect } : {}),
    }],
  }, parsed.run);
}

const MV_HELP = [
  "Usage: wiki mv [OPTIONS] FROM TO",
  "",
  "  Move or rename a page, as a wiki edit (see wiki edit).",
  "",
  "  Every page that links to FROM is repointed at TO, in the link's own style",
  "  (wikilink or markdown, extension, ./ prefix, #fragment kept); FROM's own",
  "  relative links are re-derived when it changes directory; and wiki: CURIEs",
  "  and the page's IRI in other pages' frontmatter follow it. TO must not",
  "  exist (exit 3 if it does); --expect applies to FROM.",
  "",
  WRITE_VERB_EXIT_CODES,
  "",
  "Options:",
  ...WRITE_VERB_OPTIONS,
].join("\n");

const RM_HELP = [
  "Usage: wiki rm [OPTIONS] PATH",
  "",
  "  Delete a page, as a wiki edit (see wiki edit).",
  "",
  "  Refuses (exit 1, naming each linking page) while other pages link to",
  "  PATH, unless --prune-links turns those links into their plain label text.",
  "",
  WRITE_VERB_EXIT_CODES,
  "",
  "Options:",
  "  --prune-links  Replace inbound links with their label text.",
  ...WRITE_VERB_OPTIONS,
].join("\n");

async function runMvCommand(
  wiki: Wiki,
  args: readonly string[],
): Promise<number> {
  const parsed = parseVerbArgs(args, MV_HELP, {
    valueOptions: [],
    flagOptions: [],
    expect: true,
  });
  if (typeof parsed === "number") return parsed;
  if (parsed.positionals.length !== 2) {
    return usageError("Error: wiki mv takes FROM and TO.");
  }
  const [from, to] = parsed.positionals as [string, string];
  return await applyAndReport(wiki, {
    ops: [{
      op: "move",
      from,
      to,
      ...(parsed.expect ? { expect: parsed.expect } : {}),
    }],
  }, parsed.run);
}

async function runRmCommand(
  wiki: Wiki,
  args: readonly string[],
): Promise<number> {
  const parsed = parseVerbArgs(args, RM_HELP, {
    valueOptions: [],
    flagOptions: ["--prune-links"],
    expect: true,
  });
  if (typeof parsed === "number") return parsed;
  if (parsed.positionals.length !== 1) {
    return usageError("Error: wiki rm takes exactly one PATH.");
  }
  return await applyAndReport(wiki, {
    ops: [{
      op: "delete",
      path: parsed.positionals[0]!,
      ...(parsed.flags.has("--prune-links") ? { pruneLinks: true } : {}),
      ...(parsed.expect ? { expect: parsed.expect } : {}),
    }],
  }, parsed.run);
}

const SHOW_HELP = [
  "Usage: wiki show [OPTIONS] PATH",
  "",
  "  Describe one page as the engine sees it: frontmatter, compacted JSON-LD,",
  "  heading outline, outbound links, and the content hash to pass as an edit",
  '  op\'s "expect". PATH is relative to the config root, as in wiki edit.',
  "",
  "Options:",
  "  --field KEY  Print only this frontmatter field (exit 1 when it is unset).",
  "  -f, --format [text|json]",
  "               Output format (default: text).",
  "  --json       Shorthand for --format json.",
  "  --help       Show this message and exit.",
].join("\n");

const REFS_HELP = [
  "Usage: wiki refs [OPTIONS] PATH",
  "",
  "  List the pages that link to PATH and the pages PATH links to.",
  "  PATH is relative to the config root, as in wiki edit.",
  "",
  "Options:",
  "  -f, --format [text|json]",
  "               Output format (default: text).",
  "  --json       Shorthand for --format json.",
  "  --help       Show this message and exit.",
].join("\n");

interface ParsedReadCommand {
  readonly path: string;
  readonly field: string | null;
  readonly format: "text" | "json";
}

/** Shared parser for `show` and `refs`: one PATH, a format, and `show`'s `--field`. */
function parseReadCommandArgs(
  command: "show" | "refs",
  args: readonly string[],
): ParsedReadCommand | number {
  let path: string | null = null;
  let field: string | null = null;
  let format: "text" | "json" = "text";
  const invalidFormat = (value: string) =>
    usageError(
      `Error: Invalid value for '-f' / '--format': '${value}' is not one of 'text', 'json'.`,
    );
  for (let i = 0; i < args.length; i++) {
    const token = args[i]!;
    if (token === "--help" || token === "-h") {
      console.log(command === "show" ? SHOW_HELP : REFS_HELP);
      return EXIT_OK;
    }
    if (token === "--json") {
      format = "json";
    } else if (token === "-f" || token === "--format") {
      const value = args[++i];
      if (value === undefined) {
        return usageError(`Error: Option '${token}' requires an argument.`);
      }
      if (value !== "text" && value !== "json") return invalidFormat(value);
      format = value;
    } else if (token.startsWith("--format=")) {
      const value = token.slice("--format=".length);
      if (value !== "text" && value !== "json") return invalidFormat(value);
      format = value;
    } else if (command === "show" && token === "--field") {
      const value = args[++i];
      if (value === undefined) {
        return usageError(`Error: Option '${token}' requires an argument.`);
      }
      field = value;
    } else if (command === "show" && token.startsWith("--field=")) {
      field = token.slice("--field=".length);
    } else if (token.startsWith("-") && token !== "-") {
      return usageError(`Error: No such option: ${token}`);
    } else if (path === null) {
      path = token;
    } else {
      return usageError(`Error: Got unexpected extra argument (${token}).`);
    }
  }
  if (path === null) return usageError("Error: Missing argument 'PATH'.");
  return { path, field, format };
}

/** Render a frontmatter value on one line: strings bare, the rest as JSON. */
function fieldText(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

async function runShowCommand(
  wiki: Wiki,
  parsed: ParsedReadCommand,
): Promise<number> {
  const { EditUsageError } = await import("./edit.ts");
  let report;
  try {
    report = await wiki.show(parsed.path);
  } catch (error) {
    if (error instanceof EditUsageError) {
      return usageError(`Error: ${error.message}`);
    }
    console.error(`Error: ${errorText(error)}`);
    return EXIT_FAILURE;
  }

  if (parsed.field !== null) {
    const frontmatter = report.frontmatter ?? {};
    if (!Object.hasOwn(frontmatter, parsed.field)) {
      console.error(`Error: ${report.path} has no field '${parsed.field}'.`);
      return EXIT_FAILURE;
    }
    const value = frontmatter[parsed.field];
    console.log(
      parsed.format === "json"
        ? JSON.stringify(value, null, 2)
        : fieldText(value),
    );
    return EXIT_OK;
  }

  if (parsed.format === "json") {
    console.log(JSON.stringify(report, null, 2));
    return EXIT_OK;
  }
  const lines = [`${report.path} (${report.route})`, `hash: ${report.hash}`];
  if (report.frontmatter !== null) {
    lines.push("frontmatter:");
    for (const [key, value] of Object.entries(report.frontmatter)) {
      lines.push(`  ${key}: ${fieldText(value)}`);
    }
  }
  if (report.headings.length > 0) {
    lines.push("headings:");
    for (const heading of report.headings) {
      lines.push(
        `  ${"#".repeat(heading.level)} ${heading.text} (line ${heading.line})`,
      );
    }
  }
  if (report.links.length > 0) {
    lines.push("links:");
    for (const link of report.links) lines.push(`  ${link.path ?? link.route}`);
  }
  console.log(lines.join("\n"));
  return EXIT_OK;
}

async function runRefsCommand(
  wiki: Wiki,
  parsed: ParsedReadCommand,
): Promise<number> {
  const { EditUsageError } = await import("./edit.ts");
  let report;
  try {
    report = wiki.refs(parsed.path);
  } catch (error) {
    if (error instanceof EditUsageError) {
      return usageError(`Error: ${error.message}`);
    }
    console.error(`Error: ${errorText(error)}`);
    return EXIT_FAILURE;
  }
  if (parsed.format === "json") {
    console.log(JSON.stringify(report, null, 2));
    return EXIT_OK;
  }
  const lines = [`${report.path} (${report.route})`];
  lines.push(`inbound (${report.inbound.length}):`);
  for (const ref of report.inbound) lines.push(`  ${ref.path ?? ref.route}`);
  lines.push(`outbound (${report.outbound.length}):`);
  for (const ref of report.outbound) lines.push(`  ${ref.path ?? ref.route}`);
  console.log(lines.join("\n"));
  return EXIT_OK;
}

interface CommandContext {
  readonly command: string;
  readonly args: readonly string[];
  readonly configPath: string;
  readonly wikiInputs: readonly string[];
}

interface CommandDefinition {
  readonly names: readonly string[];
  readonly description: string;
  readonly run: (context: CommandContext) => Promise<number>;
}

const COMMANDS: readonly CommandDefinition[] = [
  {
    names: ["build"],
    description: "Build static HTML site from wiki documents.",
    run: async ({ args, configPath, wikiInputs }) => {
      const parsed = parseBuildCommandArgs(args);
      if (typeof parsed === "number") return parsed;
      const wiki = await loadWiki(configPath, wikiInputs);
      if (typeof wiki === "number") return wiki;
      return await runBuildCommand(wiki, parsed);
    },
  },
  {
    names: ["check"],
    description: "Integrity checks: SHACL, JSON Schema, routes, collisions,...",
    run: async ({ command, args, configPath, wikiInputs }) => {
      const parsed = parseFileCommandArgs(command, args);
      if (typeof parsed === "number") return parsed;
      const wiki = await loadWiki(configPath, wikiInputs);
      if (typeof wiki === "number") return wiki;
      return await runAuditCommand(wiki, "check", parsed.files, parsed);
    },
  },
  {
    names: ["edit"],
    description: "Validate page edits and write them atomically (--apply).",
    run: async ({ args, configPath, wikiInputs }) => {
      const parsed = parseEditCommandArgs(args);
      if (typeof parsed === "number") return parsed;
      const wiki = await loadWiki(configPath, wikiInputs);
      if (typeof wiki === "number") return wiki;
      return await runEditCommand(wiki, parsed);
    },
  },
  {
    names: ["export"],
    description: "Export document frontmatter as RDF or JSON-LD.",
    run: async ({ args, configPath, wikiInputs }) => {
      const parsed = await parseExportCommandArgs(args);
      if (typeof parsed === "number") return parsed;
      const wiki = await loadWiki(configPath, wikiInputs);
      if (typeof wiki === "number") return wiki;
      return await runExportCommand(wiki, parsed);
    },
  },
  {
    names: ["fmt"],
    description: "Format markdown wiki pages with the Deno formatter.",
    run: async ({ command, args, configPath, wikiInputs }) => {
      const parsed = parseFileCommandArgs(command, args);
      if (typeof parsed === "number") return parsed;
      const wiki = await loadWiki(configPath, wikiInputs);
      if (typeof wiki === "number") return wiki;
      return await runFmtCommand(wiki, parsed);
    },
  },
  {
    names: ["graph"],
    description: "Inspect read-only RDF named graph provenance.",
    run: async ({ args, configPath, wikiInputs }) => {
      const graphCommand = args[0];
      if (graphCommand === "--help" || graphCommand === "-h") {
        console.log([
          "Usage: wiki graph [OPTIONS] COMMAND [ARGS]...",
          "",
          "  Inspect read-only RDF named graph provenance.",
          "",
          "Options:",
          "  --help  Show this message and exit.",
          "",
          "Commands:",
          "  list  List named graphs available to SPARQL GRAPH queries.",
        ].join("\n"));
        return EXIT_OK;
      }
      if (
        graphCommand === "list" &&
        (args[1] === "--help" || args[1] === "-h")
      ) {
        console.log([
          "Usage: wiki graph list [OPTIONS]",
          "",
          "  List named graphs available to SPARQL GRAPH queries.",
          "",
          "Options:",
          "  --help  Show this message and exit.",
        ].join("\n"));
        return EXIT_OK;
      }
      if (graphCommand === undefined) {
        return graphUsageError("Missing command.");
      }
      if (graphCommand !== "list") {
        return graphUsageError(`No such command '${graphCommand}'.`);
      }
      if (args.length > 1) {
        return graphListUsageError(
          `Got unexpected extra argument (${args[1]})`,
        );
      }
      const wiki = await loadWiki(configPath, wikiInputs);
      if (typeof wiki === "number") return wiki;
      const descriptors = wiki.graphs();
      const headers = ["name", "kind", "uri", "commit", "required_by"];
      const rows = descriptors.map((descriptor) => [
        descriptor.name,
        descriptor.kind,
        descriptor.uri,
        descriptor.resolved_ref?.slice(0, 12) ?? "",
        descriptor.required_by.join(","),
      ]);
      const widths = headers.map((header, index) =>
        Math.max(header.length, ...rows.map((row) => row[index]!.length))
      );
      console.log(
        headers.map((header, index) => header.padEnd(widths[index]!)).join(
          "  ",
        ),
      );
      console.log(widths.map((width) => "-".repeat(width)).join("  "));
      for (const row of rows) {
        console.log(
          row.map((value, index) => value.padEnd(widths[index]!)).join("  "),
        );
      }
      return EXIT_OK;
    },
  },
  {
    names: ["init"],
    description: "Scaffold a new wiki project in the current directory.",
    run: async ({ args }) => {
      const parsed = parseInitCommandArgs(args);
      if (typeof parsed === "number") return parsed;
      return await runInitCommand(parsed);
    },
  },
  {
    names: ["install", "i"],
    description: "Fetch and lock external data sources.",
    run: async ({ command, args, configPath, wikiInputs }) => {
      const parsed = parseInstallCommandArgs(
        args,
        command === "i" ? "i" : "install",
      );
      if (typeof parsed === "number") return parsed;
      const wiki = await loadWiki(configPath, wikiInputs);
      if (typeof wiki === "number") return wiki;
      return runInstallCommand(wiki, parsed);
    },
  },
  {
    names: ["link"],
    description: "Suggest or repair internal links for wiki pages.",
    run: async ({ args, configPath, wikiInputs }) => {
      const parsed = parseLinkCommandArgs(args);
      if (typeof parsed === "number") return parsed;
      const wiki = await loadWiki(configPath, wikiInputs);
      if (typeof wiki === "number") return wiki;
      return await runLinkCommand(wiki, parsed);
    },
  },
  {
    names: ["lint"],
    description:
      "Convention audits: links, filenames, headings, and link style.",
    run: async ({ command, args, configPath, wikiInputs }) => {
      const parsed = parseFileCommandArgs(command, args);
      if (typeof parsed === "number") return parsed;
      const wiki = await loadWiki(configPath, wikiInputs);
      if (typeof wiki === "number") return wiki;
      return await runAuditCommand(wiki, "lint", parsed.files, parsed);
    },
  },
  {
    names: ["mcp"],
    description: "Start a read-only MCP server for the wiki graph.",
    run: async ({ args, configPath, wikiInputs }) => {
      const parsed = parseMcpCommandArgs(args);
      if (typeof parsed === "number") return parsed;
      const wiki = await loadWiki(configPath, wikiInputs);
      if (typeof wiki === "number") return wiki;
      return await runMcpCommand(wiki, parsed);
    },
  },
  {
    names: ["mv"],
    description: "Move or rename a page and repoint its links (an edit).",
    run: async ({ args, configPath, wikiInputs }) => {
      if (args.includes("--help") || args.includes("-h")) {
        console.log(MV_HELP);
        return EXIT_OK;
      }
      const wiki = await loadWiki(configPath, wikiInputs);
      if (typeof wiki === "number") return wiki;
      return await runMvCommand(wiki, args);
    },
  },
  {
    names: ["new"],
    description: "Create a page of a known type (an edit; --apply to write).",
    run: async ({ args, configPath, wikiInputs }) => {
      if (args.includes("--help") || args.includes("-h")) {
        console.log(NEW_HELP);
        return EXIT_OK;
      }
      const wiki = await loadWiki(configPath, wikiInputs);
      if (typeof wiki === "number") return wiki;
      return await runNewCommand(wiki, args);
    },
  },
  {
    names: ["patch"],
    description: "Append to, prepend to, or replace a page section (an edit).",
    run: async ({ args, configPath, wikiInputs }) => {
      if (args.includes("--help") || args.includes("-h")) {
        console.log(PATCH_HELP);
        return EXIT_OK;
      }
      const wiki = await loadWiki(configPath, wikiInputs);
      if (typeof wiki === "number") return wiki;
      return await runPatchCommand(wiki, args);
    },
  },
  {
    names: ["query"],
    description: "Run SPARQL SELECT or CONSTRUCT (query argument or stdin).",
    run: async ({ args, configPath, wikiInputs }) => {
      const parsed = await parseQueryCommandArgs(args);
      if (typeof parsed === "number") return parsed;
      const wiki = await loadWiki(configPath, wikiInputs);
      if (typeof wiki === "number") return wiki;
      return await runQueryCommand(wiki, parsed);
    },
  },
  {
    names: ["refs"],
    description: "List the pages linking to and from one page.",
    run: async ({ args, configPath, wikiInputs }) => {
      const parsed = parseReadCommandArgs("refs", args);
      if (typeof parsed === "number") return parsed;
      const wiki = await loadWiki(configPath, wikiInputs);
      if (typeof wiki === "number") return wiki;
      return await runRefsCommand(wiki, parsed);
    },
  },
  {
    names: ["remove"],
    description:
      "Remove a source from the config file, its cache, and wiki.lock.",
    run: async ({ args, configPath, wikiInputs }) => {
      const parsed = parseRemoveCommandArgs(args);
      if (typeof parsed === "number") return parsed;
      const wiki = await loadWiki(configPath, wikiInputs);
      if (typeof wiki === "number") return wiki;
      return runRemoveCommand(wiki, parsed);
    },
  },
  {
    names: ["render"],
    description: "Render inline SPARQL blocks in markdown files.",
    run: async ({ args, configPath, wikiInputs }) => {
      const parsed = parseRenderCommandArgs(args);
      if (typeof parsed === "number") return parsed;
      const wiki = await loadWiki(configPath, wikiInputs);
      if (typeof wiki === "number") return wiki;
      return await runRenderCommand(wiki, parsed);
    },
  },
  {
    names: ["rm"],
    description: "Delete a page, refusing while pages link to it (an edit).",
    run: async ({ args, configPath, wikiInputs }) => {
      if (args.includes("--help") || args.includes("-h")) {
        console.log(RM_HELP);
        return EXIT_OK;
      }
      const wiki = await loadWiki(configPath, wikiInputs);
      if (typeof wiki === "number") return wiki;
      return await runRmCommand(wiki, args);
    },
  },
  {
    names: ["serve"],
    description: "Start a local HTTP server for browsing the wiki.",
    run: async ({ args, configPath, wikiInputs }) => {
      const parsed = parseServeCommandArgs(args);
      if (typeof parsed === "number") return parsed;
      const wiki = await loadWiki(configPath, wikiInputs);
      if (typeof wiki === "number") return wiki;
      return await runServeCommand(wiki, parsed);
    },
  },
  {
    names: ["set"],
    description: "Set or remove one frontmatter field (an edit).",
    run: async ({ args, configPath, wikiInputs }) => {
      if (args.includes("--help") || args.includes("-h")) {
        console.log(SET_HELP);
        return EXIT_OK;
      }
      const wiki = await loadWiki(configPath, wikiInputs);
      if (typeof wiki === "number") return wiki;
      return await runSetCommand(wiki, args);
    },
  },
  {
    names: ["show"],
    description: "Describe one page: frontmatter, JSON-LD, outline, hash.",
    run: async ({ args, configPath, wikiInputs }) => {
      const parsed = parseReadCommandArgs("show", args);
      if (typeof parsed === "number") return parsed;
      const wiki = await loadWiki(configPath, wikiInputs);
      if (typeof wiki === "number") return wiki;
      return await runShowCommand(wiki, parsed);
    },
  },
  {
    names: ["update"],
    description: "Check locked sources for newer commits and update wiki.lock.",
    run: async ({ args, configPath, wikiInputs }) => {
      const parsed = parseUpdateCommandArgs(args);
      if (typeof parsed === "number") return parsed;
      const wiki = await loadWiki(configPath, wikiInputs);
      if (typeof wiki === "number") return wiki;
      return runUpdateCommand(wiki, parsed);
    },
  },
  {
    names: ["upgrade"],
    description: "Check for updates and upgrade the wiki CLI.",
    run: async ({ args }) => {
      const parsed = parseUpgradeCommandArgs(args);
      if (typeof parsed === "number") return parsed;
      return await runUpgradeCommand(parsed);
    },
  },
];

export const COMMAND_NAMES: readonly string[] = COMMANDS.flatMap(({ names }) =>
  names
);

const COMMAND_BY_NAME = new Map<string, CommandDefinition>();
for (const command of COMMANDS) {
  for (const name of command.names) COMMAND_BY_NAME.set(name, command);
}

const COMMAND_HELP_WIDTH = Math.max(
  ...COMMANDS.map(({ names }) => names.join(", ").length),
);
const ROOT_HELP_LINES = [
  ...ROOT_HELP_HEADER_LINES,
  ...COMMANDS.map(({ names, description }) =>
    `  ${names.join(", ").padEnd(COMMAND_HELP_WIDTH)}  ${description}`
  ),
];
/**
 * Run the CLI and return the process exit code.
 *
 * Asynchronous since `check` became so: the audit's SHACL pass reads the graph
 * through loaders that fetch, and the group resolves the wiki before any command
 * runs.
 */
export async function main(
  argv: readonly string[] = Deno.args,
): Promise<number> {
  let configPath = ".";
  const wikiInputs: string[] = [];

  let index = 0;
  for (; index < argv.length; index += 1) {
    const token = argv[index] as string;

    // Click's `version_option` is eager: it wins wherever it appears before the
    // command, and prints to stdout.
    if (token === "--version") {
      console.log(`${PROG_NAME}, version ${VERSION}`);
      return EXIT_OK;
    }
    if (token === "--help" || token === "-h") {
      console.log(ROOT_HELP_LINES.join("\n"));
      return EXIT_OK;
    }
    if (token === "-c" || token === "--config") {
      const value = argv[index + 1];
      if (value === undefined) {
        return usageError(`Error: Option '${token}' requires an argument.`);
      }
      configPath = value;
      index += 1;
      continue;
    }
    if (token.startsWith("--config=")) {
      configPath = token.slice("--config=".length);
      continue;
    }
    if (token === "--input") {
      const value = argv[index + 1];
      if (value === undefined) {
        return usageError("Error: Option '--input' requires an argument.");
      }
      wikiInputs.push(value);
      index += 1;
      continue;
    }
    if (token.startsWith("--input=")) {
      wikiInputs.push(token.slice("--input=".length));
      continue;
    }
    if (token.startsWith("-") && token !== "-") {
      return usageError(`Error: No such option: ${token}`);
    }
    break;
  }

  const command = argv[index];
  if (command === undefined) {
    console.error(ROOT_HELP_LINES.join("\n"));
    return EXIT_USAGE;
  }

  const definition = COMMAND_BY_NAME.get(command);
  if (definition === undefined) {
    return usageError(`Error: No such command '${command}'.`);
  }

  return await definition.run({
    command,
    args: argv.slice(index + 1),
    configPath,
    wikiInputs,
  });
}

if (import.meta.main) {
  Deno.exit(await main());
}
