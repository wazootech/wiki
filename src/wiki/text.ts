/**
 * Text predicates and splits the lints need.
 *
 * The heading and title-case lints ask about *case* and *digit-ness*, which
 * JavaScript has no direct predicate for: `text === text.toUpperCase()` gets
 * `"123"` wrong (no cased character at all is not "uppercase"), so the cased
 * questions are answered with Unicode property escapes instead.
 */

/** `Lu`, `Ll`, or `Lt`: a *cased* character. */
const CASED = /[\p{Lu}\p{Ll}\p{Lt}]/u;

/** `Nd`: a decimal digit. */
const DIGIT = /\p{Nd}/u;

/**
 * Whether `text` holds at least one cased character and all of them are
 * uppercase.
 *
 * `""` and `"123"` are `false`: there is nothing cased to be uppercase.
 */
export function isUppercase(text: string): boolean {
  let cased = false;
  for (const char of text) {
    if (!CASED.test(char)) continue;
    cased = true;
    if (char !== char.toUpperCase()) return false;
  }
  return cased;
}

/** The mirror of {@link isUppercase}. */
export function isLowercase(text: string): boolean {
  let cased = false;
  for (const char of text) {
    if (!CASED.test(char)) continue;
    cased = true;
    if (char !== char.toLowerCase()) return false;
  }
  return cased;
}

/** Whether `char` is a decimal digit. */
export function isDigit(char: string): boolean {
  return DIGIT.test(char);
}

/** Split on runs of whitespace, dropping the empty fields. */
export function splitWhitespace(text: string): string[] {
  return text.split(/\s+/).filter((part) => part !== "");
}

/**
 * Strip any character of `chars` from both ends, treating `chars` as a *set*.
 *
 * `stripChars("## Method:", "#")` is `" Method:"` — the trailing colon is not
 * in the set — which a `startsWith`/`endsWith` pair would get wrong.
 */
export function stripChars(text: string, chars: string): string {
  const set = new Set([...chars]);
  const points = [...text];
  let start = 0;
  let end = points.length;
  while (start < end && set.has(points[start] as string)) start++;
  while (end > start && set.has(points[end - 1] as string)) end--;
  return points.slice(start, end).join("");
}
