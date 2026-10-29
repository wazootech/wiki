import { errorText } from "../errors.ts";
import type { Wiki } from "../wiki.ts";
import { EXIT_FAILURE, EXIT_OK, usageError } from "./usage.ts";
import type { ParsedReadCommand } from "./read_args.ts";

/** Render a frontmatter value on one line: strings bare, the rest as JSON. */
function fieldText(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

export async function runShowCommand(
  wiki: Wiki,
  parsed: ParsedReadCommand,
): Promise<number> {
  const { EditUsageError } = await import("../edit.ts");
  let report;
  try {
    report = await wiki.show(parsed.path);
  } catch (error) {
    if (error instanceof EditUsageError) {
      return usageError(`Error: ${error.message}`);
    }
    console.error(`Error: ${errorText(error)}`);
    return EXIT_FAILURE;
  }

  if (parsed.field !== null) {
    // A field the frontmatter sets wins; otherwise a derived value
    // (`schema:headline`, ...) answers, as it does in the graph.
    const fields: Record<string, unknown> = {
      ...report.derived,
      ...(report.frontmatter ?? {}),
    };
    if (!Object.hasOwn(fields, parsed.field)) {
      console.error(`Error: ${report.path} has no field '${parsed.field}'.`);
      return EXIT_FAILURE;
    }
    const value = fields[parsed.field];
    console.log(
      parsed.format === "json"
        ? JSON.stringify(value, null, 2)
        : fieldText(value),
    );
    return EXIT_OK;
  }

  if (parsed.format === "json") {
    console.log(JSON.stringify(report, null, 2));
    return EXIT_OK;
  }
  const lines = [`${report.path} (${report.route})`, `hash: ${report.hash}`];
  if (report.frontmatter !== null) {
    lines.push("frontmatter:");
    for (const [key, value] of Object.entries(report.frontmatter)) {
      lines.push(`  ${key}: ${fieldText(value)}`);
    }
  }
  const derived = Object.entries(report.derived);
  if (derived.length > 0) {
    lines.push("derived:");
    for (const [key, value] of derived) {
      const from = key.endsWith("headline") ? "H1" : report.dateSource;
      lines.push(`  ${key}: ${value} (from ${from})`);
    }
  }
  if (report.headings.length > 0) {
    lines.push("headings:");
    for (const heading of report.headings) {
      lines.push(
        `  ${"#".repeat(heading.level)} ${heading.text} (line ${heading.line})`,
      );
    }
  }
  if (report.links.length > 0) {
    lines.push("links:");
    for (const link of report.links) lines.push(`  ${link.path ?? link.route}`);
  }
  console.log(lines.join("\n"));
  return EXIT_OK;
}

export async function runRefsCommand(
  wiki: Wiki,
  parsed: ParsedReadCommand,
): Promise<number> {
  const { EditUsageError } = await import("../edit.ts");
  let report;
  try {
    report = wiki.refs(parsed.path);
  } catch (error) {
    if (error instanceof EditUsageError) {
      return usageError(`Error: ${error.message}`);
    }
    console.error(`Error: ${errorText(error)}`);
    return EXIT_FAILURE;
  }
  if (parsed.format === "json") {
    console.log(JSON.stringify(report, null, 2));
    return EXIT_OK;
  }
  const lines = [`${report.path} (${report.route})`];
  lines.push(`inbound (${report.inbound.length}):`);
  for (const ref of report.inbound) lines.push(`  ${ref.path ?? ref.route}`);
  lines.push(`outbound (${report.outbound.length}):`);
  for (const ref of report.outbound) lines.push(`  ${ref.path ?? ref.route}`);
  console.log(lines.join("\n"));
  return EXIT_OK;
}
