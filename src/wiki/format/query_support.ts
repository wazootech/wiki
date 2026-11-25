import { MemoryStore } from "@wazoo/sparql-engine";
import { factory, type RdfDataset, type RdfGraph } from "../rdf.ts";

export const QUERY_FORMATS = [
  "table",
  "json",
  "csv",
  "tsv",
  "turtle",
  "n3",
  "nt",
  "markdown",
] as const;

export type QueryFormat = typeof QUERY_FORMATS[number];

const FORMAT_ALIASES: Readonly<Record<string, QueryFormat>> = {
  "application/json": "json",
  "application/sparql-results+json": "json",
  "text/csv": "csv",
  "text/tab-separated-values": "tsv",
  "text/turtle": "turtle",
  "application/x-turtle": "turtle",
  "text/n3": "n3",
  ttl: "turtle",
  tt: "turtle",
  md: "markdown",
};

export function normalizeQueryFormat(format: string): QueryFormat {
  const normalized = format.toLowerCase();
  const canonical = FORMAT_ALIASES[normalized] ?? normalized;
  if ((QUERY_FORMATS as readonly string[]).includes(canonical)) {
    return canonical as QueryFormat;
  }
  throw new Error(
    `Invalid value for '-f' / '--format': '${format}'. Choose from ${
      QUERY_FORMATS.join(", ")
    }.`,
  );
}

function isQueryDataset(graph: RdfGraph | RdfDataset): graph is RdfDataset {
  return graph instanceof Object && "defaultUnion" in graph;
}

export function createQueryStore(graph: RdfGraph | RdfDataset): MemoryStore {
  const quads = [...graph];
  if (isQueryDataset(graph) && graph.defaultUnion) {
    for (const quad of [...quads]) {
      if (quad.graph.termType !== "DefaultGraph") {
        quads.push(factory.quad(quad.subject, quad.predicate, quad.object));
      }
    }
  }
  return new MemoryStore(quads);
}

function stripSparqlPrelude(query: string): string {
  return query.replace(/^[ \t]*(?:#.*)?$/gm, "")
    .replace(/\bPREFIX\b\s+[^\n\r]+/gi, "")
    .replace(/\bBASE\b\s+[^\n\r]+/gi, "")
    .trimStart();
}

export function isSparqlUpdate(query: string): boolean {
  return /^(?:INSERT|DELETE|LOAD|CLEAR|CREATE|DROP|COPY|MOVE|ADD|WITH)\b/i
    .test(stripSparqlPrelude(query));
}

export function detectQueryForm(query: string): string {
  const text = stripSparqlPrelude(query);
  const match = /\b(SELECT|ASK|CONSTRUCT|DESCRIBE)\b/i.exec(text);
  if (match === null) throw new Error("Could not determine SPARQL query form.");
  return match[1]!.toUpperCase();
}
