#!/usr/bin/env -S deno run
/**
 * CLI entrypoint — Deno port of `src/wiki/cli.py`.
 *
 * Ported so far: the group's `--config`/`--input` options, `--version`, the two
 * audit commands (`check`, `lint`), `fmt`, and `query`. The remaining commands —
 * `link`, `graph`, `mcp`, `render`, `build`, `export`, `serve`, `init`,
 * `install`/`i`, `update`, `remove`, `upgrade` — land as their modules do, and
 * until one does, invoking it is a usage error naming that fact rather than a
 * silent success.
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
 * The group's help body is still the short usage: Click's group is declared
 * `no_args_is_help`, so a bare `wiki` prints the full command help to stderr,
 * and that body arrives with the command surface. The divergence is tracked as
 * the `usage-no-command` case in `parity/cases.ts` rather than papered over.
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
import type { Wiki } from "./wiki.ts";

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
const PORTED_COMMANDS: readonly string[] = ["check", "lint", "fmt", "query"];

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
      console.log(USAGE_LINES.join("\n"));
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
    // Click's group is declared `no_args_is_help`, so an empty argv prints the
    // *full* help — not `USAGE_LINES` — to stderr and exits 2. Only the exit
    // code is contractual today; the help body arrives with the command surface
    // in phase 9, and the divergence is tracked as the `usage-no-command` case
    // in `parity/cases.ts` rather than papered over here.
    return usageError("");
  }

  if (!KNOWN_COMMANDS.includes(command)) {
    return usageError(`Error: No such command '${command}'.`);
  }

  if (!PORTED_COMMANDS.includes(command)) {
    return usageError(`Error: The '${command}' command is not ported yet.`);
  }

  if (command === "query") {
    const parsedQuery = await parseQueryCommandArgs(argv.slice(index + 1));
    if (typeof parsedQuery === "number") return parsedQuery;
    const wiki = await loadWiki(configPath, wikiInputs);
    if (typeof wiki === "number") return wiki;
    return await runQueryCommand(wiki, parsedQuery);
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
