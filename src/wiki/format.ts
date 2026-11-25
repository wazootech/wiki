import { WazooSparqlEngine } from "@wazoo/sparql-engine";
import { type RdfDataset, type RdfGraph, serializeRdf } from "./rdf.ts";
import {
  createQueryStore,
  detectQueryForm,
  isSparqlUpdate,
  normalizeQueryFormat,
} from "./format/query_support.ts";
import {
  formatCsv,
  formatJson,
  formatMarkdown,
  formatPrettyTable,
  formatTable,
  formatTsv,
} from "./format/tables.ts";

export {
  detectQueryForm,
  isSparqlUpdate,
  normalizeQueryFormat,
  QUERY_FORMATS,
  type QueryFormat,
} from "./format/query_support.ts";

export async function runQuery(
  graph: RdfGraph | RdfDataset,
  query: string,
  options: {
    format?: string;
    baseIri?: string;
    knownSlugs?: ReadonlySet<string>;
    pretty?: boolean;
  } = {},
): Promise<string> {
  const format = normalizeQueryFormat(options.format ?? "table");
  if (isSparqlUpdate(query)) {
    throw new Error("SPARQL updates are not supported by wiki query.");
  }
  const queryForm = detectQueryForm(query);
  if (options.pretty && queryForm !== "SELECT") {
    throw new Error(
      "--pretty only supports SELECT queries (not CONSTRUCT or DESCRIBE).",
    );
  }
  const response = await new WazooSparqlEngine({
    store: createQueryStore(graph),
  }).execute({
    query,
    ...(options.baseIri === undefined ? {} : { baseIri: options.baseIri }),
  });
  if (response.kind === "construct") {
    const rdfFormat = format === "n3"
      ? "n3"
      : format === "nt"
      ? "nt"
      : "turtle";
    return await serializeRdf(response.data.quads, rdfFormat, {
      prefixes: graph.bindings,
    });
  }
  if (response.kind === "void") {
    throw new Error("SPARQL updates are not supported by wiki query.");
  }
  if (format === "nt") {
    throw new Error(
      "The 'nt' format only supports CONSTRUCT and DESCRIBE queries.",
    );
  }
  if (format === "json") return formatJson(response);
  if (response.kind === "ask") return response.data.boolean ? "true" : "false";
  if (format === "csv") return formatCsv(response.data);
  if (format === "tsv") return formatTsv(response.data);
  if (format === "markdown") {
    return formatMarkdown(
      response.data,
      options.baseIri ?? "",
      options.knownSlugs,
    );
  }
  return options.pretty
    ? formatPrettyTable(response.data)
    : formatTable(response.data);
}
