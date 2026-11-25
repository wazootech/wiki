import {
  serializeJsonResults,
  type SparqlResponse,
  type SparqlSelectResults,
  type SparqlValue,
} from "@wazoo/sparql-engine";

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

export function formatCsv(result: SparqlSelectResults): string {
  const rows = [
    result.head.vars,
    ...result.results.bindings.map((binding) =>
      result.head.vars.map((name) => csvValue(binding[name]))
    ),
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function formatTsv(result: SparqlSelectResults): string {
  if (result.results.bindings.length === 0) return "(no results)";
  const rows = [
    result.head.vars,
    ...result.results.bindings.map((binding) =>
      result.head.vars.map((name) => scalar(binding[name]))
    ),
  ];
  return rows.map((row) => row.join("\t")).join("\n");
}

export function formatTable(result: SparqlSelectResults): string {
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

export function formatPrettyTable(result: SparqlSelectResults): string {
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

export function formatMarkdown(
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

export function formatJson(response: SparqlResponse): string {
  return serializeJsonResults(response);
}
