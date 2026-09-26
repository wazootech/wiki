/**
 * Markdown formatting: config resolution, and the engine that applies it.
 *
 * Port of `fmt_util.py`, with the engine swapped for `dprint-plugin-markdown`
 * run in process — the ADR's deliberate reversal of #273's "port mdformat"
 * recommendation, kept, but moved off `deno fmt`. The Python module is two
 * halves, and they port very differently:
 *
 * - **Config resolution is a straight port.** Which `.mdformat.toml` wins, what
 *   an inline `fmt:` mapping does, and what a typo in either is reported as are
 *   all user-visible, so they are reproduced exactly — including the walk up
 *   from the *file's* directory to the filesystem root, which is why a wiki with
 *   `.mdformat.toml` in `wiki/` configures `wiki/sub/page.md`.
 * - **The formatter is `formatter.ts`.** It owns the plugin, its configuration,
 *   and its host formatters; this module only decides which options apply and
 *   hands them over. `format_markdown` stays a pure string function, and a
 *   `--check` run still cannot write.
 *
 * Three things the phase-7 probe settled are encoded here, and two of them
 * changed shape at the cutover:
 *
 * 1. **Config discovery is gone, and that is the point.** `deno fmt` read the
 *    nearest `deno.json`, and this repository scopes its `fmt.include` to `src/`,
 *    `tests/`, and `parity/` while *excluding* `docs/`. Invoked from a wiki that
 *    is itself a Deno project — including this one — a bare `deno fmt` found no
 *    target files and reported success. The port defended against that with
 *    `--no-config`; the plugin reads no project config at all, so the trap no
 *    longer exists to defend against.
 * 2. **`textWrap: never` is load-bearing.** 80-column prose reflow is the
 *    plugin's own default, and `wiki fmt` must leave paragraphs on one line.
 *    Measured on this repository's own wiki: the default rewrites 70 of 87 pages,
 *    `never` rewrites 9.
 * 3. **No shielding layer.** The plan carried one for SPARQL blocks, frontmatter,
 *    and tables; the probe showed all three survive verbatim, so the port does
 *    not shield and does not reimplement `_shield_sparql_blocks`.
 *
 * One mapping and five inert keys are worth stating plainly, because they are the
 * whole of the configuration's effect on the engine:
 *
 * - `wrap` maps to the plugin's `textWrap` and `lineWidth`; see `resolveWrap` in
 *   `formatter.ts`, including why `keep` becomes `maintain` and not `preserve`.
 *   Only `no` is oracle-verified, and it is what every shipped config uses.
 * - `end_of_line` maps to a post-pass: `lf` is what the plugin emits anyway,
 *   `crlf` is applied by conversion, and `keep` re-applies whatever the original
 *   used. The plugin has no setting for this.
 * - `number`, `exclude`, `plugin`, `codeformatters`, and `extensions` are
 *   validated and then unused. The extension names are mdformat *parser* names —
 *   `gfm` for tables, `front_matters`, `wikilink`, `toc`, `footnote` — and the
 *   plugin has no switch for any of them: it always parses tables and
 *   frontmatter. So a config that omits `gfm` still gets its tables formatted — a
 *   divergence in the port's favour, but a divergence, and the only one here that
 *   changes output rather than presentation.
 */

import { isFile, relativeWithin } from "./fspath.ts";
import { basename, dirname, join } from "@std/path";
import { ValueError } from "./errors.ts";
import { parse as parseToml } from "@std/toml";
import type { Config } from "./config.ts";
import { formatMarkdownText } from "./formatter.ts";

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
export function loadTomlOpts(path: string): Record<string, unknown> {
  let parsed: Record<string, unknown>;
  try {
    parsed = parseToml(readTextTolerant(path)) as Record<string, unknown>;
  } catch (error) {
    throw new ValueError(
      `Invalid TOML syntax in ${path}: ${errorText(error)}`,
    );
  }
  try {
    validateKeys(parsed, path);
    validateValues(parsed, path);
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
  filePath: string,
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
    if (isFile(pointed)) {
      return [
        loadTomlOpts(pointed),
        `fmt from ${(relativeWithin(pointed, root)).replaceAll("\\", "/")}`,
      ];
    }
  }

  const defaultPath = join(root, ".mdformat.toml");
  if (isFile(defaultPath)) {
    return [loadTomlOpts(defaultPath), ".mdformat.toml at config root"];
  }

  const [tomlOpts, confPath] = readTomlOpts(dirname(filePath));
  if (confPath !== null) {
    return [{ ...tomlOpts }, confPath];
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
  confDir: string,
): [Record<string, unknown>, string | null] {
  let dir = confDir;
  for (;;) {
    const confPath = join(dir, ".mdformat.toml");
    if (isFile(confPath)) {
      let parsed: Record<string, unknown>;
      try {
        parsed = parseToml(readTextTolerant(confPath)) as Record<
          string,
          unknown
        >;
      } catch (error) {
        throw new ValueError(`Invalid TOML syntax: ${errorText(error)}`);
      }
      validateKeys(parsed, confPath);
      validateValues(parsed, confPath);
      return [parsed, confPath];
    }
    const parent = dirname(dir);
    if (parent === dir) return [{}, null];
    dir = parent;
  }
}

/** Which config source {@link resolveFmtTomlOpts} would use, in prose. */
export function describeFmtSource(filePath: string, config: Config): string {
  const [, source] = resolveFmtTomlOpts(filePath, config);
  return source;
}

/** The merged mdformat options and the extensions they enable. */
export function mdformatOptions(
  filePath: string,
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
 * The plugin has no extension surface, so this cannot enable anything — but
 * rejecting an unknown *name* is the half a user depends on when they mistype
 * `gfm` in their `fmt:` block. Silence there would format the file with defaults
 * and call it success, which is the failure mode `wiki#312` was.
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
 * as a setext heading. The plugin parses a BOM'd `---` correctly, so the port
 * could arguably keep the BOM — it is dropped anyway, because the *file* must
 * come back without one after `wiki fmt` (that is what the oracle's fixed
 * behaviour does, and `test_fmt` asserts it).
 */
export function formatMarkdown(
  original: string,
  filePath: string,
  config: Config,
): string {
  const withoutBom = original.startsWith(BOM)
    ? original.slice(BOM.length)
    : original;
  const [opts, extensions] = mdformatOptions(filePath, config);
  checkExtensions(extensions);
  const formatted = formatMarkdownText(withoutBom, filePath, opts["wrap"]);
  const result = applyEndOfLine(formatted, withoutBom, opts["end_of_line"]);
  if (result !== withoutBom) {
    logger.debug(`formatted ${basename(filePath)}`);
  }
  return result;
}

/** Python's `str(exception)`, for the two error messages above. */
function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
