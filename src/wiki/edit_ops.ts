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

import { type Node, parseDocument } from "yaml";
import { basename, extname } from "@std/path";
import type { Config } from "./config.ts";
import { splitFrontmatterText } from "./document.ts";
import { ValueError } from "./errors.ts";
import {
  buildTypeSchemaRegistry,
  normalizeTypeUri,
  SchemaLoader,
  TARGET_CLASS_KEY,
} from "./frontmatter_schema.ts";
import { readText } from "./fspath.ts";
import { findSections } from "./headings.ts";
import { iterDocumentFiles } from "./paths.ts";

/** A transform the caller asked for that cannot apply to this page. */
export class EditOpError extends ValueError {
  constructor(message: string) {
    super(message);
    this.name = "EditOpError";
  }
}

/**
 * A frontmatter value: YAML source kept verbatim (`{ yaml: "12.00" }`, what the
 * CLI passes) or a JSON value serialized by `yaml` (`{ json: 12 }`).
 */
export type FieldValue =
  | { readonly yaml: string }
  | { readonly json: unknown };

/** Where a `patch` op lands. Mirrors `EditTarget` in `edit.ts`. */
export type PatchTarget =
  | { readonly heading: string }
  | { readonly frontmatter: true }
  | { readonly body: true };

export type PatchMode = "append" | "prepend" | "replace";

/** Run `transform` on LF text and give the result back the page's own line endings. */
function withLineEndings(
  content: string,
  transform: (lf: string) => string,
): string {
  const crlf = content.includes("\r\n");
  const out = transform(crlf ? content.replaceAll("\r\n", "\n") : content);
  return crlf ? out.replaceAll("\n", "\r\n") : out;
}

/** The YAML node a value becomes, parsed once so a bad value fails early. */
function valueNode(value: FieldValue, field: string): Node | unknown {
  if ("yaml" in value) {
    const parsed = parseDocument(value.yaml);
    if (parsed.errors.length > 0) {
      throw new EditOpError(
        `${field}: the value is not valid YAML (${parsed.errors[0]!.message}).`,
      );
    }
    return parsed.contents;
  }
  return value.json;
}

/** Split off the frontmatter's YAML text, or `null` when the page has none. */
function frontmatterYaml(
  content: string,
): { yaml: string; body: string } | null {
  const split = splitFrontmatterText(content);
  if (split.prefix === "") return null;
  // The prefix is `---<middle>---`; `<middle>` starts with the newline that
  // ends the opening fence, which is not part of the YAML.
  const middle = split.prefix.slice(3, -3);
  return { yaml: middle.replace(/^\n/, ""), body: split.body };
}

function parseFrontmatter(yaml: string, path: string) {
  const doc = parseDocument(yaml);
  if (doc.errors.length > 0) {
    throw new EditOpError(
      `${path}: the frontmatter does not parse (${
        doc.errors[0]!.message
      }); fix it by hand or replace the page.`,
    );
  }
  return doc;
}

/**
 * Set (or, with `null`, remove) one top-level frontmatter field.
 *
 * The key is taken literally, never split on `.` or `:`, because frontmatter
 * keys are CURIEs (`schema:price`). A page with no frontmatter gets one.
 */
export function setField(
  content: string,
  path: string,
  field: string,
  value: FieldValue | null,
): string {
  return withLineEndings(content, (text) => {
    const split = frontmatterYaml(text);
    const doc = parseFrontmatter(split?.yaml ?? "", path);
    if (value === null) {
      doc.delete(field);
    } else {
      doc.set(field, valueNode(value, field));
    }
    const yaml = doc.contents === null ? "" : doc.toString({ lineWidth: 0 });
    if (split === null) {
      return `---\n${yaml}---\n\n${text.replace(/^\s+/, "")}`;
    }
    return `---\n${yaml}---${split.body}`;
  });
}

/** Drop blank lines from both ends. */
function trimBlankLines(lines: readonly string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start]!.trim() === "") start++;
  while (end > start && lines[end - 1]!.trim() === "") end--;
  return lines.slice(start, end);
}

function joinBlocks(
  mode: PatchMode,
  existing: readonly string[],
  added: readonly string[],
): string[] {
  if (mode === "replace") return [...added];
  if (existing.length === 0) return [...added];
  if (added.length === 0) return [...existing];
  return mode === "append"
    ? [...existing, "", ...added]
    : [...added, "", ...existing];
}

/**
 * Append to, prepend to, or replace part of a page.
 *
 * - `heading`: the lines under that heading, up to the next heading at the
 *   same or a higher level. The heading line itself is kept.
 * - `body`: everything after the frontmatter.
 * - `frontmatter`: the YAML between the fences; the result must still parse.
 *
 * Blocks are separated by one blank line, as `wiki fmt` leaves them.
 */
export function patchContent(
  content: string,
  path: string,
  target: PatchTarget,
  mode: PatchMode,
  addition: string,
): string {
  return withLineEndings(content, (text) => {
    const added = trimBlankLines(addition.replaceAll("\r\n", "\n").split("\n"));
    const split = splitFrontmatterText(text);

    if ("frontmatter" in target) {
      const current = frontmatterYaml(text);
      const existing = trimBlankLines((current?.yaml ?? "").split("\n"));
      const lines = mode === "replace"
        ? added
        : mode === "append"
        ? [...existing, ...added]
        : [...added, ...existing];
      const yaml = lines.length === 0 ? "" : `${lines.join("\n")}\n`;
      parseFrontmatter(yaml, path);
      const body = current === null
        ? `\n\n${text.replace(/^\s+/, "")}`
        : current.body;
      return `---\n${yaml}---${body}`;
    }

    if ("body" in target) {
      const existing = trimBlankLines(split.body.split("\n"));
      const lines = joinBlocks(mode, existing, added);
      const body = lines.length === 0 ? "" : `${lines.join("\n")}\n`;
      return split.prefix === "" ? body : `${split.prefix}\n\n${body}`;
    }

    const sections = findSections(split.body, target.heading);
    if (sections.length === 0) {
      throw new EditOpError(
        `${path}: no heading matches ${JSON.stringify(target.heading)}.`,
      );
    }
    if (sections.length > 1) {
      throw new EditOpError(
        `${path}: ${sections.length} headings match ${
          JSON.stringify(target.heading)
        }; use a more specific heading or its anchor slug (${
          sections.map((section) => `#${section.slug}`).join(", ")
        }).`,
      );
    }
    const section = sections[0]!;
    const lines = split.body.split("\n");
    const inner = trimBlankLines(
      lines.slice(section.contentStart, section.end),
    );
    const block = joinBlocks(mode, inner, added);
    const atEnd = section.end >= lines.length;
    const rebuilt = [
      ...lines.slice(0, section.contentStart),
      ...(block.length === 0 ? [] : ["", ...block]),
      "",
      ...(atEnd ? [] : lines.slice(section.end)),
    ];
    return `${split.prefix}${rebuilt.join("\n")}`;
  });
}

/** Frontmatter keys a page of `type` must carry, in the order shapes list them. */
export async function requiredFields(
  config: Config,
  type: string,
): Promise<string[]> {
  const typeKey = normalizeTypeUri(type, config);
  const fields: string[] = [];
  const add = (key: unknown) => {
    if (typeof key === "string" && key !== "" && !fields.includes(key)) {
      fields.push(key);
    }
  };

  // SHACL shape pages: `sh:property` entries with `sh:minCount >= 1`. Read
  // from frontmatter, the way `buildTypeSchemaRegistry` reads schema bindings,
  // so the keys come back spelled as this wiki spells them (`schema:name`).
  // Shapes written in Turtle blocks or RDF files are not consulted here; the
  // edit's validation still enforces them.
  for (const filePath of iterDocumentFiles(config)) {
    if (extname(filePath).toLowerCase() !== ".md") continue;
    const data = splitFrontmatterText(readText(filePath)).data;
    if (data === null) continue;
    const targets = [data[TARGET_CLASS_KEY]].flat();
    if (
      !targets.some((target) => normalizeTypeUri(target, config) === typeKey)
    ) {
      continue;
    }
    const properties = data["sh:property"];
    if (!Array.isArray(properties)) continue;
    for (const property of properties) {
      if (property === null || typeof property !== "object") continue;
      const record = property as Record<string, unknown>;
      if (Number(record["sh:minCount"] ?? 0) >= 1) add(record["sh:path"]);
    }
  }

  // JSON Schemas bound to the type: their top-level `required`.
  const refs = buildTypeSchemaRegistry(config).get(typeKey) ?? [];
  if (refs.length > 0) {
    const loader = new SchemaLoader(config.config_root, {
      remoteSchemaRefs: config.check.remote_schema_refs,
      remoteSchemaHosts: config.check.remote_schema_hosts,
    });
    for (const ref of refs) {
      const { schema } = await loader.loadSchema(ref);
      const required = schema?.["required"];
      if (Array.isArray(required)) required.forEach(add);
    }
  }
  return fields;
}

/**
 * The key this wiki types pages with: `@type` or `type`, whichever more of its
 * pages use (both compile the same, `graph.ts`), so a new page matches its
 * neighbours. A wiki with neither gets `@type`.
 */
export function typeKey(config: Config): "@type" | "type" {
  let at = 0;
  let bare = 0;
  for (const filePath of iterDocumentFiles(config)) {
    if (extname(filePath).toLowerCase() !== ".md") continue;
    const data = splitFrontmatterText(readText(filePath)).data;
    if (data === null) continue;
    if ("@type" in data) at++;
    else if ("type" in data) bare++;
  }
  return bare > at ? "type" : "@type";
}

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

/**
 * A new page of `type`: typed frontmatter with the shape's required fields
 * first (those the caller supplied), then the rest, then an H1.
 *
 * A required field the caller did not supply is left out, never filled with a
 * placeholder: the edit's validation then rejects the page and names the
 * missing field, which is the honest answer.
 */
export function scaffoldPage(options: {
  readonly path: string;
  readonly typeKey: "@type" | "type";
  readonly type: string | null;
  readonly required: readonly string[];
  readonly fields: ReadonlyArray<readonly [string, FieldValue]>;
  readonly body?: string | null;
}): string {
  const doc = parseDocument("");
  if (options.type !== null) doc.set(options.typeKey, options.type);
  const supplied = new Map(options.fields.map(([key, value]) => [key, value]));
  const ordered = [
    ...options.required.filter((key) => supplied.has(key)),
    ...options.fields.map(([key]) => key).filter((key) =>
      !options.required.includes(key)
    ),
  ];
  for (const key of ordered) {
    doc.set(key, valueNode(supplied.get(key)!, key));
  }
  const yaml = doc.contents === null ? "" : doc.toString({ lineWidth: 0 });
  const title = scaffoldTitle(options.fields) ??
    basename(options.path, extname(options.path)).replaceAll("_", " ");
  const body = options.body?.trim() ?? "";
  return `---\n${yaml}---\n\n# ${title}\n${body === "" ? "" : `\n${body}\n`}`;
}
