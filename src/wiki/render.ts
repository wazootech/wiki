import { relativeWithin } from "./fspath.ts";
import { errorText } from "./errors.ts";
import { basename } from "@std/path";
import type { RdfDataset, RdfGraph } from "./rdf.ts";
import { readTextTolerant } from "./parser.ts";
import { iterMarkdownFiles, selectMarkdownPaths } from "./paths.ts";
import { runQuery } from "./format.ts";
import type { Config } from "./config.ts";
import type { RenderReport } from "./schemas/reports.ts";
import {
  blockRegex,
  group,
  hasSparqlBlocks,
  replaceSparqlTable,
  sparqlTableMatches,
} from "./render/sparql_blocks.ts";

export { stripSparqlWrappersForHtml } from "./render/sparql_blocks.ts";

function relativePath(path: string): string {
  try {
    return (relativeWithin(path, Deno.cwd())).replaceAll("\\", "/");
  } catch {
    return path;
  }
}

export interface RenderMarkdownOptions {
  readonly queryGraph: (query: string) => Promise<RdfGraph | RdfDataset>;
  readonly baseIri: string;
  readonly knownSlugs: ReadonlySet<string>;
  readonly dryRun?: boolean;
  readonly explicitFiles?: readonly string[];
}

export async function renderMarkdownFiles(
  config: Config,
  options: RenderMarkdownOptions,
): Promise<RenderReport> {
  const explicitFiles = options.explicitFiles ?? [];
  const candidates = explicitFiles.length > 0
    ? selectMarkdownPaths(config, explicitFiles)
    : iterMarkdownFiles(config);
  const markdownFiles = candidates.filter(hasSparqlBlocks);
  const staleFiles: string[] = [];
  const renderErrors: string[] = [];
  let updatedCount = 0;
  let errorCount = 0;

  for (const file of markdownFiles) {
    const content = readTextTolerant(file);
    const matches = [...content.matchAll(blockRegex())];
    const parts: string[] = [];
    let cursor = 0;
    let modified = false;
    for (const match of matches) {
      const index = match.index;
      if (index === undefined) continue;
      parts.push(content.slice(cursor, index));
      const query = group(match, "query").trim();
      try {
        const graph = await options.queryGraph(query);
        const renderedMarkdown = await runQuery(graph, query, {
          format: "markdown",
          baseIri: options.baseIri,
          knownSlugs: options.knownSlugs,
        });
        if (sparqlTableMatches(group(match, "table"), renderedMarkdown)) {
          parts.push(match[0]);
        } else {
          modified = true;
          parts.push(replaceSparqlTable(match, renderedMarkdown));
        }
      } catch (error) {
        renderErrors.push(
          `Error rendering query in ${basename(file)}: ${errorText(error)}`,
        );
        errorCount += 1;
        parts.push(match[0]);
      }
      cursor = index + match[0].length;
    }
    if (matches.length === 0) continue;
    parts.push(content.slice(cursor));
    const newContent = parts.join("");
    if (!modified || newContent === content) continue;
    staleFiles.push(relativePath(file));
    if (!options.dryRun) {
      await Deno.writeTextFile(file, newContent);
      updatedCount += 1;
    }
  }

  return {
    ok: options.dryRun ? staleFiles.length === 0 : errorCount === 0,
    updated_count: updatedCount,
    error_count: errorCount,
    stale_files: staleFiles,
    render_errors: renderErrors,
  };
}
