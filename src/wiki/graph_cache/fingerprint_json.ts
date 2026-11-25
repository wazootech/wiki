/**
 * Render a value the way Python's `json.dumps(value, sort_keys=True,
 * separators=(",", ":"))` renders it.
 *
 * The non-ASCII escaping is the part that matters: `ensure_ascii` is on by
 * default in Python, so a path containing `é` becomes `\u00e9` in the digest
 * input. `JSON.stringify` would leave it raw and produce a different
 * fingerprint for the same wiki.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return encodeJsonString(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${
    entries.map(([key, item]) =>
      `${encodeJsonString(key)}:${canonicalJson(item)}`
    ).join(",")
  }}`;
}

/** Python's ASCII-safe string encoding, as used by `json.dumps`. */
function encodeJsonString(value: string): string {
  let out = '"';
  for (const char of value) {
    const code = char.codePointAt(0)!;
    switch (char) {
      case '"':
        out += '\\"';
        continue;
      case "\\":
        out += "\\\\";
        continue;
      case "\n":
        out += "\\n";
        continue;
      case "\r":
        out += "\\r";
        continue;
      case "\t":
        out += "\\t";
        continue;
      case "\b":
        out += "\\b";
        continue;
      case "\f":
        out += "\\f";
        continue;
      default:
        break;
    }
    // Printable ASCII survives; everything else (including U+007F and every
    // non-ASCII code point) is escaped, astral characters as a surrogate pair.
    if (code >= 0x20 && code <= 0x7e) {
      out += char;
    } else if (code <= 0xffff) {
      out += `\\u${code.toString(16).padStart(4, "0")}`;
    } else {
      const offset = code - 0x10000;
      const high = 0xd800 + (offset >> 10);
      const low = 0xdc00 + (offset & 0x3ff);
      out += `\\u${high.toString(16).padStart(4, "0")}\\u${
        low.toString(16).padStart(4, "0")
      }`;
    }
  }
  return `${out}"`;
}
