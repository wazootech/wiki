/**
 * Python's `str` methods that JavaScript spells differently.
 *
 * The audit lints ask questions about *case* and *digit-ness* in a way that
 * Python answers with Unicode-aware predicates and JavaScript does not:
 *
 * - `"STRASSE".isupper()` and `"straße".islower()` are about cased characters,
 *   not about comparing a string to its uppercase form — `"123".isupper()` is
 *   `False` because there is no cased character at all, and `"A 1".isupper()`
 *   is `True` because the only cased character is an `A`.
 * - `"²".isdigit()` is `True`, which `\d` and even `\p{Nd}` say `False` to.
 * - `str.casefold()` is *not* `str.lower()`: it is Unicode's full folding, so
 *   `"Straße".casefold()` is `"strasse"` where `lower()` leaves the `ß` alone.
 *
 * These are the predicates behind heading style linting, so getting one wrong
 * changes a user-visible message rather than an internal index. Everything here
 * is a direct transcription of the CPython definitions rather than a guess
 * about what "looks uppercase".
 *
 * `splitLines` and the whitespace `pyStrip` live in `parser.ts`, where the port
 * first needed them; this module is for the case and character-class
 * predicates that only the audit layer needs.
 */

/** `Lu`, `Ll`, or `Lt`: Python's definition of a *cased* character. */
const CASED = /[\p{Lu}\p{Ll}\p{Lt}]/u;

/** `Nd` or `No`: the categories Python's `str.isdigit()` accepts. */
const DIGIT = /[\p{Nd}\p{No}]/u;

/**
 * Python's `str.isupper()`: at least one cased character, and all of them
 * uppercase.
 *
 * `"123"` and `""` are `False` — the empty-cased case is the one an
 * `text === text.toUpperCase()` implementation gets wrong.
 */
export function pyIsUpper(text: string): boolean {
  let cased = false;
  for (const char of text) {
    if (!CASED.test(char)) continue;
    cased = true;
    if (char !== char.toUpperCase()) return false;
  }
  return cased;
}

/** Python's `str.islower()`, the mirror of {@link pyIsUpper}. */
export function pyIsLower(text: string): boolean {
  let cased = false;
  for (const char of text) {
    if (!CASED.test(char)) continue;
    cased = true;
    if (char !== char.toLowerCase()) return false;
  }
  return cased;
}

/** Python's `char.isdigit()`, which is wider than `\p{Nd}`. */
export function pyIsDigit(char: string): boolean {
  return DIGIT.test(char);
}

/**
 * The multi-character entries of Unicode's full case folding, for the scripts
 * a wiki heading can hold.
 *
 * `str.casefold()` maps `ß` to `ss` and the Latin ligatures to their component
 * letters; `toLowerCase()` maps neither. The table CPython uses has around a
 * hundred entries covering Arabic, Armenian, Cherokee, and the rest, and every
 * one of them beyond this list needs a script this engine has never seen in a
 * heading — so the port carries the subset and says so instead of shipping a
 * generated table no test could justify.
 *
 * The consequence of a miss is narrow and worth stating: two headings that
 * differ only by a fold this table lacks are not reported as duplicates.
 */
const CASE_FOLD_EXPANSIONS: ReadonlyMap<string, string> = new Map([
  ["\u00df", "ss"], // ß
  ["\u1e9e", "ss"], // ẞ
  ["\u0130", "i\u0307"], // İ
  ["\u01f0", "j\u030c"], // ǰ
  ["\u1e96", "h\u0331"],
  ["\u1e97", "t\u0308"],
  ["\u1e98", "w\u030a"],
  ["\u1e99", "y\u030a"],
  ["\u1e9a", "a\u02be"],
  ["\ufb00", "ff"],
  ["\ufb01", "fi"],
  ["\ufb02", "fl"],
  ["\ufb03", "ffi"],
  ["\ufb04", "ffl"],
  ["\ufb05", "st"],
  ["\ufb06", "st"],
  ["\u0149", "\u02bcn"], // ŉ
  ["\u0390", "\u03b9\u0308\u0301"], // ΐ
  ["\u03b0", "\u03c5\u0308\u0301"], // ΰ
  ["\u1f50", "\u03c5\u0313"],
  ["\u1f52", "\u03c5\u0313\u0300"],
  ["\u1f54", "\u03c5\u0313\u0301"],
  ["\u1f56", "\u03c5\u0313\u0342"],
  ["\u1fd3", "\u03b9\u0308\u0301"],
  ["\u1fe3", "\u03c5\u0308\u0301"],
]);

/** Foldings that are a single character, so `toLowerCase` can be bypassed. */
const CASE_FOLD_SINGLES: ReadonlyMap<string, string> = new Map([
  ["\u00b5", "\u03bc"], // µ MICRO SIGN folds to Greek mu
  ["\u03c2", "\u03c3"], // final sigma folds to medial sigma
  ["\u1fbe", "\u03b9"], // Greek prosgegrammeni
]);

/**
 * Python's `str.casefold()`.
 *
 * Applied character by character because the expansions change length: folding
 * `"Straße"` and then lowercasing the result would give `"strasse"` only if the
 * `ß` is expanded *before* any index is trusted, which is why this does not go
 * through `String.prototype.replace` with a lowercase pass on top.
 */
export function pyCasefold(text: string): string {
  let out = "";
  for (const char of text) {
    const expansion = CASE_FOLD_EXPANSIONS.get(char);
    if (expansion !== undefined) {
      out += expansion;
      continue;
    }
    const single = CASE_FOLD_SINGLES.get(char);
    if (single !== undefined) {
      out += single;
      continue;
    }
    out += char.toLowerCase();
  }
  return out;
}

/**
 * Python's `str.strip(chars)`, where `chars` is a *set* of characters rather
 * than a substring.
 *
 * `"## Method:".strip(".,;:!?")` is `"## Method:"` — the trailing colon is
 * there, the leading `#` is not in the set — which a `trim()` or a
 * `startsWith`/`endsWith` pair would each get wrong in a different direction.
 */
export function pyStripChars(text: string, chars: string): string {
  const set = new Set([...chars]);
  const points = [...text];
  let start = 0;
  let end = points.length;
  while (start < end && set.has(points[start] as string)) start++;
  while (end > start && set.has(points[end - 1] as string)) end--;
  return points.slice(start, end).join("");
}

/**
 * Python's `str.split()` with no argument: split on runs of whitespace and drop
 * empty fields, which `"".split()` and `" a ".split()` both make a special case
 * of.
 */
export function pySplitWhitespace(text: string): string[] {
  const parts = text.split(
    /[\s\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/,
  );
  return parts.filter((part) => part !== "");
}
