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

export const USAGE_LINES = [
  `Usage: ${PROG_NAME} [OPTIONS] COMMAND [ARGS]...`,
  `Try '${PROG_NAME} --help' for help.`,
];

export const ROOT_HELP_HEADER_LINES = [
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
export const FILE_COMMAND_FLAGS: Readonly<Record<string, readonly string[]>> = {
  check: ["-v", "--verbose", "--strict", "-f", "--format", "--json"],
  lint: ["-v", "--verbose", "--strict"],
  fmt: ["-v", "--verbose", "--check"],
};

export const FILE_COMMAND_HELP: Readonly<Record<string, string>> = {
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
export function usageError(detail: string): number {
  console.error([...USAGE_LINES, "", detail].join("\n"));
  return EXIT_USAGE;
}

export function graphUsageError(detail: string): number {
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

export function fileUsageError(detail: string): number {
  console.error(
    [
      `Usage: ${PROG_NAME} file [OPTIONS] COMMAND [ARGS]...`,
      `Try '${PROG_NAME} file --help' for help.`,
      "",
      `Error: ${detail}`,
    ].join("\n"),
  );
  return EXIT_USAGE;
}

export function graphListUsageError(detail: string): number {
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
