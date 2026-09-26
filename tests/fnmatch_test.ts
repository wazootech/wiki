/**
 * `fnmatchCase` vs the pinned Python oracle.
 *
 * The golden is generated, not hand-written, so it stays honest: the verdicts
 * are `fnmatch.fnmatchcase`'s, and any drift in the TS translation fails here
 * rather than surfacing later as files silently appearing in (or vanishing
 * from) a command's input set.
 */

import { assertEquals } from "@std/assert";
import { fnmatchCase } from "../src/wiki/fnmatch.ts";

interface GoldenRow {
  readonly name: string;
  readonly pattern: string;
  readonly matches: boolean;
  readonly translate: string;
}

const golden = JSON.parse(
  Deno.readTextFileSync(
    new URL("../probes/fnmatch/golden.json", import.meta.url),
  ),
) as { readonly results: readonly GoldenRow[] };

Deno.test("fnmatchCase agrees with fnmatch.fnmatchcase across the corpus", () => {
  const mismatches: string[] = [];
  for (const row of golden.results) {
    const actual = fnmatchCase(row.name, row.pattern);
    if (actual !== row.matches) {
      mismatches.push(
        `fnmatchCase(${JSON.stringify(row.name)}, ${
          JSON.stringify(row.pattern)
        }) = ${actual}, oracle = ${row.matches}`,
      );
    }
  }
  assertEquals(mismatches, []);
});

Deno.test("the corpus covers both verdicts, so agreement is not vacuous", () => {
  const matching = golden.results.filter((row) => row.matches).length;
  assertEquals(matching > 0 && matching < golden.results.length, true);
});

Deno.test("the golden is the Python 3.12 translate form", () => {
  // A Python upgrade changes `fnmatch.translate`'s shape. Pinning it here means
  // the golden's provenance is visible rather than implied, so a toolchain bump
  // shows up as a failing assertion instead of a silently weakened corpus.
  for (const row of golden.results) {
    assertEquals(row.translate.startsWith("(?s:"), true);
    assertEquals(row.translate.endsWith("\\Z"), true);
  }
});

Deno.test("double star is not a globstar: it crosses separators like a star", () => {
  // The reason `@std/path`'s `globToRegExp` is unusable here: a globstar would
  // stop at `/`, quietly narrowing every exclude pattern.
  assertEquals(fnmatchCase("a/b/c.md", "a/*"), true);
  assertEquals(fnmatchCase("a/b/c.md", "a/**"), true);
  assertEquals(fnmatchCase("a/b/c.md", "a/**/c.md"), true);
});

Deno.test("a trailing separator in the pattern is required, not optional", () => {
  // Oracle-verified: `**` is a star, but the `/` next to it is a literal, so
  // these reject a name with no directory component.
  assertEquals(fnmatchCase("x.md", "**/x.md"), false);
  assertEquals(fnmatchCase("d/e/x.md", "**/x.md"), true);
  assertEquals(fnmatchCase("wiki/x.md", "wiki/**/*.md"), false);
  assertEquals(fnmatchCase("wiki/a/x.md", "wiki/**/*.md"), true);
});

Deno.test("an inverted range matches nothing, as in Python", () => {
  // CPython's range fix-up drops `[z-a]` entirely, leaving a never-matching
  // pattern. Passing it through to JavaScript would instead throw a syntax
  // error mid-command, so this is the case that must not regress.
  assertEquals(fnmatchCase("m.md", "[z-a].md"), false);
  assertEquals(fnmatchCase("z-a.md", "[z-a].md"), false);
});

Deno.test("unclosed bracket and star crossings behave like fnmatch", () => {
  assertEquals(fnmatchCase("[", "["), true);
  assertEquals(fnmatchCase("bracket[.md", "bracket[.md"), true);
  // `fnmatch` matches newlines because it compiles with dot-all.
  assertEquals(fnmatchCase("a\nb.md", "*.md"), true);
});
