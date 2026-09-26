import type { RdfDataset, RdfGraph } from "./rdf.ts";
import { readTextTolerant } from "./parser.ts";
import { iterMarkdownFiles, selectMarkdownPaths } from "./paths.ts";
import type { Path } from "./fspath.ts";
import { runQuery } from "./format.ts";
import type { Config } from "./config.ts";
import type { RenderReport } from "./schemas/reports.ts";

const SPARQL_BLOCK_REGEX =
  /(?<start><!--\s*sparql:start(?:\s*-->)?)(?<prefix>\s*)(?<fence>```sparql\s*(?<query>.*?)\s*```)(?<mid>\s*)(?:(?<comment_end>-->)(?<post_comment>\s*))?(?<table>.*?)(?<suffix>\s*)(?<end><!--\s*sparql:end\s*-->)/gis;

function blockRegex(): RegExp {
  return new RegExp(SPARQL_BLOCK_REGEX.source, SPARQL_BLOCK_REGEX.flags);
}

function hasSparqlBlocks(path: Path): boolean {
  try {
    return blockRegex().test(readTextTolerant(path));
  } catch {
    return false;
  }
}

function normalizeMarkdownTable(text: string): string {
  const lines = text.trim().split(/\r?\n/).map((line) => line.trim()).filter(
    Boolean,
  );
  const normalized: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (!line.startsWith("|")) {
      normalized.push(line);
      continue;
    }
    const cells = line.replace(/^\|+/, "").replace(/\|+$/, "").split("|").map((
      cell,
    ) => cell.trim());
    if (index === 0) {
      normalized.push(
        "| " + cells.map((cell) => cell.toLowerCase()).join(" | ") + " |",
      );
    } else if (cells.length > 0 && cells.every((cell) => /^-+$/.test(cell))) {
      normalized.push("| " + cells.map(() => "---").join(" | ") + " |");
    } else {
      normalized.push("| " + cells.join(" | ") + " |");
    }
  }
  return normalized.join("\n");
}

function sparqlTableMatches(existing: string, rendered: string): boolean {
  return normalizeMarkdownTable(existing) === normalizeMarkdownTable(rendered);
}

function group(match: RegExpMatchArray, name: string): string {
  return match.groups?.[name] ?? "";
}

function replaceSparqlTable(
  match: RegExpMatchArray,
  renderedMarkdown: string,
): string {
  const suffix = group(match, "suffix") || "\n";
  return `${group(match, "start")}${group(match, "prefix")}${
    group(match, "fence")
  }${group(match, "mid")}${group(match, "comment_end")}${
    group(match, "post_comment")
  }${renderedMarkdown}${suffix}${group(match, "end")}`;
}

function relativePath(path: Path): string {
  try {
    return path.relativeTo(Deno.cwd()).asPosix();
  } catch {
    return path.toString();
  }
}

export interface RenderMarkdownOptions {
  readonly queryGraph: (query: string) => Promise<RdfGraph | RdfDataset>;
  readonly baseIri: string;
  readonly knownSlugs: ReadonlySet<string>;
  readonly dryRun?: boolean;
  readonly explicitFiles?: readonly Path[];
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
          `Error rendering query in ${file.name}: ${
            error instanceof Error ? error.message : String(error)
          }`,
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
      await Deno.writeTextFile(file.toString(), newContent);
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
