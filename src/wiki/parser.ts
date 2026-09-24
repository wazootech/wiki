/**
 * Frontmatter parsing, document loading, and BOM tolerance.
 *
 * Port of `src/wiki/parser.py`. This is the layer that decides what a document
 * *is*, so its edge cases are contract: a page `check` skips because the parser
 * gave up is a page that silently stops being validated.
 *
 * Three fidelity notes, all verified against the pinned oracle:
 *
 * - **Error strings are spelled the Python way.** `str(LinkedMarkdownError)` is
 *   `"[CODE] CODE"` — `oops.py`'s `__str__` prefixes the code — while the JS port
 *   exposes the bare code through `message`. `linkedMarkdownMessage` restores
 *   Python's spelling because this text reaches users through `fmt` refusals.
 * - **A YAML *cause* cannot match, and that is accepted.** When frontmatter is
 *   opened but unparseable, Python renders the PyYAML exception
 *   (`code: while parsing a flow sequence …`); the JS side renders
 *   `YamlSyntaxError`'s own prose from a different YAML implementation. The
 *   `code` prefix is identical and the verdict is identical; the cause body is a
 *   documented, spec-close difference rather than a bug to chase.
 * - **`strip()` is not `trim()`.** Python's `str.strip()` does not remove
 *   U+FEFF, JavaScript's `trim()` does. `pyStrip` keeps Python's set so a body
 *   predicate cannot start differing on a BOM-only difference.
 */

import {
  extract,
  LinkedMarkdownError,
  LMD_NO_FRONTMATTER,
} from "@wazoo/linked-markdown";
import { parse as parseToml } from "@std/toml";
import { parse as parseYaml } from "@std/yaml";
import type { Path } from "./fspath.ts";

/** Document extensions the engine treats as wiki inputs. */
export const DOCUMENT_EXTENSIONS: ReadonlySet<string> = new Set([
  ".md",
  ".yaml",
  ".yml",
  ".json",
  ".toml",
]);

/** Extensions that carry structured data rather than markdown. */
export const DATA_DOCUMENT_EXTENSIONS: ReadonlySet<string> = new Set([
  ".yaml",
  ".yml",
  ".json",
  ".toml",
]);

/** The UTF-8 byte-order mark, as a string. */
export const BOM = "\uFEFF";

/** Closing delimiters linked-markdown accepts for a frontmatter block. */
const FRONTMATTER_CLOSER_RE = /^(?:---|\+\+\+|= (?:yaml|json|toml) =)[ \t]*$/;

/** A YAML/JSON/TOML document, as a plain object. */
export type DataRecord = Record<string, unknown>;

/**
 * Read a document as UTF-8, tolerating and stripping a leading BOM.
 *
 * Windows editors — Notepad, PowerShell redirection, VS Code's "UTF-8 with
 * BOM" — save text with a UTF-8 BOM. Read as plain UTF-8 it survives as a body
 * character, which breaks structured parsers downstream (JSON) and makes
 * `fmt` mistake frontmatter for prose (wiki#312).
 */
export function readTextTolerant(path: Path): string {
  return path.readText();
}

/**
 * Return why a document's frontmatter cannot be parsed, else `null`.
 *
 * A document without a frontmatter block is not an error: this reports only
 * blocks that were opened but could not be read. Callers use it as a guard
 * before rewriting a file, because a formatter has no idea a broken block is
 * frontmatter and would flatten it into prose (wiki#312).
 */
export function frontmatterError(content: string): string | null {
  const text = content.replace(/^\uFEFF+/, "");
  try {
    extract(text);
  } catch (error) {
    if (!(error instanceof LinkedMarkdownError)) {
      // Defensive: unknown parse failures are reported, not swallowed.
      return String(error);
    }
    if (error.code === LMD_NO_FRONTMATTER) return null;
    // An opener with no closer is not a frontmatter block to the renderer: the
    // formatter keeps a lone `---` as a thematic break, so there is nothing to
    // lose. Refuse only blocks the formatter could misread as frontmatter.
    const lines = splitLines(text);
    const hasCloser = lines
      .slice(1)
      .some((line) => FRONTMATTER_CLOSER_RE.test(line));
    if (!hasCloser) return null;
    if (error.cause !== undefined && error.cause !== null) {
      return `${error.code}: ${String(error.cause)}`;
    }
    return linkedMarkdownMessage(error);
  }
  return null;
}

/** Parsed frontmatter, or `null` when there is none or it does not parse. */
export function parseFrontmatter(content: string): DataRecord | null {
  try {
    return extract<DataRecord>(content).attrs;
  } catch (error) {
    if (error instanceof LinkedMarkdownError) return null;
    throw error;
  }
}

/** Add the default `wiki`/`foaf` context when a document does not declare one. */
export function ensureContext(data: DataRecord): DataRecord {
  const defaults = {
    wiki: "https://wiki.example.org/",
    foaf: "http://xmlns.com/foaf/0.1/",
  };
  const existing = data["@context"];
  if (existing === undefined) {
    data["@context"] = { ...defaults };
  } else if (isRecord(existing)) {
    for (const [key, value] of Object.entries(defaults)) {
      if (!(key in existing)) existing[key] = value;
    }
  }
  return data;
}

/** Load a document's structured data, or `null` when it has none. */
export function documentDataFromPath(
  path: Path,
  contentPredicate?: string | undefined,
): DataRecord | null {
  const suffix = path.suffix.toLowerCase();
  try {
    if (suffix === ".md") {
      return frontmatterFromPath(path, contentPredicate);
    }
    const content = readTextTolerant(path);
    let data: unknown;
    if (suffix === ".json") {
      data = JSON.parse(content) as unknown;
    } else if (suffix === ".toml") {
      data = parseToml(content) as unknown;
    } else if (DATA_DOCUMENT_EXTENSIONS.has(suffix)) {
      data = parseYaml(content) as unknown;
    } else {
      return null;
    }
    if (!isRecord(data)) return null;
    return ensureContext(data);
  } catch (error) {
    logDebug(`documentDataFromPath(${path}): ${String(error)}`);
    return null;
  }
}

/** Load a markdown file's frontmatter, folding the body into a predicate. */
export function frontmatterFromPath(
  path: Path,
  contentPredicate?: string | undefined,
): DataRecord | null {
  try {
    const content = readTextTolerant(path);
    const result = extract<DataRecord>(content);
    const data = ensureContext(result.attrs);
    if (contentPredicate !== undefined && contentPredicate !== "") {
      const body = pyStrip(result.body);
      if (body !== "") data[contentPredicate] = body;
    }
    return data;
  } catch (error) {
    if (error instanceof LinkedMarkdownError) return null;
    logDebug(`frontmatterFromPath(${path}): ${String(error)}`);
    return null;
  }
}

/**
 * Split content into frontmatter and a stripped body.
 *
 * Content that has no frontmatter — or whose frontmatter does not parse —
 * yields `[null, content]` verbatim, deliberately *not* stripped: the caller
 * uses the body as the whole document.
 */
export function splitFrontmatterBody(
  content: string,
): [DataRecord | null, string] {
  try {
    const result = extract<DataRecord>(content);
    return [result.attrs, pyStrip(result.body)];
  } catch (error) {
    if (error instanceof LinkedMarkdownError) return [null, content];
    throw error;
  }
}

/** Split a document file into its data and body; data files have no body. */
export function splitDocumentBody(
  path: Path,
): [DataRecord | null, string] {
  const suffix = path.suffix.toLowerCase();
  if (suffix === ".md") {
    try {
      return splitFrontmatterBody(readTextTolerant(path));
    } catch (error) {
      logDebug(`splitDocumentBody(${path}): ${String(error)}`);
      return [null, ""];
    }
  }
  return [documentDataFromPath(path), ""];
}

/**
 * Reproduce Python's `str(LinkedMarkdownError)`.
 *
 * The Python class formats as `"[{code}] {message}"`, and its message defaults
 * to the code, so an error built from a code alone stringifies to `"[X] X"`.
 * The JS port exposes the code as `message` without the prefix.
 */
export function linkedMarkdownMessage(error: LinkedMarkdownError): string {
  return `[${error.code}] ${error.message}`;
}

/** `true` for a plain object, standing in for `isinstance(data, dict)`. */
export function isRecord(value: unknown): value is DataRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Split on the line boundaries Python's `str.splitlines` recognises.
 *
 * JavaScript's `String.prototype.split("\n")` misses a bare `\r`, which is
 * exactly the line ending a Windows-edited file can contain mid-document.
 */
export function splitLines(text: string): string[] {
  // deno-lint-ignore no-control-regex -- U+001C-U+001E are real splitlines boundaries.
  return text.split(/\r\n|[\n\r\v\f\u001c-\u001e\u0085\u2028\u2029]/);
}

/**
 * Match Python's `str.strip()`.
 *
 * JavaScript's `trim()` also strips U+FEFF, which Python does not — so a
 * BOM-led body would be judged empty on one side only.
 */
export function pyStrip(text: string): string {
  return text.replace(
    /^[\s\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/,
    "",
  )
    .replace(
      /[\s\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+$/,
      "",
    );
}

/**
 * Emit a debug log line.
 *
 * The Python module logs through `logging.getLogger(__name__).debug`, which is
 * off unless configured; `WIKI_DEBUG` opts in, so a diagnostic never appears in
 * a normal run and stdout stays comparable with the oracle.
 */
function logDebug(message: string): void {
  if (Deno.env.get("WIKI_DEBUG")) console.error(`[wiki.parser] ${message}`);
}
