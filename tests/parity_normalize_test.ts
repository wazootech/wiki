/**
 * Unit tests for the differential harness's normalisation rules.
 *
 * Each rule exists to fold away a difference that was observed to be
 * non-semantic, so each one is asserted both ways: that it folds the noise, and
 * that it leaves a real difference alone.
 */
import { assertEquals } from "@std/assert";
import {
  CORPUS_PLACEHOLDER,
  normalizeFixture,
  normalizeLineEndings,
  normalizeOutput,
  normalizeScratchRoot,
  normalizeTrailingBlankLines,
  stripAnsi,
  stripBom,
} from "../parity/normalize.ts";

Deno.test("stripBom removes a leading BOM only", () => {
  assertEquals(stripBom("\uFEFFabc"), "abc");
  assertEquals(stripBom("abc"), "abc");
  assertEquals(stripBom("a\uFEFFb"), "a\uFEFFb");
});

Deno.test("normalizeLineEndings folds CRLF and lone CR to LF", () => {
  assertEquals(normalizeLineEndings("a\r\nb"), "a\nb");
  assertEquals(normalizeLineEndings("a\rb"), "a\nb");
  assertEquals(normalizeLineEndings("a\nb"), "a\nb");
  assertEquals(normalizeLineEndings("a\r\n\r\nb"), "a\n\nb");
});

Deno.test("stripAnsi removes escape sequences but keeps the text", () => {
  assertEquals(stripAnsi("\u001b[31merror\u001b[0m: bad"), "error: bad");
  assertEquals(stripAnsi("plain"), "plain");
});

Deno.test("normalizeScratchRoot rewrites native and POSIX spellings", () => {
  const root = "C:\\tmp\\case";
  assertEquals(
    normalizeScratchRoot(`at ${root}\\wiki.yml`, root),
    `at ${CORPUS_PLACEHOLDER}\\wiki.yml`,
  );
  assertEquals(
    normalizeScratchRoot(`at C:/tmp/case/wiki.yml`, root),
    `at ${CORPUS_PLACEHOLDER}/wiki.yml`,
  );
});

Deno.test("normalizeScratchRoot prefers the longest matching variant", () => {
  // A prefix directory must not be rewritten before the full path is.
  assertEquals(
    normalizeScratchRoot("/a/b/c/d", "/a/b/c"),
    `${CORPUS_PLACEHOLDER}/d`,
  );
});

Deno.test("normalizeTrailingBlankLines collapses trailing blank lines", () => {
  assertEquals(normalizeTrailingBlankLines("a\n\n\n"), "a\n");
  assertEquals(normalizeTrailingBlankLines("a\n"), "a\n");
  assertEquals(normalizeTrailingBlankLines(""), "");
  assertEquals(normalizeTrailingBlankLines("\n"), "\n");
});

Deno.test("normalizeTrailingBlankLines keeps a missing final newline", () => {
  // Whether a CLI terminates its last line is part of the contract, so the
  // harness must not paper over it.
  assertEquals(normalizeTrailingBlankLines("a"), "a");
});

Deno.test("normalizeOutput applies every rule, in order", () => {
  const root = "/scratch/case";
  const raw = "\uFEFF\u001b[32mUsing inline fmt\u001b[0m in wiki config.\r\n" +
    `Error: missing ${root}/assets\r\n\r\n`;
  assertEquals(
    normalizeOutput(raw, { scratchRoot: root }),
    "Using inline fmt in wiki config.\n" +
      `Error: missing ${CORPUS_PLACEHOLDER}/assets\n`,
  );
});

Deno.test("normalizeFixture makes a CRLF golden read as LF", () => {
  // `.gitattributes` stores fixtures as LF while the machine that produced them
  // may have written CRLF, so reads are normalised rather than compared raw.
  assertEquals(normalizeFixture("\uFEFFa\r\nb\r\n"), "a\nb\n");
});
