import { parseHeadings } from "../headings.ts";

export type Page = {
  readonly route: string;
  readonly title: string;
  readonly data: Record<string, unknown>;
};

export type Span = readonly [number, number];

export const FENCED_CODE_RE = /(```|~~~)[\s\S]*?\1/g;
export const INLINE_CODE_RE = /`[^`\n]+`/g;
export const MIN_ALIAS_LENGTH = 4;

export function compareCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0)!);
  const rightPoints = Array.from(
    right,
    (character) => character.codePointAt(0)!,
  );
  const sharedLength = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const difference = leftPoints[index]! - rightPoints[index]!;
    if (difference !== 0) return difference;
  }
  return leftPoints.length - rightPoints.length;
}

export function caseFold(text: string): string {
  return text.toLowerCase().replaceAll("ß", "ss").replaceAll("ς", "σ");
}

function humanizeRoute(route: string): string {
  const stem = route ? route.split("/").at(-1) ?? "Index" : "Index";
  return stem.replaceAll("_", " ").replaceAll("-", " ").trim() || "Index";
}

export function extractTitle(body: string, fallback: string): string {
  for (const heading of parseHeadings(body)) {
    if (heading.level === 1) return heading.text.trim();
  }
  return humanizeRoute(fallback);
}

export function aliasesForPage(
  route: string,
  title: string,
  data: Record<string, unknown>,
  minAliasLength: number,
): string[] {
  const aliases = new Set<string>();
  for (const candidate of [title, humanizeRoute(route)]) {
    const text = candidate.trim();
    if (isLinkableAlias(text, route, minAliasLength)) aliases.add(text);
  }
  const name = data.name;
  if (typeof name === "string") {
    const text = name.trim();
    if (isLinkableAlias(text, route, minAliasLength)) aliases.add(text);
  }
  return [...aliases].sort((left, right) =>
    Array.from(right).length - Array.from(left).length ||
    compareCodePoints(left, right)
  );
}

function isLinkableAlias(
  text: string,
  route: string,
  minAliasLength: number,
): boolean {
  if (Array.from(text).length < minAliasLength) return false;
  if (text.includes(" ")) return true;
  const stem = route.split("/").at(-1) ?? "";
  if (stem.includes("_") && caseFold(humanizeRoute(route)) === caseFold(text)) {
    return true;
  }
  return Array.from(text).length >= 8;
}
