/**
 * Document text splitting and link-scan primitives.
 *
 * Port of `src/wiki/document.py`. These are the pure text primitives every
 * link-aware command is built on, so they are ported before anything that
 * consumes them and unit-tested against the Python semantics they replace.
 *
 * Two porting hazards are worth naming:
 *
 * - **`split` does not mean the same thing.** Python's second argument to
 *   `str.split` is a limit on *splits*; JavaScript's is a limit on *results*.
 *   `splitMaxSplit` restores the Python semantics, because whether the body is
 *   `parts[2]` or a joined tail changes what every document body is.
 * - **Shared `/g` regexes carry `lastIndex`.** Iterating a module-level regex
 *   with `exec` in a loop makes a second call skip matches. Every scan here goes
 *   through `matchAll`, which clones the pattern and leaves `lastIndex` alone.
 */

import { extract, LinkedMarkdownError } from "@wazoo/linked-markdown";

/** `[[slug]]` or `[[slug|display]]`. */
export const WIKILINK_REGEX = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;

/** `[display](target)` and `![alt](target)`. */
export const MARKDOWN_LINK_REGEX = /!?\[[^\]]*\]\(([^)]+)\)/g;

/** `[[slug]]` / `[[slug|display]]`, capturing both groups. */
export const WIKILINK_FULL_REGEX = /\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g;

/** `[display](target)` / `![alt](target)`, capturing both groups. */
export const MARKDOWN_LINK_FULL_REGEX = /!?\[([^\]]*)\]\(([^)]+)\)/g;

/** Fenced code blocks. */
export const FENCED_CODE_RE = /```[\s\S]*?```/g;

/** Inline code spans. */
export const INLINE_CODE_RE = /`[^`\n]*`/g;

/** Split of markdown content into frontmatter prefix, body, and parsed data. */
export interface FrontmatterSplit {
  /** The verbatim `---`-delimited prefix, or `""` when there is none. */
  readonly prefix: string;
  /** Everything after the frontmatter, or the whole content when there is none. */
  readonly body: string;
  /** Parsed frontmatter, or `null` when there is none or it does not parse. */
  readonly data: Readonly<Record<string, unknown>> | null;
}

/**
 * Split `text` at most `maxSplit` times, matching Python's `str.split(sep,
 * maxsplit)`. JavaScript's `String.prototype.split` takes a result limit, which
 * silently keeps the tail intact instead of leaving it joined.
 */
export function splitMaxSplit(
  text: string,
  separator: string,
  maxSplit: number,
): readonly string[] {
  const parts: string[] = [];
  let rest = text;
  for (let index = 0; index < maxSplit; index += 1) {
    const at = rest.indexOf(separator);
    if (at === -1) break;
    parts.push(rest.slice(0, at));
    rest = rest.slice(at + separator.length);
  }
  parts.push(rest);
  return parts;
}

/**
 * Split markdown content into frontmatter prefix, body, and parsed frontmatter.
 *
 * The `---`-only split is deliberately crude, exactly as in the Python source:
 * a document whose body contains `---` still splits at the first two runs, and
 * the body keeps everything after them.
 */
export function splitFrontmatterText(content: string): FrontmatterSplit {
  if (content.startsWith("---")) {
    const parts = splitMaxSplit(content, "---", 2);
    const [, middle, body] = parts;
    if (middle !== undefined && body !== undefined) {
      return {
        prefix: `---${middle}---`,
        body,
        data: extractAttrs(content),
      };
    }
  }
  return { prefix: "", body: content, data: null };
}

function extractAttrs(
  content: string,
): Readonly<Record<string, unknown>> | null {
  try {
    const { attrs } = extract<Record<string, unknown>>(content);
    return attrs;
  } catch (error) {
    // Malformed or absent frontmatter is a `null`, not a throw: callers treat
    // "no data" and "unparseable data" the same way here.
    if (error instanceof LinkedMarkdownError) return null;
    throw error;
  }
}

/** Return the markdown body after frontmatter, or the full content if none. */
export function markdownBody(content: string): string {
  return splitFrontmatterText(content).body;
}

/** Character spans covered by inline code, as `[start, end)` pairs. */
export function protectedInlineCodeSpans(
  markdown: string,
): readonly (readonly [number, number])[] {
  const spans: (readonly [number, number])[] = [];
  for (const match of markdown.matchAll(INLINE_CODE_RE)) {
    if (match.index === undefined) continue;
    spans.push([match.index, match.index + match[0].length]);
  }
  return spans;
}

/** Whether `[start, end)` overlaps any of `spans`. */
export function spanOverlaps(
  start: number,
  end: number,
  spans: readonly (readonly [number, number])[],
): boolean {
  return spans.some(([spanStart, spanEnd]) =>
    start < spanEnd && end > spanStart
  );
}

/**
 * Remove inline code spans, so a literal `[[…]]` in prose is not mistaken for a
 * wikilink.
 */
export function stripInlineCode(markdown: string): string {
  return markdown.replace(INLINE_CODE_RE, "");
}

/** Inline and fenced code spans in a markdown body. */
export function bodyCodeSpans(
  body: string,
): readonly (readonly [number, number])[] {
  const spans: (readonly [number, number])[] = [
    ...protectedInlineCodeSpans(body),
  ];
  for (const match of body.matchAll(FENCED_CODE_RE)) {
    if (match.index === undefined) continue;
    spans.push([match.index, match.index + match[0].length]);
  }
  return spans;
}
