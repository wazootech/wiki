import { splitFrontmatterText } from "../document.ts";
import { findSections } from "../headings.ts";
import {
  EditOpError,
  frontmatterYaml,
  parseFrontmatter,
  type PatchMode,
  type PatchTarget,
  withLineEndings,
} from "./fields.ts";

/** Drop blank lines from both ends. */
function trimBlankLines(lines: readonly string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start]!.trim() === "") start++;
  while (end > start && lines[end - 1]!.trim() === "") end--;
  return lines.slice(start, end);
}

const LIST_ITEM_RE = /^\s*(?:([-*+])|\d{1,9}([.)]))\s/;

/**
 * The list a line's item belongs to, or `null` for a non-item: the bullet
 * character, or the ordered delimiter. CommonMark starts a new list when either
 * changes, so only lines of the same family continue one list.
 */
function listFamily(line: string | undefined): string | null {
  const match = line === undefined ? null : LIST_ITEM_RE.exec(line);
  if (match === null) return null;
  return match[1] ?? `ordered${match[2]}`;
}

/**
 * Join two blocks, one blank line apart, except where they meet as items of
 * the same list: a blank line there would turn a tight list loose (and split
 * the change log an agent appended to), so the items join directly.
 */
function joinBlocks(
  mode: PatchMode,
  existing: readonly string[],
  added: readonly string[],
): string[] {
  if (mode === "replace") return [...added];
  if (existing.length === 0) return [...added];
  if (added.length === 0) return [...existing];
  const [first, second] = mode === "append"
    ? [existing, added]
    : [added, existing];
  const family = listFamily(first.at(-1));
  const sameList = family !== null && family === listFamily(second[0]);
  return sameList ? [...first, ...second] : [...first, "", ...second];
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
