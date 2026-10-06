/**
 * `pystr` against Python 3.12 semantics.
 *
 * These are the divergences the review caught by enumerating CPython's
 * behaviour directly: JavaScript's `\s` and Unicode property escapes do not
 * agree with `str.isspace()` / `str.isdigit()` on the boundary characters,
 * so the expected values below were read off Python 3.12, not hand-derived.
 */

import { assertEquals } from "@std/assert";
import {
  PY_WHITESPACE,
  pyIsDigit,
  pySplitWhitespace,
} from "../src/wiki/pystr.ts";

Deno.test("pySplitWhitespace follows Python 3.12, not JavaScript \\s", () => {
  // U+FEFF is not whitespace in Python 3 (it is in JS `\s`).
  assertEquals(pySplitWhitespace("a﻿b"), ["a﻿b"]);
  assertEquals(pySplitWhitespace("﻿"), ["﻿"]);
  // U+0085 (NEL) and U+001C–U+001F are whitespace in Python 3
  // (they are not in JS `\s`).
  assertEquals(pySplitWhitespace("ab"), ["a", "b"]);
  for (const char of ["\u001c", "\u001d", "\u001e", "\u001f"]) {
    assertEquals(pySplitWhitespace(`a${char}b`), ["a", "b"], char);
  }
  // The shared character class agrees with the splitter.
  assertEquals(new RegExp(`^${PY_WHITESPACE}+$`).test("﻿"), false);
  assertEquals(new RegExp(`^${PY_WHITESPACE}+$`).test(""), true);
});

Deno.test("pyIsDigit excludes vulgar fractions but keeps other No digits", () => {
  // `str.isdigit()` is true for No (other numbers) like superscripts, but
  // false for vulgar fractions — `\p{Nd}` alone gets the first half right
  // and the Decimal-or-Digit definition covers both.
  for (const char of ["½", "⅓", "¾", "↉"]) {
    assertEquals(pyIsDigit(char), false, char);
  }
  for (const char of ["²", "³", "٣", "①", "5"]) {
    assertEquals(pyIsDigit(char), true, char);
  }
});
