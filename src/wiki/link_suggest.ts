import type { Config } from "./config.ts";
import {
  MARKDOWN_LINK_FULL_REGEX,
  markdownBody,
  splitFrontmatterText,
  WIKILINK_FULL_REGEX,
} from "./document.ts";
import { formatInternalLink } from "./links.ts";
import type { Path } from "./fspath.ts";
import { documentDataFromPath, readTextTolerant } from "./parser.ts";
import { iterMarkdownFiles, routeForDocumentFile } from "./paths.ts";
import { parseHeadings } from "./headings.ts";
import type { LinkOpportunity } from "./schemas/domain.ts";

type Page = {
  readonly route: string;
  readonly title: string;
  readonly data: Record<string, unknown>;
};

type Span = readonly [number, number];

const FENCED_CODE_RE = /```[\s\S]*?```/g;
const INLINE_CODE_RE = /`[^`\n]+`/g;
const MIN_ALIAS_LENGTH = 4;

function compareCodePoints(left: string, right: string): number {
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

function caseFold(text: string): string {
  return text.toLowerCase().replaceAll("ß", "ss").replaceAll("ς", "σ");
}

function humanizeRoute(route: string): string {
  const stem = route ? route.split("/").at(-1) ?? "Index" : "Index";
  return stem.replaceAll("_", " ").replaceAll("-", " ").trim() || "Index";
}

function extractTitle(body: string, fallback: string): string {
  for (const heading of parseHeadings(body)) {
    if (heading.level === 1) return heading.text.trim();
  }
  return humanizeRoute(fallback);
}

function aliasesForPage(
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

function protectedSpans(text: string): Span[] {
  return mergedSpans([
    ...regexSpans(text, FENCED_CODE_RE),
    ...regexSpans(text, INLINE_CODE_RE),
    ...regexSpans(text, WIKILINK_FULL_REGEX),
    ...regexSpans(text, MARKDOWN_LINK_FULL_REGEX),
  ]);
}

function overlaps(start: number, end: number, spans: readonly Span[]): boolean {
  return spans.some(([spanStart, spanEnd]) =>
    start < spanEnd && end > spanStart
  );
}

function isWordCharacter(character: string | undefined): boolean {
  return character !== undefined && /[\p{L}\p{N}]/u.test(character);
}

function wordBoundariesOk(text: string, start: number, end: number): boolean {
  const before = start > 0
    ? Array.from(text.slice(0, start)).at(-1)
    : undefined;
  const after = end < text.length ? Array.from(text.slice(end))[0] : undefined;
  return !(
    isWordCharacter(before) || before === "_" || before === "-" ||
    isWordCharacter(after) || after === "_" || after === "-"
  );
}

function pythonLineColumn(text: string, utf16Index: number): [number, number] {
  const prefix = text.slice(0, utf16Index);
  const lineBreak = prefix.lastIndexOf("\n");
  const line = (prefix.match(/\n/g)?.length ?? 0) + 1;
  const currentLine = lineBreak < 0 ? prefix : prefix.slice(lineBreak + 1);
  return [line, Array.from(currentLine).length + 1];
}

export function findLinkOpportunities(
  config: Config,
  fileFilter: ReadonlySet<string> | null = null,
  minAliasLength = MIN_ALIAS_LENGTH,
): LinkOpportunity[] {
  const pages: Page[] = [];
  for (const filePath of iterMarkdownFiles(config)) {
    const route = routeForDocumentFile(config, filePath);
    if (fileFilter !== null && !fileFilter.has(route)) continue;
    const data = documentDataFromPath(filePath) ?? {};
    const body = markdownBody(readTextTolerant(filePath));
    const name = data.name;
    const title = typeof name === "string" && name.length > 0
      ? name
      : extractTitle(body, route);
    pages.push({ route, title, data });
  }

  const aliasEntries: { alias: string; route: string; title: string }[] = [];
  for (const page of pages) {
    for (
      const alias of aliasesForPage(
        page.route,
        page.title,
        page.data,
        minAliasLength,
      )
    ) {
      aliasEntries.push({ alias, route: page.route, title: page.title });
    }
  }
  aliasEntries.sort((left, right) =>
    Array.from(right.alias).length - Array.from(left.alias).length ||
    compareCodePoints(left.alias, right.alias)
  );
  if (aliasEntries.length === 0) return [];

  const pattern = new RegExp(
    aliasEntries.map(({ alias }) =>
      alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    ).join("|"),
    "giu",
  );
  const aliasRoutes = new Map<string, { route: string; title: string }>();
  for (const entry of aliasEntries) {
    aliasRoutes.set(caseFold(entry.alias), {
      route: entry.route,
      title: entry.title,
    });
  }

  const opportunities: LinkOpportunity[] = [];
  for (const filePath of iterMarkdownFiles(config)) {
    const sourceRoute = routeForDocumentFile(config, filePath);
    if (fileFilter !== null && !fileFilter.has(sourceRoute)) continue;
    const body = markdownBody(readTextTolerant(filePath));
    const protectedRanges = protectedSpans(body);
    const claimed: Span[] = [];

    for (const match of body.matchAll(pattern)) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      if (!wordBoundariesOk(body, start, end)) continue;
      if (
        overlaps(start, end, protectedRanges) || overlaps(start, end, claimed)
      ) continue;
      const target = aliasRoutes.get(caseFold(match[0]));
      if (target === undefined || target.route === sourceRoute) continue;
      const [line, column] = pythonLineColumn(body, start);
      opportunities.push({
        source_route: sourceRoute,
        source_file: filePath.name,
        line,
        column,
        matched_text: match[0],
        target_route: target.route,
        target_title: target.title,
      });
      claimed.push([start, end]);
    }
  }

  return opportunities.sort((left, right) =>
    compareCodePoints(left.source_route, right.source_route) ||
    left.line - right.line || left.column - right.column
  );
}

function codePointOffsetToUtf16(text: string, codePointOffset: number): number {
  return Array.from(text).slice(0, codePointOffset).join("").length;
}

function splitLinesKeepingEndings(text: string): string[] {
  return (text.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g) ?? []).filter((line) =>
    line.length > 0
  );
}

export function applyLinkOpportunities(
  config: Config,
  opportunities: readonly LinkOpportunity[],
  dryRun = false,
): Path[] {
  if (opportunities.length === 0) return [];
  const routePaths = new Map(
    iterMarkdownFiles(config).map((filePath) => [
      routeForDocumentFile(config, filePath),
      filePath,
    ]),
  );
  const byRoute = new Map<string, LinkOpportunity[]>();
  for (const opportunity of opportunities) {
    const items = byRoute.get(opportunity.source_route) ?? [];
    items.push(opportunity);
    byRoute.set(opportunity.source_route, items);
  }

  const changed: Path[] = [];
  for (const [route, routeOpportunities] of byRoute) {
    const filePath = routePaths.get(route);
    if (filePath === undefined) continue;
    const split = splitFrontmatterText(readTextTolerant(filePath));
    const lines = splitLinesKeepingEndings(split.body);
    routeOpportunities.sort((left, right) =>
      right.line - left.line || right.column - left.column
    );
    for (const opportunity of routeOpportunities) {
      const lineIndex = opportunity.line - 1;
      if (lineIndex < 0 || lineIndex >= lines.length) continue;
      const line = lines[lineIndex]!;
      const lineContent = line.replace(/[\r\n]+$/, "");
      const columnIndex = codePointOffsetToUtf16(
        lineContent,
        opportunity.column - 1,
      );
      if (
        lineContent.slice(
          columnIndex,
          columnIndex + opportunity.matched_text.length,
        ) !==
          opportunity.matched_text
      ) continue;
      const link = formatInternalLink(
        opportunity.target_route,
        opportunity.matched_text,
        config.link.style,
      );
      lines[lineIndex] = lineContent.slice(0, columnIndex) + link +
        lineContent.slice(columnIndex + opportunity.matched_text.length) +
        line.slice(lineContent.length);
    }
    if (!dryRun) filePath.writeText(split.prefix + lines.join(""));
    changed.push(filePath);
  }
  return changed;
}
