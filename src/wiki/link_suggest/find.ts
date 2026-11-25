import { basename } from "@std/path";
import type { Config } from "../config.ts";
import { markdownBody } from "../document.ts";
import { documentDataFromPath, readTextTolerant } from "../parser.ts";
import { iterMarkdownFiles, routeForDocumentFile } from "../paths.ts";
import type { LinkOpportunity } from "../schemas/domain.ts";
import {
  aliasesForPage,
  caseFold,
  compareCodePoints,
  extractTitle,
  MIN_ALIAS_LENGTH,
  type Page,
  type Span,
} from "./text.ts";
import {
  lineColumn,
  overlaps,
  protectedSpans,
  wordBoundariesOk,
} from "./spans.ts";

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
      const [line, column] = lineColumn(body, start);
      opportunities.push({
        source_route: sourceRoute,
        source_file: basename(filePath),
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
