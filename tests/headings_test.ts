/**
 * Port of `tests/test_headings.py`, minus its renderer assertions.
 *
 * The Python file is shared by four modules: it asserts `parse_headings`'
 * slugs and text, that `wiki.site.markdown.extract_outline` and
 * `wiki.wiki_links._heading_ids` agree with it, and that `render_wiki_markdown`
 * emits the same ids as anchor attributes. The last two are phase 7/8
 * (`render`, `site`) and phase 6 (`wiki_links`) — the outline and renderer
 * assertions arrive with those modules, and `headingIds` is asserted here
 * because the link index's own test file would otherwise be the only place the
 * agreement is checked.
 */

import { assert, assertEquals } from "@std/assert";
import {
  GitHubHeadingSlugger,
  headingIds,
  headingSlug,
  parseHeadings,
} from "../src/wiki/headings.ts";

Deno.test("duplicate heading text gets a numbered slug", () => {
  const headings = parseHeadings("# Title\n\n## Early Life\n\n## Early Life\n");
  assertEquals(
    headings.map((heading) => heading.slug),
    ["title", "early-life", "early-life-1"],
  );
  assertEquals(
    headings.map((heading) => heading.level),
    [1, 2, 2],
  );
  assertEquals(
    headings.map((heading) => heading.line_no),
    [1, 3, 5],
  );
});

Deno.test("heading text keeps its inline markup", () => {
  const markdown = "# Page\n\n" +
    "## Request headers\n\n" +
    "### `Accept`\n\n" +
    "## Importance in the [[Semantic_Web|semantic web]]\n";

  const headings = parseHeadings(markdown);
  assertEquals(
    headings.map((heading) => heading.text),
    [
      "Page",
      "Request headers",
      "`Accept`",
      "Importance in the [[Semantic_Web|semantic web]]",
    ],
  );
  assertEquals(headingIds(markdown), new Set(headings.map((h) => h.slug)));
});

Deno.test("setext headings and fenced code are parsed, not approximated", () => {
  // A regex-based heading scan gets both of these wrong: `Title\n===` is an H1
  // with its line number on the text row, and a `#` inside a fence is content.
  const markdown = [
    "Title",
    "=====",
    "",
    "```sh",
    "# not a heading",
    "```",
    "",
    "## Real",
    "",
  ].join("\n");
  const headings = parseHeadings(markdown);
  assertEquals(
    headings.map((heading) => [heading.level, heading.text, heading.line_no]),
    [
      [1, "Title", 1],
      [2, "Real", 8],
    ],
  );
});

Deno.test("the slug rule strips punctuation, dashes spaces, and folds accents", () => {
  // Every expectation below is the pinned oracle's own output for the same
  // input (`wiki.headings.heading_slug`), including the CJK case, which is
  // where JavaScript's `\w` without the `u` flag would silently differ.
  const oracle: readonly (readonly [string, string])[] = [
    ["Request headers", "request-headers"],
    [
      "Importance in the [[Semantic_Web|semantic web]]",
      "importance-in-the-semantic_websemantic-web",
    ],
    ["Cafe\u0301", "cafe"],
    ["Café", "cafe"],
    ["  Trailing dashes -- ", "trailing-dashes"],
    ["!!!", "section"],
    ["", "section"],
    ["`Accept`", "accept"],
    ["Ampersand & Co. (v2)", "ampersand-co-v2"],
    ["Über 100 % Done", "uber-100-done"],
    ["a--b", "a-b"],
    ["日本語 見出し", "日本語-見出し"],
  ];
  for (const [input, expected] of oracle) {
    assertEquals(
      headingSlug(input),
      expected,
      `slug for ${JSON.stringify(input)}`,
    );
  }
  // NFKD splits the decomposed spelling into the same letters, which is the
  // whole reason the slug rule normalises first.
  assertEquals(headingSlug("Cafe\u0301"), headingSlug("Café"));
});

Deno.test("a slugger numbers collisions per base, in document order", () => {
  const slugger = new GitHubHeadingSlugger();
  assertEquals(
    ["Notes", "Notes", "Notes", "Other", "Notes"].map((title) =>
      slugger.slug(title)
    ),
    ["notes", "notes-1", "notes-2", "other", "notes-3"],
  );
});

Deno.test("a document with no headings has no ids", () => {
  assertEquals(parseHeadings("Just prose."), []);
  assert(headingIds("Just prose.").size === 0);
});
