/**
 * GitHub-compatible heading anchors.
 *
 * Port of `src/wiki/headings.py`. Four callers need the same answer to "what
 * are this page's headings, and what are their anchor ids?" — the heading
 * lints, the link index, the site outline, and the renderer's `id=` attributes
 * — so the parse and the slug rule live in one place, as they do in Python.
 *
 * Two fidelity notes:
 *
 * - **The parser is `markdown-it`, not a heading regex.** Setext headings, code
 *   fences that contain `#`, and inline markup in heading text all make a
 *   regex wrong: `### \`Accept\`` must yield the text `` `Accept` `` with its
 *   backticks intact (the duplicate-heading lint strips them later), and the
 *   line number must be the *token*'s, which counts fenced blocks correctly.
 *   Python builds `MarkdownIt("gfm-like", {"linkify": False})`; JavaScript's
 *   default preset already carries the tables and strikethrough that
 *   `gfm-like` adds, and `linkify` is off by default, so a bare
 *   `new MarkdownIt()` is the same parser for this purpose.
 * - **NFKD normalisation is the slug rule, not a nicety.** `Café` and `Cafe\u0301`
 *   must collide, because GitHub's anchors do.
 */

import MarkdownIt from "markdown-it";
import type { Token } from "markdown-it/index.js";

/** One heading, as the lints, link index, and renderer see it. */
export interface Heading {
  /** 1-based line in the markdown source, or `0` when the parser gave no map. */
  readonly line_no: number;
  readonly level: number;
  readonly text: string;
  /** The anchor id, deduplicated against earlier headings in the document. */
  readonly slug: string;
}

/**
 * GitHub's heading slugger.
 *
 * Stateful on purpose: the second `Early Life` on a page is `early-life-1`, and
 * both the renderer and the link checker have to agree which one a
 * `#early-life-1` fragment means.
 */
export class GitHubHeadingSlugger {
  readonly seen = new Map<string, number>();

  slug(title: string): string {
    const normalized = pyStripMd(title.normalize("NFKD")).toLowerCase();
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

/**
 * `str.strip()` as the slugger uses it.
 *
 * JavaScript's `trim()` also removes U+FEFF, which Python's `strip()` leaves —
 * and a BOM-led heading is reachable, since the engine reads files that may
 * carry one (wiki#312). The set here is Python's default whitespace set.
 */
function pyStripMd(text: string): string {
  return text.replace(
    /^[\s\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/,
    "",
  ).replace(
    /[\s\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+$/,
    "",
  );
}

let parser: MarkdownIt | null = null;

/** The shared parser, built once, as `_heading_parser`'s `lru_cache` does. */
function headingParser(): MarkdownIt {
  parser ??= new MarkdownIt({ linkify: false });
  return parser;
}

/** Every heading in a markdown document, in order, with deduplicated slugs. */
export function parseHeadings(markdown: string): Heading[] {
  const tokens = headingParser().parse(markdown, {});
  const slugger = new GitHubHeadingSlugger();
  const headings: Heading[] = [];

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index] as Token;
    if (token.type !== "heading_open") continue;
    const level = Number(token.tag.slice(1));
    const lineNo = token.map ? (token.map[0] as number) + 1 : 0;
    let text = "";
    const next = tokens[index + 1];
    if (next !== undefined && next.type === "inline") text = next.content;
    headings.push({
      line_no: lineNo,
      level,
      text,
      slug: slugger.slug(text),
    });
  }

  return headings;
}

/** The anchor ids of a markdown document, as the link index needs them. */
export function headingIds(markdown: string): Set<string> {
  const ids = new Set<string>();
  for (const heading of parseHeadings(markdown)) ids.add(heading.slug);
  return ids;
}
