import {
  MemoryStore,
  serializeJsonResults,
  type SparqlResponse,
  type SparqlSelectResults,
  type SparqlValue,
  WazooSparqlEngine,
} from "@wazoo/sparql-engine";
import {
  factory,
  type RdfDataset,
  type RdfGraph,
  serializeRdf,
} from "./rdf.ts";

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

function scalar(value: SparqlValue | undefined): string {
  if (value === undefined) return "";
  if (value.type !== "triple") return value.value;
  return `<< ${scalar(value.value.subject as SparqlValue)} ${
    scalar(value.value.predicate as SparqlValue)
  } ${scalar(value.value.object as SparqlValue)} >>`;
}

function csvValue(value: SparqlValue | undefined): string {
  return value?.type === "bnode" ? `_:${value.value}` : scalar(value);
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function formatCsv(result: SparqlSelectResults): string {
  const rows = [
    result.head.vars,
    ...result.results.bindings.map((binding) =>
      result.head.vars.map((name) => csvValue(binding[name]))
    ),
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

function formatTsv(result: SparqlSelectResults): string {
  if (result.results.bindings.length === 0) return "(no results)";
  const rows = [
    result.head.vars,
    ...result.results.bindings.map((binding) =>
      result.head.vars.map((name) => scalar(binding[name]))
    ),
  ];
  return rows.map((row) => row.join("\t")).join("\n");
}

function formatTable(result: SparqlSelectResults): string {
  const { vars } = result.head;
  const rows = result.results.bindings;
  if (rows.length === 0) return "(no results)";
  if (vars.length === 0) return "(empty query)";
  const values = rows.map((row) => vars.map((name) => scalar(row[name])));
  const widths = vars.map((name, index) =>
    Math.max(name.length, ...values.map((row) => row[index]?.length ?? 0))
  );
  const header = vars.map((name, index) => name.padEnd(widths[index]!)).join(
    " | ",
  );
  const divider = widths.map((width) => "-".repeat(width)).join("-+-");
  return [
    header,
    divider,
    ...values.map((row) =>
      vars.map((_, index) => (row[index] ?? "").padEnd(widths[index]!)).join(
        " | ",
      )
    ),
  ].join("\n");
}

function formatPrettyTable(result: SparqlSelectResults): string {
  if (result.results.bindings.length === 0) return "(no results)";
  const vars = result.head.vars;
  if (vars.length === 0) return "(empty query)";
  const values = result.results.bindings.map((row) =>
    vars.map((name) => scalar(row[name]))
  );
  const widths = vars.map((name, index) =>
    Math.max(name.length, ...values.map((row) => row[index]?.length ?? 0))
  );
  const edge = `+${widths.map((width) => "-".repeat(width + 2)).join("+")}+`;
  const line = (cells: readonly string[]) =>
    `|${
      cells.map((cell, index) => ` ${cell.padEnd(widths[index]!)} `).join("|")
    }|`;
  return [edge, line(vars), edge, ...values.map(line), edge].join("\n");
}

function wikiLink(
  value: string,
  baseIri: string,
  knownSlugs?: ReadonlySet<string>,
): string {
  if (!baseIri || !value.startsWith(baseIri)) return value;
  let slug = value.slice(baseIri.length);
  if (slug.endsWith(".md")) slug = slug.slice(0, -3);
  if (slug.includes("/") || (knownSlugs && !knownSlugs.has(slug))) return value;
  return `[${slug}](${slug}.md)`;
}

function formatMarkdown(
  result: SparqlSelectResults,
  baseIri: string,
  knownSlugs?: ReadonlySet<string>,
): string {
  const vars = result.head.vars;
  const rows = result.results.bindings;
  if (rows.length === 0) return "(no results)";
  if (vars.length === 0) return "(empty query)";
  const lines = [
    `| ${vars.join(" | ")} |`,
    `| ${vars.map(() => "---").join(" | ")} |`,
  ];
  for (const row of rows) {
    lines.push(
      `| ${
        vars.map((name) => wikiLink(scalar(row[name]), baseIri, knownSlugs))
          .join(" | ")
      } |`,
    );
  }
  return lines.join("\n");
}

function formatJson(response: SparqlResponse): string {
  return serializeJsonResults(response);
}

function isQueryDataset(graph: RdfGraph | RdfDataset): graph is RdfDataset {
  return graph instanceof Object && "defaultUnion" in graph;
}

function createQueryStore(graph: RdfGraph | RdfDataset): MemoryStore {
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
