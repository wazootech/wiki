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

import type { Token } from "markdown-it/index.js";
import { splitWhitespace } from "./text.ts";
import {
  GitHubHeadingSlugger,
  type Heading,
  headingParser,
  headingPlainText,
} from "./headings/slugger.ts";

export {
  GitHubHeadingSlugger,
  type Heading,
  headingPlainText,
  headingSlug,
  normalizeHeadingForDuplicate,
} from "./headings/slugger.ts";

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

/** Inline tokens whose `content` is the text a reader sees. */
const PLAIN_INLINE_TYPES: ReadonlySet<string> = new Set([
  "text",
  "text_special",
  "code_inline",
  "image",
]);

/**
 * The plain text of a document's first ATX (`#`) H1, or `null` without one.
 *
 * This is the `schema:headline` the graph derives (wiki#318). It walks the
 * same `markdown-it` tokens as {@link parseHeadings}, so a `#` line inside a
 * fenced block is never a heading. A Setext H1 is skipped (`wiki fmt` rewrites
 * those to ATX), and inline markup is reduced to its text: `` # The `wiki` CLI ``
 * yields `The wiki CLI`, a link yields its label, and raw HTML is dropped.
 */
export function firstAtxH1(markdown: string): string | null {
  const tokens = headingParser().parse(markdown, {});
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index] as Token;
    if (
      token.type !== "heading_open" || token.tag !== "h1" ||
      token.markup !== "#"
    ) {
      continue;
    }
    const inline = tokens[index + 1];
    const parts: string[] = [];
    for (const child of inline?.children ?? []) {
      if (PLAIN_INLINE_TYPES.has(child.type)) parts.push(child.content);
      else if (child.type === "softbreak" || child.type === "hardbreak") {
        parts.push(" ");
      }
    }
    const text = splitWhitespace(parts.join("")).join(" ");
    return text === "" ? null : text;
  }
  return null;
}

/** The anchor ids of a markdown document, as the link index needs them. */
export function headingIds(markdown: string): Set<string> {
  const ids = new Set<string>();
  for (const heading of parseHeadings(markdown)) ids.add(heading.slug);
  return ids;
}

/** One heading's section: where it starts, where its content starts and ends. */
export interface SectionRange {
  readonly level: number;
  readonly text: string;
  readonly slug: string;
  /** 0-based index of the heading's first line. */
  readonly start: number;
  /** 0-based index of the first line after the heading (a setext heading is two lines). */
  readonly contentStart: number;
  /**
   * 0-based index one past the section's last line: the next heading at the
   * same or a higher level, or the end of the document.
   */
  readonly end: number;
}

/**
 * The sections whose heading is `heading`, matched on its text, its plain text
 * (links stripped), or its anchor slug.
 *
 * Lines come from `markdown-it` token maps, not a `#` scan, so a `#` inside a
 * fenced block is never a heading, which is the whole reason `wiki patch`
 * targets sections through the parser (wiki#355). More than one match is
 * returned as-is; the caller decides that ambiguity is an error.
 */
export function findSections(
  markdown: string,
  heading: string,
): SectionRange[] {
  const tokens = headingParser().parse(markdown, {});
  const slugger = new GitHubHeadingSlugger();
  const all: Array<Omit<SectionRange, "end">> = [];
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index] as Token;
    if (token.type !== "heading_open" || token.map === null) continue;
    const next = tokens[index + 1];
    const text = next !== undefined && next.type === "inline"
      ? next.content
      : "";
    all.push({
      level: Number(token.tag.slice(1)),
      text,
      slug: slugger.slug(text),
      start: token.map[0] as number,
      contentStart: token.map[1] as number,
    });
  }
  const lineCount = markdown.split("\n").length;
  const wanted = heading.trim();
  const sections: SectionRange[] = [];
  all.forEach((section, index) => {
    if (
      section.text !== wanted && headingPlainText(section.text) !== wanted &&
      section.slug !== wanted
    ) {
      return;
    }
    const next = all.slice(index + 1).find((later) =>
      later.level <= section.level
    );
    sections.push({ ...section, end: next?.start ?? lineCount });
  });
  return sections;
}
