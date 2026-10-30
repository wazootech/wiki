import type { Config } from "./config.ts";
import { splitFrontmatterText } from "./document.ts";
import { formatInternalLink } from "./links.ts";
import { readTextTolerant } from "./parser.ts";
import { iterMarkdownFiles, routeForDocumentFile } from "./paths.ts";
import type { LinkOpportunity } from "./schemas/domain.ts";
import {
  codePointOffsetToUtf16,
  splitLinesKeepingEndings,
} from "./link_suggest/spans.ts";

export { findLinkOpportunities } from "./link_suggest/find.ts";

export function applyLinkOpportunities(
  config: Config,
  opportunities: readonly LinkOpportunity[],
  dryRun = false,
): string[] {
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

  const changed: string[] = [];
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
    if (!dryRun) {
      Deno.writeTextFileSync(filePath, split.prefix + lines.join(""));
    }
    changed.push(filePath);
  }
  return changed;
}
