/**
 * Python's `repr` for JavaScript values.
 *
 * Ported error messages interpolate values with `!r` — `Invalid
 * lint.broken_links severity: 'maybe' (expected error, warning, or off)` — so
 * reproducing Python's quoting is what keeps a config-diagnosis message
 * identical to the oracle's. JavaScript's `JSON.stringify` would render
 * `"maybe"` and silently change every one of those strings.
 *
 * Faithful for the value shapes a config file can hold: `None`/booleans,
 * numbers, strings, lists, and dicts. Deliberately not attempted: Python's
 * float repr for values JavaScript cannot distinguish (`1.0` vs `1`), and
 * object reprs for anything without a plain-dict equivalent.
 */

/** Render `value` the way Python's `repr` would. */
export function pyRepr(value: unknown): string {
  if (value === null || value === undefined) return "None";
  if (typeof value === "boolean") return value ? "True" : "False";
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") {
    if (Number.isInteger(value)) return String(value);
    return String(value);
  }
  if (typeof value === "string") return pyReprString(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => pyRepr(item)).join(", ")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    return `{${
      entries.map(([key, item]) => `${pyReprString(key)}: ${pyRepr(item)}`)
        .join(", ")
    }}`;
  }
  return String(value);
}

/**
 * Render a string as a Python literal.
 *
 * Python prefers single quotes and switches to double quotes only when the
 * string contains a single quote and no double quote — the rule that makes
 * `"Value error, expected fallback or append, got 'replace'"` come out with
 * single quotes while `'say "hi"'` comes out with double ones.
 */
export function pyReprString(text: string): string {
  const quote = text.includes("'") && !text.includes('"') ? '"' : "'";
  let out = "";
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if (char === "\\") out += "\\\\";
    else if (char === quote) out += `\\${quote}`;
    else if (char === "\n") out += "\\n";
    else if (char === "\r") out += "\\r";
    else if (char === "\t") out += "\\t";
    else if (code < 0x20 || code === 0x7f) {
      out += `\\x${code.toString(16).padStart(2, "0")}`;
    } else out += char;
  }
  return `${quote}${out}${quote}`;
}

/** Python's `type(value).__name__`, for pydantic's `input_type=` field. */
export function pyTypeName(value: unknown): string {
  if (value === null || value === undefined) return "NoneType";
  if (typeof value === "boolean") return "bool";
  if (typeof value === "number") {
    return Number.isInteger(value) ? "int" : "float";
  }
  if (typeof value === "string") return "str";
  if (Array.isArray(value)) return "list";
  if (typeof value === "object") return "dict";
  return typeof value;
}
