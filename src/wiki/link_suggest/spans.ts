import { MARKDOWN_LINK_FULL_REGEX, WIKILINK_FULL_REGEX } from "../document.ts";
import { FENCED_CODE_RE, INLINE_CODE_RE, type Span } from "./text.ts";

function regexSpans(text: string, expression: RegExp): Span[] {
  const regex = new RegExp(
    expression.source,
    expression.flags.includes("g") ? expression.flags : `${expression.flags}g`,
  );
  return [...text.matchAll(regex)].map((match) => {
    const start = match.index ?? 0;
    return [start, start + match[0].length];
  });
}

function mergedSpans(spans: readonly Span[]): Span[] {
  const ordered = [...spans].sort((left, right) =>
    left[0] - right[0] || left[1] - right[1]
  );
  const merged: [number, number][] = [];
  for (const [start, end] of ordered) {
    const last = merged.at(-1);
    if (last !== undefined && start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
}

export function protectedSpans(text: string): Span[] {
  return mergedSpans([
    ...regexSpans(text, FENCED_CODE_RE),
    ...regexSpans(text, INLINE_CODE_RE),
    ...regexSpans(text, WIKILINK_FULL_REGEX),
    ...regexSpans(text, MARKDOWN_LINK_FULL_REGEX),
  ]);
}

export function overlaps(
  start: number,
  end: number,
  spans: readonly Span[],
): boolean {
  return spans.some(([spanStart, spanEnd]) =>
    start < spanEnd && end > spanStart
  );
}

function isWordCharacter(character: string | undefined): boolean {
  return character !== undefined && /[\p{L}\p{N}]/u.test(character);
}

export function wordBoundariesOk(
  text: string,
  start: number,
  end: number,
): boolean {
  const before = start > 0
    ? Array.from(text.slice(0, start)).at(-1)
    : undefined;
  const after = end < text.length ? Array.from(text.slice(end))[0] : undefined;
  return !(
    isWordCharacter(before) || before === "_" || before === "-" ||
    isWordCharacter(after) || after === "_" || after === "-"
  );
}

export function lineColumn(text: string, utf16Index: number): [number, number] {
  const prefix = text.slice(0, utf16Index);
  const lineBreak = prefix.lastIndexOf("\n");
  const line = (prefix.match(/\n/g)?.length ?? 0) + 1;
  const currentLine = lineBreak < 0 ? prefix : prefix.slice(lineBreak + 1);
  return [line, Array.from(currentLine).length + 1];
}

export function codePointOffsetToUtf16(
  text: string,
  codePointOffset: number,
): number {
  return Array.from(text).slice(0, codePointOffset).join("").length;
}

export function splitLinesKeepingEndings(text: string): string[] {
  return (text.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g) ?? []).filter((line) =>
    line.length > 0
  );
}
