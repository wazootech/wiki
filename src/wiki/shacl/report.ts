import type { Term } from "@rdfjs/types";
import { ntTerm } from "../rdf.ts";

export function stableTermValue(term: Term | undefined): string | null {
  if (term === undefined || term.termType === "BlankNode") return null;
  return term.value;
}

/** The subset of a validation result this module reports. */
export interface ReportableResult {
  readonly term: Term;
  readonly focusNode?: Term;
  readonly path?: Term;
  readonly severity?: Term;
  readonly sourceConstraintComponent?: Term;
  readonly sourceShape?: Term;
  readonly message?: readonly Term[];
  readonly value?: Term | null;
}

/**
 * Render a validation report the way `pyshacl` lays one out.
 *
 * The skeleton is pyshacl's `report.as_text()` line for line — header,
 * `Conforms:`, `Results (n):`, and one block per result with the same labels and
 * tab indentation — and terms are rendered as N-Triples rather than with
 * `rdflib`'s `__str__`. Only lines that have a value are printed, which is what
 * pyshacl does for a result with no result path.
 */
export function formatReport(
  conforms: boolean,
  results: readonly ReportableResult[],
): string {
  const lines = [
    "Validation Report",
    `Conforms: ${conforms ? "True" : "False"}`,
  ];
  if (!conforms) {
    lines.push(`Results (${results.length}):`);
    for (const result of results) lines.push(...formatResult(result));
  }
  return `${lines.join("\n")}\n`;
}

function formatResult(result: ReportableResult): string[] {
  const component = result.sourceConstraintComponent;
  const componentIri = component?.value ?? "";
  const localName = componentIri.split("#").pop() ?? componentIri;
  const lines = [
    `Constraint Violation in ${localName} (${componentIri}):`,
    `\tSeverity: ${termText(result.severity)}`,
  ];
  if (result.sourceShape) {
    lines.push(`\tSource Shape: ${ntTerm(result.sourceShape)}`);
  }
  lines.push(`\tFocus Node: ${termText(result.focusNode)}`);
  if (result.path) lines.push(`\tResult Path: ${ntTerm(result.path)}`);
  const messages = (result.message ?? []).map((term) => term.value);
  lines.push(`\tMessage: ${messages.join(" ")}`);
  return lines;
}

function termText(term: Term | undefined): string {
  // pyshacl prints a missing severity/path as an empty string rather than
  // omitting the label, so the label always survives a diff.
  return term === undefined ? "" : ntTerm(term);
}
