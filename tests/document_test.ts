/**
 * Tests for `src/wiki/document.ts`, ported from `src/wiki/document.py`.
 *
 * Two of these lock down porting hazards rather than Python behaviour, because
 * they are the places a transcription could look right and be wrong: Python's
 * `split` maxsplit is not JavaScript's result limit, and a shared `/g` regex
 * that is iterated must not leak `lastIndex` between calls.
 */
import { assertEquals, assertThrows } from "@std/assert";
import {
  bodyCodeSpans,
  FENCED_CODE_RE,
  markdownBody,
  protectedInlineCodeSpans,
  spanOverlaps,
  splitFrontmatterText,
  splitMaxSplit,
  stripInlineCode,
  WIKILINK_FULL_REGEX,
  WIKILINK_REGEX,
} from "../src/wiki/document.ts";

Deno.test("splitMaxSplit matches Python's maxsplit, not JavaScript's limit", () => {
  // Python: "a---b---c---d".split("---", 2) == ["a", "b", "c---d"]
  // JavaScript: "a---b---c---d".split("---", 2) == ["a", "b"]  (tail dropped)
  assertEquals(splitMaxSplit("a---b---c---d", "---", 2), [
    "a",
    "b",
    "c---d",
  ]);
  assertEquals(splitMaxSplit("a---b", "---", 2), ["a", "b"]);
  assertEquals(splitMaxSplit("no-separator", "---", 2), ["no-separator"]);
});

Deno.test("splitFrontmatterText splits prefix, body, and data", () => {
  const split = splitFrontmatterText("---\ntype: Person\n---\n\n# Body\n");
  assertEquals(split.prefix, "---\ntype: Person\n---");
  assertEquals(split.body, "\n\n# Body\n");
  assertEquals(split.data, { type: "Person" });
});

Deno.test("splitFrontmatterText returns the whole content when there is none", () => {
  const content = "# No frontmatter\n\nJust prose.\n";
  const split = splitFrontmatterText(content);
  assertEquals(split.prefix, "");
  assertEquals(split.body, content);
  assertEquals(split.data, null);
});

Deno.test("splitFrontmatterText keeps later `---` runs in the body", () => {
  // The split is crude by design: it stops after the second run, and a
  // horizontal rule or a second frontmatter-looking block stays in the body.
  const split = splitFrontmatterText(
    "---\ntype: X\n---\n\nBody line.\n\n---\n\nAfter the rule.\n",
  );
  assertEquals(split.prefix, "---\ntype: X\n---");
  assertEquals(split.body, "\n\nBody line.\n\n---\n\nAfter the rule.\n");
});

Deno.test("splitFrontmatterText does not split an opener-only document", () => {
  const content = "---\ntype: X\n\n# Unterminated\n";
  const split = splitFrontmatterText(content);
  assertEquals(split.prefix, "");
  assertEquals(split.body, content);
  assertEquals(split.data, null);
});

Deno.test("markdownBody strips frontmatter and otherwise passes through", () => {
  assertEquals(markdownBody("---\ntype: X\n---\nbody\n"), "\nbody\n");
  assertEquals(markdownBody("plain\n"), "plain\n");
});

Deno.test("protectedInlineCodeSpans reports character spans", () => {
  assertEquals(protectedInlineCodeSpans("a `code` b"), [[2, 8]]);
  assertEquals(protectedInlineCodeSpans("no code here"), []);
  // A backtick span never crosses a newline.
  assertEquals(protectedInlineCodeSpans("`open\nclose`"), []);
});

Deno.test("spanOverlaps detects partial and full overlaps only", () => {
  const spans = [[0, 5]] as const;
  assertEquals(spanOverlaps(0, 5, spans), true);
  assertEquals(spanOverlaps(4, 9, spans), true);
  assertEquals(spanOverlaps(5, 9, spans), false);
  assertEquals(spanOverlaps(9, 12, spans), false);
});

Deno.test("stripInlineCode removes inline code but keeps the prose", () => {
  assertEquals(
    stripInlineCode("see `[[Wiki]]` and [[Real]]"),
    "see  and [[Real]]",
  );
});

Deno.test("bodyCodeSpans covers inline and fenced code", () => {
  const spans = bodyCodeSpans("a `inline` b\n\n```\nfenced\n```\n");
  // Oracle-exact: `wiki.document.body_code_spans` returns these four spans for
  // this input (verified against the pinned Python build). The last two inline
  // spans are empty `` `` pairs the regex finds *inside* the fence — a quirk of
  // the upstream `[^`\n]*` pattern that the port must reproduce, not fix.
  assertEquals(spans, [
    [2, 10],
    [14, 16],
    [25, 27],
    [14, 28],
  ]);
  assertEquals(spanOverlaps(2, 8, spans), true);
});

Deno.test("a shared /g regex does not leak lastIndex between scans", () => {
  // `matchAll` clones the pattern, so the second scan sees the same matches as
  // the first. A loop built on `exec` would return nothing the second time.
  const content = "[[One]] and [[Two|display]]";
  const first = [...content.matchAll(WIKILINK_REGEX)].map((m) => m[1]);
  const second = [...content.matchAll(WIKILINK_REGEX)].map((m) => m[1]);
  assertEquals(first, ["One", "Two"]);
  assertEquals(second, first);
  assertEquals(WIKILINK_REGEX.lastIndex, 0);
});

Deno.test("the full-grammar regexes capture display text and targets", () => {
  const wikilink = [..."[[Page|Shown]]".matchAll(WIKILINK_FULL_REGEX)][0];
  assertEquals(wikilink?.[1], "Page");
  assertEquals(wikilink?.[2], "Shown");

  const fenced = [..."```\nx\n```".matchAll(FENCED_CODE_RE)];
  assertEquals(fenced.length, 1);
});

Deno.test("unparseable frontmatter yields no data rather than a throw", () => {
  const split = splitFrontmatterText("---\n: not yaml\n---\nbody\n");
  assertEquals(split.data, null);
});

Deno.test("a non-string input is a programming error, not a silent null", () => {
  assertThrows(() => splitFrontmatterText(undefined as unknown as string));
});
