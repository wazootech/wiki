import { detectQueryForm, normalizeQueryFormat } from "../format.ts";
import type { Wiki } from "../wiki.ts";
import {
  ALLOWED_QUERY_FORMS,
  type QuerySparqlOptions,
  type QuerySparqlResult,
} from "./types.ts";

function stripSparqlPrelude(query: string): string {
  return query.replace(/^[ \t]*(?:#.*)?$/gm, "")
    .replace(/\bPREFIX\b\s+[^\n\r]+/gi, "")
    .replace(/\bBASE\b\s+[^\n\r]+/gi, "")
    .trimStart();
}

function isSparqlUpdate(query: string): boolean {
  return /^(INSERT|DELETE|LOAD|CLEAR|CREATE|DROP|COPY|MOVE|ADD|WITH)\b/i.test(
    stripSparqlPrelude(query),
  );
}

export async function querySparql(
  wiki: Wiki,
  query: string,
  options: QuerySparqlOptions = {},
): Promise<QuerySparqlResult> {
  if (typeof query !== "string") throw new TypeError("query must be a string");
  if (isSparqlUpdate(query)) {
    throw new Error("SPARQL Update is not supported by wiki mcp.");
  }
  const queryForm = detectQueryForm(query);
  if (!(ALLOWED_QUERY_FORMS as readonly string[]).includes(queryForm)) {
    throw new Error(`Unsupported SPARQL query form: ${queryForm}`);
  }
  const rawFormat = options.format?.trim() || "json";
  let format: ReturnType<typeof normalizeQueryFormat>;
  try {
    format = normalizeQueryFormat(rawFormat);
  } catch {
    throw new Error(`Unsupported query result format: ${options.format}`);
  }
  const result = await wiki.query(query, {
    format,
    noInference: !(options.inference ?? true),
    reload: options.reload ?? false,
    cache: options.cache ?? false,
  });
  return { format, query_form: queryForm, result };
}
