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
 * targets normalised output, not byte parity — see the ADR.
 */
import { exitAuditReport } from "./cli_output.ts";
import { Path, ValueError } from "./fspath.ts";
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

const USAGE_LINES = [
  `Usage: ${PROG_NAME} [OPTIONS] COMMAND [ARGS]...`,
  `Try '${PROG_NAME} --help' for help.`,
];

const ROOT_HELP_LINES = [
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
  "  build    Build static HTML site from wiki documents.",
  "  check    Integrity checks: SHACL, JSON Schema, routes, collisions,...",
  "  export   Export document frontmatter as RDF or JSON-LD.",
  "  fmt      Format markdown wiki pages using mdformat.",
  "  graph    Inspect read-only RDF named graph provenance.",
  "  init     Scaffold a new wiki project in the current directory.",
  "  install  Fetch and lock external data sources.",
  "  link     Suggest or repair internal links for wiki pages.",
  "  lint     Convention audits: links, filenames, headings, and link style.",
  "  mcp      Start a read-only MCP server for the wiki graph.",
  "  query    Run SPARQL SELECT or CONSTRUCT (query argument or stdin).",
  "  remove   Remove a source from the config file, its cache, and wiki.lock.",
  "  render   Render inline SPARQL blocks in markdown files.",
  "  serve    Start a local HTTP server for browsing the wiki.",
  "  update   Check locked sources for newer commits and update wiki.lock.",
  "  upgrade  Check for updates and upgrade the wiki CLI.",
];

/** Every command the Python CLI declares, ported or not. */
const KNOWN_COMMANDS: readonly string[] = [
  "check",
  "lint",
  "link",
  "graph",
  "query",
  "mcp",
  "render",
  "build",
  "export",
  "serve",
  "init",
  "fmt",
  "install",
  "i",
  "update",
  "remove",
  "upgrade",
];

/** The commands this entrypoint implements today. */
const PORTED_COMMANDS: readonly string[] = [
  "check",
  "lint",
  "fmt",
  "query",
  "render",
  "export",
  "graph",
  "link",
  "build",
  "serve",
  "mcp",
  "init",
  "install",
  "i",
  "update",
  "remove",
  "upgrade",
];

/** The flags each `FILE...` command accepts, so an unknown one is a usage error. */
const FILE_COMMAND_FLAGS: Readonly<Record<string, readonly string[]>> = {
  check: ["-v", "--verbose", "--strict"],
  lint: ["-v", "--verbose", "--strict"],
  fmt: ["-v", "--verbose", "--check"],
};

/** Write the short usage to stderr, optionally followed by an error line. */
function usageError(detail: string): number {
  console.error([...USAGE_LINES, "", detail].join("\n"));
  return EXIT_USAGE;
}

/** Run an audit command over the wiki the group options resolved to. */
async function runAuditCommand(
  wiki: Wiki,
  command: "check" | "lint",
  files: readonly Path[],
  options: { readonly verbose: boolean; readonly strict: boolean },
): Promise<number> {
  const report = command === "check"
    ? await wiki.check(files.length > 0 ? files : null, {
      strict: options.strict,
    })
    : wiki.lint(files.length > 0 ? files : null, { strict: options.strict });
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
  readonly files: Path[];
  readonly verbose: boolean;
  readonly strict: boolean;
  readonly check: boolean;
} | number {
  const flags = FILE_COMMAND_FLAGS[command] ?? [];
  const files: Path[] = [];
  let verbose = false;
  let strict = false;
  let check = false;

  for (const token of args) {
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
      // Click prints the command's help to stdout and exits 0. The body is the
      // short usage until the full surface lands, which is the same pending
      // divergence the group's help carries.
      console.log(USAGE_LINES.join("\n"));
      return EXIT_OK;
    }
    if (token.startsWith("-") && token !== "-") {
      return usageError(`Error: No such option: ${token}`);
    }
    const path = new Path(token);
    if (!path.exists()) {
      return usageError(
        `Error: Invalid value for '[FILES]...': Path '${token}' does not exist.`,
      );
    }
    files.push(path);
  }

  return { files, verbose, strict, check };
}

/**
 * Run `fmt`: format in place, or report which files a run would change.
 *
 * The two modules this needs are imported here rather than at the top of the
 * file, which is what the Python command does too (its imports are inside the
 * function). The port keeps them there for a second reason: `fmt_util` pulls in
 * the TOML parser, the path helpers, and the formatter's WebAssembly plugins,
 * and `cli.ts` must stay importable — and cheap — without permissions so
 * `--version` keeps working.
 */
async function runFmtCommand(
  wiki: Wiki,
  parsed: {
    readonly files: readonly Path[];
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
        console.log(`Using ${describeFmtSource(probe, wiki.config)}.`);
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
          console.error(`  - ${stale.name}`);
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
      `Error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

interface ParsedLinkCommand {
  readonly files: readonly Path[];
  readonly apply: boolean;
  readonly fixBroken: boolean;
  readonly dryRun: boolean;
  readonly check: boolean;
  readonly verbose: boolean;
}

function parseLinkCommandArgs(
  args: readonly string[],
): ParsedLinkCommand | number {
  const files: Path[] = [];
  let apply = false;
  let fixBroken = false;
  let dryRun = false;
  let check = false;
  let verbose = false;
  let optionsEnded = false;

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]!;
    if (optionsEnded) {
      const path = new Path(token);
      if (!path.exists()) {
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
      const path = new Path(token);
      if (!path.exists()) {
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
  readonly files: readonly Path[];
  readonly output: Path | null;
  readonly format: import("./export.ts").ExportFormat;
  readonly mode: "expanded" | "compacted";
}

async function parseExportCommandArgs(
  args: readonly string[],
): Promise<ParsedExportCommand | number> {
  const files: Path[] = [];
  let output: Path | null = null;
  let format = "dict";
  let mode: "expanded" | "compacted" = "expanded";
  let optionsEnded = false;

  for (let index = 0; index < args.length; index++) {
    const token = args[index]!;
    if (optionsEnded) {
      const path = new Path(token);
      if (!path.exists()) {
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
      output = new Path(value);
      index += 1;
    } else if (token.startsWith("--output=")) {
      output = new Path(token.slice("--output=".length));
    } else if (token.startsWith("-") && token !== "-") {
      return usageError(`Error: No such option: ${token}`);
    } else {
      const path = new Path(token);
      if (!path.exists()) {
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
      `Error: ${error instanceof Error ? error.message : String(error)}`,
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
      await Deno.writeTextFile(parsed.output.toString(), result.output);
    } catch (error) {
      console.error(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
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
  readonly files: readonly Path[];
  readonly noInference: boolean;
  readonly reload: boolean;
  readonly cache: boolean;
  readonly check: boolean;
  readonly verbose: boolean;
}

function parseRenderCommandArgs(
  args: readonly string[],
): ParsedRenderCommand | number {
  const files: Path[] = [];
  let noInference = false;
  let reload = false;
  let cache = false;
  let check = false;
  let verbose = false;
  let optionsEnded = false;

  for (const token of args) {
    if (optionsEnded) {
      const path = new Path(token);
      if (!path.exists()) {
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
      const path = new Path(token);
      if (!path.exists()) {
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
      `Query Execution Error: ${
        error instanceof Error ? error.message : String(error)
      }`,
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
    "--link-style": ["standard", "wikilink"],
    "--graph-implicit-types-policy": ["fallback", "append"],
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
      return usageError(
        `Error: Invalid value for '${option}': '${value}'. Choose from ${
          allowed.map((item) => `'${item}'`).join(", ")
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
): string | null | number {
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    console.log(
      "Usage: wiki install [OPTIONS] [URL]\n\nFetch and lock external data sources. With no URL, install declared sources. With a URL, add and fetch one git source.\n\nOptions:\n  --help  Show this message and exit.",
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
      `Error: ${error instanceof Error ? error.message : String(error)}`,
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
      `Error: ${error instanceof Error ? error.message : String(error)}`,
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
      `Error: ${error instanceof Error ? error.message : String(error)}`,
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
      `Error: ${error instanceof Error ? error.message : String(error)}`,
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
    result = await wiki.build(new Path(parsed.outputDir), {
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
      `Error: ${error instanceof Error ? error.message : String(error)}`,
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
      `Error: ${error instanceof Error ? error.message : String(error)}`,
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
      `Error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return EXIT_FAILURE;
  }
}
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

  if (!KNOWN_COMMANDS.includes(command)) {
    return usageError(`Error: No such command '${command}'.`);
  }

  if (!PORTED_COMMANDS.includes(command)) {
    return usageError(`Error: The '${command}' command is not ported yet.`);
  }

  if (command === "init") {
    const parsedInit = parseInitCommandArgs(argv.slice(index + 1));
    if (typeof parsedInit === "number") return parsedInit;
    return await runInitCommand(parsedInit);
  }

  if (command === "install" || command === "i") {
    const parsedInstall = parseInstallCommandArgs(argv.slice(index + 1));
    if (typeof parsedInstall === "number") return parsedInstall;
    const wiki = await loadWiki(configPath, wikiInputs);
    if (typeof wiki === "number") return wiki;
    return runInstallCommand(wiki, parsedInstall);
  }

  if (command === "update") {
    const parsedUpdate = parseUpdateCommandArgs(argv.slice(index + 1));
    if (typeof parsedUpdate === "number") return parsedUpdate;
    const wiki = await loadWiki(configPath, wikiInputs);
    if (typeof wiki === "number") return wiki;
    return runUpdateCommand(wiki, parsedUpdate);
  }

  if (command === "remove") {
    const parsedRemove = parseRemoveCommandArgs(argv.slice(index + 1));
    if (typeof parsedRemove === "number") return parsedRemove;
    const wiki = await loadWiki(configPath, wikiInputs);
    if (typeof wiki === "number") return wiki;
    return runRemoveCommand(wiki, parsedRemove);
  }

  if (command === "upgrade") {
    const parsedUpgrade = parseUpgradeCommandArgs(argv.slice(index + 1));
    if (typeof parsedUpgrade === "number") return parsedUpgrade;
    return await runUpgradeCommand(parsedUpgrade);
  }

  if (command === "build") {
    const parsed = parseBuildCommandArgs(argv.slice(index + 1));
    if (typeof parsed === "number") return parsed;
    const wiki = await loadWiki(configPath, wikiInputs);
    if (typeof wiki === "number") return wiki;
    return await runBuildCommand(wiki, parsed);
  }

  if (command === "serve") {
    const parsed = parseServeCommandArgs(argv.slice(index + 1));
    if (typeof parsed === "number") return parsed;
    const wiki = await loadWiki(configPath, wikiInputs);
    if (typeof wiki === "number") return wiki;
    return await runServeCommand(wiki, parsed);
  }

  if (command === "mcp") {
    const parsed = parseMcpCommandArgs(argv.slice(index + 1));
    if (typeof parsed === "number") return parsed;
    const wiki = await loadWiki(configPath, wikiInputs);
    if (typeof wiki === "number") return wiki;
    return await runMcpCommand(wiki, parsed);
  }

  if (command === "link") {
    const parsedLink = parseLinkCommandArgs(argv.slice(index + 1));
    if (typeof parsedLink === "number") return parsedLink;
    const wiki = await loadWiki(configPath, wikiInputs);
    if (typeof wiki === "number") return wiki;
    return await runLinkCommand(wiki, parsedLink);
  }

  if (command === "graph") {
    if (argv[index + 1] !== "list" || argv.length > index + 2) {
      return usageError("Usage: wiki graph list");
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
      headers.map((header, index) => header.padEnd(widths[index]!)).join("  "),
    );
    console.log(widths.map((width) => "-".repeat(width)).join("  "));
    for (const row of rows) {
      console.log(
        row.map((value, index) => value.padEnd(widths[index]!)).join("  "),
      );
    }
    return EXIT_OK;
  }

  if (command === "query") {
    const parsedQuery = await parseQueryCommandArgs(argv.slice(index + 1));
    if (typeof parsedQuery === "number") return parsedQuery;
    const wiki = await loadWiki(configPath, wikiInputs);
    if (typeof wiki === "number") return wiki;
    return await runQueryCommand(wiki, parsedQuery);
  }

  if (command === "render") {
    const parsedRender = parseRenderCommandArgs(argv.slice(index + 1));
    if (typeof parsedRender === "number") return parsedRender;
    const wiki = await loadWiki(configPath, wikiInputs);
    if (typeof wiki === "number") return wiki;
    return await runRenderCommand(wiki, parsedRender);
  }

  if (command === "export") {
    const parsedExport = await parseExportCommandArgs(argv.slice(index + 1));
    if (typeof parsedExport === "number") return parsedExport;
    const wiki = await loadWiki(configPath, wikiInputs);
    if (typeof wiki === "number") return wiki;
    return await runExportCommand(wiki, parsedExport);
  }

  const parsed = parseFileCommandArgs(command, argv.slice(index + 1));
  if (typeof parsed === "number") return parsed;

  const wiki = await loadWiki(configPath, wikiInputs);
  if (typeof wiki === "number") return wiki;

  if (command === "fmt") return await runFmtCommand(wiki, parsed);

  return await runAuditCommand(
    wiki,
    command as "check" | "lint",
    parsed.files,
    parsed,
  );
}

if (import.meta.main) {
  Deno.exit(await main());
}
