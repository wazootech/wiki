/**
 * Text transforms behind the `set`, `patch`, and typed `create` edit ops.
 *
 * Each takes a page's current text and returns its new text; none touches the
 * disk. `edit.ts` stages the result in its overlay and validates it like any
 * other edit, so a transform only has to be *faithful*: change what it was
 * asked to change and leave every other byte where it was. That is why
 * frontmatter goes through `yaml`'s document model (comments, key order, and a
 * scalar's source spelling such as `12.00` survive a round trip; 184 of 184
 * real pages in `memory` and the docs wiki round-trip byte-for-byte), and why
 * sections are found through the Markdown parser rather than a `#` scan.
 */

import { parseDocument } from "yaml";
import { basename, extname } from "@std/path";
import type { Context } from "./context.ts";
import { derivedPredicate } from "./derived.ts";
import { resolvePredicate } from "./graph.ts";
import { EditOpError, type FieldValue, valueNode } from "./edit_ops/fields.ts";

export {
  EditOpError,
  type FieldValue,
  type PatchMode,
  type PatchTarget,
  setField,
} from "./edit_ops/fields.ts";
export { patchContent } from "./edit_ops/patch.ts";
export { requiredFields, typeKey } from "./edit_ops/scaffold_fields.ts";

/** Keys whose value becomes the page's H1, in order of preference. */
const TITLE_KEYS = ["headline", "schema:headline", "name", "schema:name"];

/** The title a scaffolded page's H1 and filename come from, if any. */
export function scaffoldTitle(
  fields: ReadonlyArray<readonly [string, FieldValue]>,
): string | null {
  for (const key of TITLE_KEYS) {
    const entry = fields.find(([field]) => field === key);
    if (entry === undefined) continue;
    const value = "yaml" in entry[1]
      ? parseDocument(entry[1].yaml).toJS()
      : entry[1].json;
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return null;
}

/**
 * A Wikipedia-style filename for a title: spaces to underscores, unsafe route
 * characters dropped (`Opal Security` → `Opal_Security.md`), as the style
 * guide and `lint.filename_pattern` expect.
 */
export function titleFilename(title: string): string {
  const stem = title.trim().replace(/\s+/g, "_").replace(
    /[^\p{L}\p{N}_().,'-]/gu,
    "",
  );
  if (stem === "") {
    throw new EditOpError(
      `Cannot derive a filename from the title ${JSON.stringify(title)}.`,
    );
  }
  return `${stem}.md`;
}

/** Whether a field is a `schema:headline` that only repeats the H1's title. */
function isDerivedHeadline(
  key: string,
  value: FieldValue,
  title: string,
  context: Context,
): boolean {
  if (
    resolvePredicate(key, context)?.value !==
      derivedPredicate("headline", context)
  ) return false;
  const text = "yaml" in value ? parseDocument(value.yaml).toJS() : value.json;
  return typeof text === "string" && text.trim() === title;
}

/**
 * A new page of `type`: typed frontmatter with the shape's required fields
 * first (those the caller supplied), then the rest, then an H1.
 *
 * A required field the caller did not supply is left out, never filled with a
 * placeholder: the edit's validation then rejects the page and names the
 * missing field, which is the honest answer.
 *
 * With a `context`, a key that spells `schema:headline` and equals the title
 * names the file and writes the H1 but stays out of the frontmatter: the graph
 * derives that headline from the H1 (wiki#318), so the key would only repeat
 * it and fail `lint.redundant_frontmatter` (#402).
 */
export function scaffoldPage(options: {
  readonly path: string;
  readonly typeKey: "@type" | "type";
  readonly type: string | null;
  readonly required: readonly string[];
  readonly fields: ReadonlyArray<readonly [string, FieldValue]>;
  readonly body?: string | null;
  readonly context?: Context;
}): string {
  const doc = parseDocument("");
  if (options.type !== null) doc.set(options.typeKey, options.type);
  const title = scaffoldTitle(options.fields);
  const fields = options.context === undefined || title === null
    ? options.fields
    : options.fields.filter(([key, value]) =>
      !isDerivedHeadline(key, value, title, options.context!)
    );
  const supplied = new Map(fields.map(([key, value]) => [key, value]));
  const ordered = [
    ...options.required.filter((key) => supplied.has(key)),
    ...fields.map(([key]) => key).filter((key) =>
      !options.required.includes(key)
    ),
  ];
  for (const key of ordered) {
    doc.set(key, valueNode(supplied.get(key)!, key));
  }
  const yaml = doc.contents === null ? "" : doc.toString({ lineWidth: 0 });
  const heading = title ??
    basename(options.path, extname(options.path)).replaceAll("_", " ");
  const body = options.body?.trim() ?? "";
  return `---\n${yaml}---\n\n# ${heading}\n${body === "" ? "" : `\n${body}\n`}`;
}
