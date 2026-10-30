import { readTextTolerant } from "../parser.ts";

const SPARQL_BLOCK_REGEX =
  /(?<start><!--\s*sparql:start(?:\s*-->)?)(?<prefix>\s*)(?<fence>```sparql\s*(?<query>.*?)\s*```)(?<mid>\s*)(?:(?<comment_end>-->)(?<post_comment>\s*))?(?<table>.*?)(?<suffix>\s*)(?<end><!--\s*sparql:end\s*-->)/gis;

export function blockRegex(): RegExp {
  return new RegExp(SPARQL_BLOCK_REGEX.source, SPARQL_BLOCK_REGEX.flags);
}

export function stripSparqlWrappersForHtml(markdown: string): string {
  return markdown.replace(blockRegex(), (match) => {
    const groups = blockRegex().exec(match)?.groups;
    if (groups === undefined) return match;
    const table = (groups.table ?? "").trim();
    return groups.comment_end !== undefined
      ? `${table}\n`
      : `${groups.fence ?? ""}\n\n${table}\n`;
  });
}

export function hasSparqlBlocks(path: string): boolean {
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

export function sparqlTableMatches(
  existing: string,
  rendered: string,
): boolean {
  return normalizeMarkdownTable(existing) === normalizeMarkdownTable(rendered);
}

export function group(match: RegExpMatchArray, name: string): string {
  return match.groups?.[name] ?? "";
}

export function replaceSparqlTable(
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
