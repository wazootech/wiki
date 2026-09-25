/**
 * SHACL validation over `rdf-validate-shacl`.
 *
 * There is no Python module for this file: `audit.py` calls `pyshacl` inline,
 * and the ADR swaps that library for `rdf-validate-shacl`. Three things the
 * phase-3b probe settled are encoded here, and one of them is a *correction*
 * the port had to make to the probe's own conclusion.
 *
 * 1. **No RDFS closure pass.** `pyshacl.validate(..., inference="rdfs")` closes
 *    the data graph first, and #273's plan assumed the port would have to as
 *    well. The probe measured it: `rdf-validate-shacl` already applies subclass
 *    semantics when it resolves `sh:targetClass`, and its findings match the
 *    oracle with or without a closure. A hand-rolled closure that is wrong in
 *    one direction silences real violations, so leaving it out is the safer
 *    half of a coin flip the probe already resolved.
 * 2. **The report text cannot match `pyshacl`'s, and that is accepted.** The
 *    oracle's text is `rdflib`'s rendering — `owl:sameAs <self>`,
 *    `Literal("1", datatype=xsd:integer)`, expanded blank-node descriptions.
 *    {@link formatReport} therefore reproduces pyshacl's *skeleton* (same
 *    header, same labels, same tab indentation, same line suppression) and
 *    renders terms as N-Triples instead, so a diff between the two is confined
 *    to term syntax. The parity harness treats `check` as a `known` case.
 * 3. **Read the results through the accessors — the probe was wrong about
 *    this.** Its FINDING 4 concluded that `sh:resultPath` had to be read off
 *    the report graph because `resultPath` came back `undefined`. The accessor
 *    is spelled `path`; `resultPath` was never one, so nothing was ever broken.
 *    The port uses the typed accessors and keeps a report-graph fallback for
 *    paths, which is also what makes it independent of the accessor names.
 *
 * `pyshacl`'s `inference="rdfs"` is not reproduced, so a shape whose *semantics*
 * (rather than its targeting) depend on inferred triples — `sh:class`,
 * `sh:path` over an `rdfs:subPropertyOf`, `sh:or`/`sh:and` over an inferred
 * type — would decide differently. None appear in the engine's shapes, and the
 * probe records each as an unverified surface rather than a silent assumption.
 */

import rdf from "@zazuko/env";
import SHACLValidator from "rdf-validate-shacl";
import type { DatasetCore, Quad, Term } from "@rdfjs/types";
import { SH } from "./context.ts";
import type { Config } from "./config.ts";
import { frontmatterToGraph, loadGraph } from "./graph.ts";
import type { Path } from "./fspath.ts";
import { documentDataFromPath } from "./parser.ts";
import { routeForDocumentFile } from "./paths.ts";
import {
  ntTerm,
  RDF_FIRST,
  RDF_REST,
  RDF_TYPE,
  RdfGraph,
  termKey,
} from "./rdf.ts";

/** The two SHACL node types whose own triples are part of the shapes graph. */
const SHAPE_TYPES: ReadonlySet<string> = new Set([
  `${SH}NodeShape`,
  `${SH}PropertyShape`,
]);

/**
 * Extract the shapes a data graph declares.
 *
 * Port of `load_shapes`'s SPARQL CONSTRUCT. The query is a *selection*, not an
 * evaluation: nothing is derived, so reproducing it directly over the graph is
 * the same set of triples without depending on a SPARQL layer that phase 7
 * ports. Its five UNION branches are:
 *
 * 1. every triple whose predicate is in the `sh:` namespace;
 * 2. every triple of a node explicitly typed `sh:NodeShape`/`sh:PropertyShape`;
 * 3. every triple of a node that is the *object* of an `sh:` predicate
 *    (anonymous constraint blocks);
 * 4. every triple of a node reachable from such an object by `rdf:rest*` (the
 *    cons cells of an RDF list); and
 * 5. every triple of each list *element* — the `rdf:first` of any of those
 *    nodes — because a list of property shapes holds the shapes themselves.
 *
 * Branch 5 is the one that is easy to miss and impossible to notice when it is
 * missing: the constraint block validates anyway, and only a list-valued
 * `sh:property`/`sh:in` silently loses its contents.
 */
export function loadShapes(dataGraph: RdfGraph): RdfGraph {
  const shapes = new RdfGraph();
  shapes.bind("sh", SH);

  const quads = dataGraph.toArray();

  // Objects of `sh:` predicates: nested blocks, and RDF list heads.
  const shObjects = new Set<string>();
  for (const quad of quads) {
    if (quad.predicate.value.startsWith(SH)) {
      shObjects.add(termKey(quad.object));
    }
  }

  // Branch 4: `(rdf:rest)*` from every list head, the head included.
  const restReachable = new Set<string>(shObjects);
  const restOf = new Map<string, string[]>();
  for (const quad of quads) {
    if (quad.predicate.value !== RDF_REST) continue;
    const from = termKey(quad.subject);
    const list = restOf.get(from) ?? [];
    list.push(termKey(quad.object));
    restOf.set(from, list);
  }
  const pending = [...restReachable];
  while (pending.length > 0) {
    const node = pending.pop() as string;
    for (const next of restOf.get(node) ?? []) {
      if (restReachable.has(next)) continue;
      restReachable.add(next);
      pending.push(next);
    }
  }

  // Branch 5: the `rdf:first` of every node on those chains.
  const listElements = new Set<string>();
  for (const quad of quads) {
    if (quad.predicate.value !== RDF_FIRST) continue;
    if (!restReachable.has(termKey(quad.subject))) continue;
    listElements.add(termKey(quad.object));
  }

  const typedShapes = new Set<string>();
  for (const quad of quads) {
    if (
      quad.predicate.value === RDF_TYPE && SHAPE_TYPES.has(quad.object.value)
    ) {
      typedShapes.add(termKey(quad.subject));
    }
  }

  for (const quad of quads) {
    const subject = termKey(quad.subject);
    if (
      quad.predicate.value.startsWith(SH) ||
      typedShapes.has(subject) ||
      shObjects.has(subject) ||
      restReachable.has(subject) ||
      listElements.has(subject)
    ) {
      shapes.addQuad(quad);
    }
  }

  return shapes;
}

/** A SHACL validation outcome, as `pyshacl.validate` returns one. */
export interface ShaclOutcome {
  readonly conforms: boolean;
  /** pyshacl's `results_text`; see {@link formatReport} for the divergence. */
  readonly resultsText: string;
}

/** RDF/JS dataset the validator accepts, built from the port's containers. */
function asDataset(graph: RdfGraph): DatasetCore {
  return rdf.dataset(graph.toArray() as unknown as Quad[]) as DatasetCore;
}

/**
 * Validate a data graph against a shapes graph.
 *
 * `abortOnFirst` has no analogue to set: `rdf-validate-shacl` collects every
 * result unless capped with `maxErrors`, which is `pyshacl`'s
 * `abort_on_first=False`.
 */
export async function validateShacl(
  dataGraph: RdfGraph,
  shapesGraph: RdfGraph,
): Promise<ShaclOutcome> {
  const validator = new SHACLValidator(asDataset(shapesGraph));
  const report = await validator.validate(asDataset(dataGraph));
  return {
    conforms: report.conforms,
    resultsText: formatReport(report.conforms, report.results),
  };
}

/** The subset of a validation result this module reports. */
interface ReportableResult {
  readonly term: Term;
  readonly focusNode?: Term;
  readonly path?: Term;
  readonly severity?: Term;
  readonly sourceConstraintComponent?: Term;
  readonly sourceShape?: Term;
  readonly message?: readonly Term[];
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

/**
 * Validate one document's metadata against the shapes the wiki declares.
 *
 * `null` means the document carries no metadata at all — a distinct outcome from
 * "conforms", and the reason `audit` reports `missing_metadata` for it.
 */
export async function checkShaclFile(
  filePath: Path,
  config: Config,
): Promise<ShaclOutcome | null> {
  const data = documentDataFromPath(filePath);
  if (data === null || Object.keys(data).length === 0) return null;

  const sourceGraph = await loadGraph(config, { infer: false });
  const shapesGraph = loadShapes(sourceGraph);
  const dataGraph = frontmatterToGraph(data, config, {
    fileId: routeForDocumentFile(config, filePath),
  });

  return await validateShacl(dataGraph, shapesGraph);
}

/**
 * Validate the whole wiki against the shapes it declares.
 *
 * The shapes are extracted from the *inferred* graph here, unlike the per-file
 * pass: `check` validates the assembled corpus, where a shape can be stated in
 * one page and applied to another's triples. An empty corpus conforms by
 * definition and says so in prose, which is the oracle's message verbatim.
 */
export async function checkShaclAll(config: Config): Promise<ShaclOutcome> {
  const dataGraph = await loadGraph(config);
  const shapesGraph = loadShapes(dataGraph);

  if (dataGraph.size === 0) {
    return {
      conforms: true,
      resultsText: "The data graph is empty. Nothing to validate.",
    };
  }

  return await validateShacl(dataGraph, shapesGraph);
}
