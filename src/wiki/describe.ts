/**
 * Rendering values for diagnostic messages.
 *
 * Config and schema errors quote the offending value so the reader can paste it
 * back into their config, and they name its type when the shape is wrong. JSON
 * covers every value a config file can hold, so that is what the quoting uses.
 */

/**
 * Render `value` as JSON.
 *
 * `JSON.stringify` returns `undefined` for values it cannot represent
 * (functions, symbols, `undefined`), so those fall back to `String`.
 */
export function describeValue(value: unknown): string {
  const json = JSON.stringify(value);
  return json === undefined ? String(value) : json;
}

/** Render `text` as a quoted string literal. */
export function quoteString(text: string): string {
  return JSON.stringify(text);
}

/**
 * Render `value` as text: a string stays bare, anything else is described.
 *
 * The distinction matters where a message interpolates a value that may or may
 * not already be a string.
 */
export function describeText(value: unknown): string {
  return typeof value === "string" ? value : describeValue(value);
}

/** The JavaScript type of `value`, for messages that name it. */
export function describeType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}
