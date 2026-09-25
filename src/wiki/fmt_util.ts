/**
 * Markdown formatting: config resolution, and the formatter itself.
 *
 * Port of `fmt_util.py`, with the engine swapped for `deno fmt` — the ADR's
 * deliberate reversal of #273's "port mdformat" recommendation. The Python
 * module is two halves, and they port very differently:
 *
 * - **Config resolution is a straight port.** Which `.mdformat.toml` wins, what
 *   an inline `fmt:` mapping does, and what a typo in either is reported as are
 *   all user-visible, so they are reproduced exactly — including the walk up
 *   from the *file's* directory to the filesystem root, which is why a wiki with
 *   `.mdformat.toml` in `wiki/` configures `wiki/sub/page.md`.
 * - **The formatter is a subprocess.** `deno fmt` is invoked over stdin with
 *   `- --ext md`, so it never touches the wiki's files: `format_markdown` is a
 * pure string function there, and `--check` must not write. That is also why
 * this one function is `async` where the Python was synchronous — a subprocess
 * is the only route to the formatter (Deno exposes no in-process API), and the
 * stdin pipe cannot be written synchronously.
 *
 * Three things the phase-7 probe settled are encoded here, and one of them is a
 * trap that would have shipped silently:
 *
 * 1. **`--no-config` is mandatory.** `deno fmt` reads the nearest `deno.json`,
 *    and this repository scopes its `fmt.include` to `src/`, `tests/`, and
 *    `parity/` while *excluding* `docs/`. Invoked from a wiki that is itself a
 *    Deno project — including this one — a bare `deno fmt` finds no target files
 *    and reports success. A formatter that formats nothing while reporting
 *    success is worse than one that fails, so the flag is not optional.
 * 2. **`--prose-wrap never` is load-bearing.** Deno's default wraps prose at 80
 *    columns; `wiki fmt` must leave paragraphs on one line. Measured on this
 *    repository's own wiki: the default rewrites 70 of 87 pages, `never`
 *    rewrites 9.
 * 3. **No shielding layer.** The plan carried one for SPARQL blocks, frontmatter,
 *    and tables; the probe showed all three survive verbatim, so the port does
 *    not shield and does not reimplement `_shield_sparql_blocks`.
 *
 * Two mappings and four inert keys are worth stating plainly, because they are
 * the whole of the configuration's effect on the new engine:
 *
 * - `wrap` maps to `--prose-wrap`: `no` → `never`, `keep` → `preserve`, an
 *   integer → `always` plus `--line-width`. Only `no` is oracle-verified, and it
 *   is what every shipped config uses.
 * - `end_of_line` maps to a post-pass: `lf` is what `deno fmt` emits anyway,
 *   `crlf` is applied by conversion, and `keep` re-applies whatever the original
 *   used. `deno fmt` has no flag for this.
 * - `number`, `exclude`, `plugin`, `codeformatters`, and `extensions` are
 *   validated and then unused. `deno fmt` has no plugin or extension surface, so
 *   a config that omits `gfm` no longer stops tables from being formatted — a
 *   divergence in the port's favour, but a divergence, and the only one here
 *   that changes output rather than presentation.
 */

import { parse as parseToml } from "@std/toml";
import type { Config } from "./config.ts";
import { type Path, ValueError } from "./fspath.ts";
import {
  DEFAULT_OPTS,
  InvalidConfError,
  validateKeys,
  validateValues,
} from "./mdformat_conf.ts";
import { BOM, readTextTolerant } from "./parser.ts";
import { pyReprString } from "./pyrepr.ts";
import { getLogger } from "./logging.ts";

const logger = getLogger("wiki.fmt_util");

/** The parser extensions the engine ships, as mdformat's registry lists them. */
export const REGISTERED_FMT_EXTENSIONS: readonly string[] = [
  "footnote",
  "front_matters",
  "gfm",
  "tables",
  "toc",
  "wikilink",
];

/** The extension order `_mdformat_options` falls back to. */
export const DEFAULT_FMT_EXTENSIONS: readonly string[] = [
  "wikilink",
  "front_matters",
  "gfm",
  "toc",
  "footnote",
];

/** The `fmt:` options `wiki init` writes and the engine defaults to. */
export const DEFAULT_FMT_OPTS: Readonly<Record<string, unknown>> = {
  wrap: "no",
  end_of_line: "lf",
  extensions: ["gfm", "front_matters", "wikilink", "toc", "footnote"],
};

/**
 * The canonical `.mdformat.toml` text `wiki init` scaffolds.
 *
 * The key order and the extension order are the file's contents, so they follow
 * {@link DEFAULT_FMT_OPTS} rather than the parse order of that mapping.
 */
export function renderDefaultMdformatToml(): string {
  const extensions = (DEFAULT_FMT_OPTS["extensions"] as readonly string[])
    .map((extension) => `"${extension}"`)
    .join(", ");
  return `wrap = "${DEFAULT_FMT_OPTS["wrap"]}"\n` +
    `end_of_line = "${DEFAULT_FMT_OPTS["end_of_line"]}"\n` +
    `extensions = [${extensions}]\n`;
}

/**
 * Read and validate one TOML file, as `_load_toml_opts` does.
 *
 * The message keeps Python's shape — `Invalid TOML syntax in <path>: <detail>` —
 * with the detail coming from the JavaScript parser, so a malformed file reports
 * the same way with a differently-worded parse error attached.
 */
export function loadTomlOpts(path: Path): Record<string, unknown> {
  let parsed: Record<string, unknown>;
  try {
    parsed = parseToml(readTextTolerant(path)) as Record<string, unknown>;
  } catch (error) {
    throw new ValueError(
      `Invalid TOML syntax in ${path}: ${errorText(error)}`,
    );
  }
  try {
    validateKeys(parsed, path.toString());
    validateValues(parsed, path.toString());
  } catch (error) {
    if (error instanceof InvalidConfError) throw new ValueError(error.message);
    throw error;
  }
  return parsed;
}

/**
 * Which formatting options apply to `filePath`, and where they came from.
 *
 * The precedence is the Python one, and each step exists for a reason a user can
 * hit: an inline `fmt:` mapping beats every file; a `fmt:` *pointer* beats the
 * default file but is ignored when it does not exist (a wiki can reference a
 * `.mdformat.toml` that has not been committed yet); `.mdformat.toml` at the
 * config root beats the walk; and the walk beats the shipped defaults.
 */
export function resolveFmtTomlOpts(
  filePath: Path,
  config: Config,
): [Record<string, unknown>, string] {
  if (config.fmt !== null && config.fmt.options !== null) {
    if (Object.keys(config.fmt.options).length === 0) {
      return [{ ...DEFAULT_FMT_OPTS }, "inline fmt in wiki config"];
    }
    return [
      config.fmt.options as Record<string, unknown>,
      "inline fmt in wiki config",
    ];
  }

  const root = config.config_root;
  if (config.fmt !== null && config.fmt.toml !== null) {
    const pointed = config.fmt.toml;
    if (pointed.isFile()) {
      return [
        loadTomlOpts(pointed),
        `fmt from ${pointed.relativeTo(root).asPosix()}`,
      ];
    }
  }

  const defaultPath = root.joinpath(".mdformat.toml");
  if (defaultPath.isFile()) {
    return [loadTomlOpts(defaultPath), ".mdformat.toml at config root"];
  }

  const [tomlOpts, confPath] = readTomlOpts(filePath.parent);
  if (confPath !== null) {
    return [{ ...tomlOpts }, confPath.toString()];
  }

  return [{ ...DEFAULT_FMT_OPTS }, "Wiki CLI fmt defaults"];
}

/**
 * Walk up from `confDir` looking for `.mdformat.toml`.
 *
 * Port of `mdformat._conf.read_toml_opts`, which lives in the library rather
 * than in `fmt_util.py` and so had to be reproduced here to keep the search
 * semantics identical. The two that matter: the search stops at the filesystem
 * root, and a file *found* on the way up is validated the same way an explicit
 * pointer is.
 */
export function readTomlOpts(
  confDir: Path,
): [Record<string, unknown>, Path | null] {
  let dir = confDir;
  for (;;) {
    const confPath = dir.joinpath(".mdformat.toml");
    if (confPath.isFile()) {
      let parsed: Record<string, unknown>;
      try {
        parsed = parseToml(readTextTolerant(confPath)) as Record<
          string,
          unknown
        >;
      } catch (error) {
        throw new ValueError(`Invalid TOML syntax: ${errorText(error)}`);
      }
      validateKeys(parsed, confPath.toString());
      validateValues(parsed, confPath.toString());
      return [parsed, confPath];
    }
    const parent = dir.parent;
    if (parent.toString() === dir.toString()) return [{}, null];
    dir = parent;
  }
}

/** Which config source {@link resolveFmtTomlOpts} would use, in prose. */
export function describeFmtSource(filePath: Path, config: Config): string {
  const [, source] = resolveFmtTomlOpts(filePath, config);
  return source;
}

/** The merged mdformat options and the extensions they enable. */
export function mdformatOptions(
  filePath: Path,
  config: Config,
): [Record<string, unknown>, readonly string[]] {
  const [tomlOpts] = resolveFmtTomlOpts(filePath, config);
  const opts: Record<string, unknown> = { ...DEFAULT_OPTS, ...tomlOpts };
  const extensions = opts["extensions"];
  if (extensions === null || extensions === undefined) {
    return [opts, DEFAULT_FMT_EXTENSIONS];
  }
  return [opts, extensions as readonly string[]];
}

/**
 * Reject an extension the engine has no parser for, as `format_markdown` does.
 *
 * `deno fmt` cannot be told which extensions to enable, but it *can* be told
 * that a name is unknown — and that is the half a user depends on when they
 * mistype `gfm` in their `fmt:` block. Silence there would format the file with
 * defaults and call it success.
 */
function checkExtensions(extensions: readonly string[]): void {
  for (const extension of extensions) {
    if (!REGISTERED_FMT_EXTENSIONS.includes(extension)) {
      throw new ValueError(
        `The required ${
          pyReprString(extension)
        } mdformat extension is not installed.`,
      );
    }
  }
}

/** The `--prose-wrap` value and optional `--line-width` for `wrap`. */
function proseWrapArgs(wrap: unknown): string[] {
  if (wrap === "no" || wrap === undefined) return ["--prose-wrap", "never"];
  if (wrap === "keep") return ["--prose-wrap", "preserve"];
  if (typeof wrap === "number" && Number.isInteger(wrap)) {
    return ["--prose-wrap", "always", "--line-width", String(wrap)];
  }
  // `validateValues` already rejected anything else, so this is unreachable for
  // a config that came through the config loader; a hand-built mapping is the
  // only way here, and failing loudly beats guessing.
  throw new ValueError(`Invalid 'wrap' value: ${pyReprString(String(wrap))}`);
}

/**
 * The executable that owns the formatter.
 *
 * Under `deno run` this is the running interpreter. In a `deno compile`
 * standalone there is no Deno runtime to delegate to, so the port falls back to
 * `deno` on `PATH` — and the ADR records that "compiled binaries are a supported
 * install path" is therefore true for every command except `fmt` unless one is
 * present. Deno exposes no in-process formatting API (checked on 2.9.6:
 * `Deno.formatText` does not exist), so a subprocess is the only route.
 */
function formatterExecutable(): string {
  return Deno.build.standalone ? "deno" : Deno.execPath();
}

/**
 * Format `text` with `deno fmt`, returning its stdout.
 *
 * `--ext md` matters and is not inferable: the engine formats a *string*, so
 * there is no filename for the formatter to read an extension from, and without
 * it `deno fmt -` would guess from the piped content.
 *
 * The write and the drain run concurrently by design: the page is written to the
 * child's stdin while `child.output()` reads stdout, so a page larger than the
 * pipe buffer cannot deadlock the pair. Writing first *and then* reading would
 * work for a small page and hang on a large one, which is the kind of bug that
 * only shows up on the wiki that needed formatting most.
 */
async function runFormatter(
  text: string,
  opts: Record<string, unknown>,
  filePath: Path,
): Promise<string> {
  const args = [
    "fmt",
    "--no-config",
    "--no-editorconfig",
    "--ext",
    "md",
    ...proseWrapArgs(opts["wrap"]),
    "-",
  ];
  const command = new Deno.Command(formatterExecutable(), {
    args,
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  });
  const child = command.spawn();
  const writer = child.stdin.getWriter();
  const written = writer.write(new TextEncoder().encode(text)).then(() =>
    writer.close()
  );
  const output = await child.output();
  await written;

  if (output.code !== 0) {
    const stderr = new TextDecoder().decode(output.stderr).trim();
    throw new ValueError(
      `deno fmt failed on ${filePath.name}: ${stderr || `exit ${output.code}`}`,
    );
  }
  return new TextDecoder().decode(output.stdout);
}

/** Re-apply the line endings `end_of_line` asks for. */
function applyEndOfLine(
  formatted: string,
  original: string,
  endOfLine: unknown,
): string {
  const lfOnly = formatted.replace(/\r\n/g, "\n");
  if (endOfLine === "crlf") return lfOnly.replace(/\n/g, "\r\n");
  if (endOfLine === "keep") {
    // "keep" preserves what the file already used, which is what mdformat does
    // and what a mixed-history repository expects.
    return original.includes("\r\n") ? lfOnly.replace(/\n/g, "\r\n") : lfOnly;
  }
  return lfOnly;
}

/**
 * Format markdown, honouring the wiki's fmt config.
 *
 * A leading UTF-8 BOM is dropped first. That is not tidiness: with mdformat it
 * was the corruption site of wiki#312, because `front_matters` does not
 * recognize a BOM-prefixed `---` opener and parsed the whole frontmatter block
 * as a setext heading. `deno fmt` parses a BOM'd `---` correctly, so the port
 * could arguably keep the BOM — it is dropped anyway, because the *file* must
 * come back without one after `wiki fmt` (that is what the oracle's fixed
 * behaviour does, and `test_fmt` asserts it).
 *
 * The call is `async` because the formatter is a subprocess; `DocumentBatch.format`
 * and `Wiki.format` are `async` with it, and the CLI awaits them. Nothing else
 * about the call chain changes.
 */
export async function formatMarkdown(
  original: string,
  filePath: Path,
  config: Config,
): Promise<string> {
  const withoutBom = original.startsWith(BOM)
    ? original.slice(BOM.length)
    : original;
  const [opts, extensions] = mdformatOptions(filePath, config);
  checkExtensions(extensions);
  const formatted = await runFormatter(withoutBom, opts, filePath);
  const result = applyEndOfLine(formatted, withoutBom, opts["end_of_line"]);
  if (result !== withoutBom) {
    logger.debug(`formatted ${filePath.name}`);
  }
  return result;
}

/** Python's `str(exception)`, for the two error messages above. */
function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
