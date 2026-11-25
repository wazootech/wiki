import { type Node, parseDocument } from "yaml";
import { splitFrontmatterText } from "../document.ts";
import { ValueError } from "../errors.ts";

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
export function withLineEndings(
  content: string,
  transform: (lf: string) => string,
): string {
  const crlf = content.includes("\r\n");
  const out = transform(crlf ? content.replaceAll("\r\n", "\n") : content);
  return crlf ? out.replaceAll("\n", "\r\n") : out;
}

/** The YAML node a value becomes, parsed once so a bad value fails early. */
export function valueNode(value: FieldValue, field: string): Node | unknown {
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
export function frontmatterYaml(
  content: string,
): { yaml: string; body: string } | null {
  const split = splitFrontmatterText(content);
  if (split.prefix === "") return null;
  // The prefix is `---<middle>---`; `<middle>` starts with the newline that
  // ends the opening fence, which is not part of the YAML.
  const middle = split.prefix.slice(3, -3);
  return { yaml: middle.replace(/^\n/, ""), body: split.body };
}

export function parseFrontmatter(yaml: string, path: string) {
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
