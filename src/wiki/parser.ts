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
 * - **Bodies are trimmed with `trim()`.** A BOM or stray whitespace around a
 *   body is dropped rather than preserved, so a BOM-only difference cannot
 *   change whether a body predicate sees content.
 */

import { extname } from "@std/path";
import { LinkedMarkdownError } from "@wazoo/linked-markdown";
import { parse as parseToml } from "@std/toml";
import { parse as parseYaml } from "@std/yaml";
import {
  DATA_DOCUMENT_EXTENSIONS,
  type DataRecord,
  ensureContext,
  extractFrontmatter,
  isRecord,
  logDebug,
  readTextTolerant,
} from "./parser/frontmatter.ts";

export {
  BOM,
  DATA_DOCUMENT_EXTENSIONS,
  type DataRecord,
  DOCUMENT_EXTENSIONS,
  ensureContext,
  frontmatterError,
  isRecord,
  linkedMarkdownMessage,
  parseFrontmatter,
  readTextTolerant,
  splitLines,
} from "./parser/frontmatter.ts";

/** Load a document's structured data, or `null` when it has none. */
export function documentDataFromPath(
  path: string,
  contentPredicate?: string | undefined,
): DataRecord | null {
  const suffix = extname(path).toLowerCase();
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
  path: string,
  contentPredicate?: string | undefined,
): DataRecord | null {
  try {
    const content = readTextTolerant(path);
    const result = extractFrontmatter(content);
    const data = ensureContext(result.attrs);
    if (contentPredicate !== undefined && contentPredicate !== "") {
      const body = result.body.trim();
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
    const result = extractFrontmatter(content);
    return [result.attrs, result.body.trim()];
  } catch (error) {
    if (error instanceof LinkedMarkdownError) return [null, content];
    throw error;
  }
}

/** Split a document file into its data and body; data files have no body. */
export function splitDocumentBody(
  path: string,
): [DataRecord | null, string] {
  const suffix = extname(path).toLowerCase();
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
