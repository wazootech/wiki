import MarkdownIt from "markdown-it";
import { splitWhitespace, stripChars } from "../text.ts";

/** One heading, as the lints, link index, and renderer see it. */
export interface Heading {
  /** 1-based line in the markdown source, or `0` when the parser gave no map. */
  readonly line_no: number;
  readonly level: number;
  readonly text: string;
  /** The anchor id, deduplicated against earlier headings in the document. */
  readonly slug: string;
}

const MARKDOWN_LINK_IN_HEADING_RE = /!?\[[^\]]*\]\([^)]*\)/g;

export function headingPlainText(text: string): string {
  const plain = text.replace(MARKDOWN_LINK_IN_HEADING_RE, "");
  return stripChars(splitWhitespace(plain).join(" "), " ,;:");
}

export function normalizeHeadingForDuplicate(text: string): string {
  const plain = headingPlainText(text).replace(/`([^`\n]+)`/g, "$1");
  return splitWhitespace(plain.toLowerCase()).join(" ");
}

/**
 * GitHub's heading slugger.
 *
 * Stateful on purpose: the second `Early Life` on a page is `early-life-1`, and
 * both the renderer and the link checker have to agree which one a
 * `#early-life-1` fragment means.
 */
export class GitHubHeadingSlugger {
  readonly seen: Map<string, number> = new Map();

  slug(title: string): string {
    const normalized = title.normalize("NFKD").trim().toLowerCase();
    // `\p{L}\p{N}_` and not `\w`: JavaScript's `\w` is ASCII-only even with
    // the `u` flag, while Python's is `Py_UNICODE_ISALNUM(ch) or ch == "_"`.
    // A CJK or Cyrillic heading would slug to `section` under `\w` and to its
    // own letters under the oracle (`日本語 見出し` → `日本語-見出し`).
    const withoutPunctuation = normalized.replace(/[^\p{L}\p{N}_\s-]/gu, "");
    const dashed = withoutPunctuation.replace(/[\s-]+/g, "-").replace(
      /^-+|-+$/g,
      "",
    );
    const base = dashed === "" ? "section" : dashed;
    const count = this.seen.get(base) ?? 0;
    this.seen.set(base, count + 1);
    return count === 0 ? base : `${base}-${count}`;
  }
}

/** A slug for a single heading, with no deduplication context. */
export function headingSlug(title: string): string {
  return new GitHubHeadingSlugger().slug(title);
}

let parser: MarkdownIt | null = null;

/** The shared parser, built once, as `_heading_parser`'s `lru_cache` does. */
export function headingParser(): MarkdownIt {
  parser ??= new MarkdownIt({ linkify: false });
  return parser;
}
