/**
 * `urllib.parse.quote`, ported.
 *
 * `paths.page_url` runs every route through `quote(route, safe="/()_-.$~")`, and
 * the set of characters that survive decides published URLs — so the built-in
 * `encodeURIComponent` is not a substitute: it leaves `!*'()` alone and does not
 * encode the same characters, and `encodeURI` leaves `#$&+,/:;=?@` alone.
 *
 * The port follows CPython exactly: percent-encode each UTF-8 *byte* outside
 * `A-Za-z0-9_.-~` and `safe`, using uppercase hex. `$` and `()` are in the
 * caller's safe set, which is why `Pokemon_Diamond_(copy_1)` keeps its
 * parentheses in a published URL.
 */

/** CPython's `_ALWAYS_SAFE`: never percent-encoded. */
const ALWAYS_SAFE = new Set(
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_.-~",
);

/**
 * Quote `text` for use in a URL, leaving `safe` characters alone.
 *
 * Mirrors `quote(string, safe="/", encoding="utf-8", errors="strict")`: an empty
 * string is returned untouched, and a character outside the safe set becomes its
 * percent-encoded UTF-8 bytes.
 */
export function quote(text: string, safe = "/"): string {
  if (text === "") return text;
  const allowed = new Set(safe);
  const bytes = new TextEncoder().encode(text);
  let out = "";
  for (const byte of bytes) {
    const char = String.fromCharCode(byte);
    // Only ASCII bytes can be "safe"; a continuation byte never is.
    if (byte < 0x80 && (ALWAYS_SAFE.has(char) || allowed.has(char))) {
      out += char;
    } else {
      out += `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
    }
  }
  return out;
}
