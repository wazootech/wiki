import { isMap, isScalar, parseDocument } from "yaml";
import { splitFrontmatterText } from "../document.ts";
import type { KeyRemoval, SkippedKey } from "./types.ts";

/**
 * Remove top-level frontmatter entries from a page's text, byte for byte.
 *
 * Each entry's lines are cut from the start of its key's line through the end
 * of its value's line, including that line's own terminator and any trailing
 * `# comment` on it. Nothing else changes; an entry that cannot be cut that
 * way is reported in `skipped` and left alone.
 */
export function removeFrontmatterKeys(
  content: string,
  keys: readonly string[],
): KeyRemoval {
  const skipAll = (reason: string): KeyRemoval => ({
    content,
    removed: [],
    skipped: keys.map((key) => ({ key, reason })),
  });
  const bom = content.startsWith("﻿") ? 1 : 0;
  const split = splitFrontmatterText(content.slice(bom));
  if (split.prefix === "") return skipAll("the page has no frontmatter");
  // The prefix is `---<yaml>---`: offsets below are into `<yaml>`, which
  // starts three characters after the BOM.
  const yaml = split.prefix.slice(3, -3);
  const offset = bom + 3;
  const doc = parseDocument(yaml);
  if (doc.errors.length > 0) return skipAll("the frontmatter does not parse");
  if (!isMap(doc.contents) || doc.contents.flow) {
    return skipAll("the frontmatter is not a block mapping");
  }
  const pairs = doc.contents.items;

  const cuts: Array<{ key: string; start: number; end: number }> = [];
  const skipped: SkippedKey[] = [];
  for (const key of keys) {
    const matches = pairs.filter((pair) =>
      isScalar(pair.key) && pair.key.value === key
    );
    if (matches.length !== 1) {
      skipped.push({
        key,
        reason: matches.length === 0
          ? "no top-level entry has that key"
          : "the key is written more than once",
      });
      continue;
    }
    const pair = matches[0]!;
    const keyNode = pair.key as { range?: [number, number, number] };
    const value = pair.value as
      | { range?: [number, number, number]; anchor?: string }
      | null;
    if (!keyNode.range || !value?.range) {
      skipped.push({ key, reason: "the entry has no value" });
      continue;
    }
    if (value.anchor) {
      skipped.push({
        key,
        reason: `the value carries anchor &${value.anchor}`,
      });
      continue;
    }
    const lineStart = yaml.lastIndexOf("\n", keyNode.range[0] - 1) + 1;
    if (yaml.slice(lineStart, keyNode.range[0]).trim() !== "") {
      skipped.push({ key, reason: "the key does not start its line" });
      continue;
    }
    let end = value.range[1];
    if (yaml[end - 1] !== "\n") {
      // A plain or quoted scalar stops before its line ends: keep going
      // through a trailing comment and the line terminator, and refuse when
      // anything else follows on that line.
      const newline = yaml.indexOf("\n", end);
      const tail = yaml.slice(end, newline < 0 ? yaml.length : newline);
      const rest = tail.trim();
      if (rest !== "" && !rest.startsWith("#")) {
        skipped.push({ key, reason: "another value shares its line" });
        continue;
      }
      end = newline < 0 ? yaml.length : newline + 1;
    }
    cuts.push({ key, start: lineStart, end });
  }

  cuts.sort((left, right) => right.start - left.start);
  let next = yaml;
  for (const cut of cuts) next = next.slice(0, cut.start) + next.slice(cut.end);
  return {
    content: content.slice(0, offset) + next +
      content.slice(offset + yaml.length),
    removed: keys.filter((key) => cuts.some((cut) => cut.key === key)),
    skipped,
  };
}
