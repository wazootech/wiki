import rdf from "@zazuko/env";
import SHACLValidator from "rdf-validate-shacl";
import type { DatasetCore, Quad, Term } from "@rdfjs/types";
import { RDFS, SH } from "../context.ts";
import type { CheckResult, ShapeRef } from "../schemas/reports.ts";
import { type RdfGraph, termKey } from "../rdf.ts";
import {
  formatReport,
  type ReportableResult,
  stableTermValue,
} from "./report.ts";

/** A SHACL validation outcome, as `pyshacl.validate` returns one. */
export interface ShaclOutcome {
  readonly conforms: boolean;
  /** pyshacl's `results_text`; see {@link formatReport} for the divergence. */
  readonly resultsText: string;
  /** The same results, structured; see {@link structuredResult}. */
  readonly results: readonly CheckResult[];
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
    results: report.results.map((result) =>
      structuredResult(result, shapesGraph)
    ),
  };
}

/**
 * One validation result as plain data, for `wiki check -f json`.
 *
 * Blank nodes are never serialized: their labels change between runs, so a
 * blank focus node or value is `null`. The source shape is named by a lookup
 * against the shapes graph instead — see {@link namedSourceShapes}.
 */
export function structuredResult(
  result: ReportableResult,
  shapesGraph: RdfGraph,
): CheckResult {
  const messages = (result.message ?? []).map((term) => term.value);
  return {
    check: "shacl",
    message: messages.join(" "),
    focusNode: stableTermValue(result.focusNode),
    resultPath: result.path?.termType === "NamedNode"
      ? result.path.value
      : null,
    shaclSeverity: stableTermValue(result.severity),
    sourceConstraintComponent: stableTermValue(
      result.sourceConstraintComponent,
    ),
    sourceShapes: result.sourceShape
      ? namedSourceShapes(result.sourceShape, shapesGraph)
      : [],
    value: stableTermValue(result.value ?? undefined),
  };
}

/**
 * The named shapes a result's `sh:sourceShape` belongs to.
 *
 * A property shape written inline in a shape page is a blank node, so the
 * shape a reader recognises is the named node holding it through
 * `sh:property`. The join is on term identity within the shapes graph this
 * process built — never structural, because two shapes can declare the same
 * `sh:path` — and a source shape with no named owner yields an empty list
 * rather than a guessed one.
 */
export function namedSourceShapes(
  sourceShape: Term,
  shapesGraph: RdfGraph,
): ShapeRef[] {
  const quads = shapesGraph.toArray();
  const sourceKey = termKey(sourceShape);
  const owners: Term[] = [];
  const seen = new Set<string>();
  const push = (term: Term) => {
    const key = termKey(term);
    if (term.termType !== "NamedNode" || seen.has(key)) return;
    seen.add(key);
    owners.push(term);
  };
  // A named source shape is the shape itself (SHACL §3.6 `sh:sourceShape`),
  // even when a node shape also lists it under `sh:property`: the constraint
  // belongs to that page, not to the shape that references it.
  if (sourceShape.termType === "NamedNode") {
    push(sourceShape);
  } else {
    for (const quad of quads) {
      if (
        quad.predicate.value === `${SH}property` &&
        termKey(quad.object) === sourceKey
      ) {
        push(quad.subject);
      }
    }
  }

  return owners.map((owner) => {
    const ownerKey = termKey(owner);
    const targetClass: string[] = [];
    let label: string | null = null;
    for (const quad of quads) {
      if (termKey(quad.subject) !== ownerKey) continue;
      if (quad.predicate.value === `${SH}targetClass`) {
        targetClass.push(quad.object.value);
      } else if (quad.predicate.value === `${RDFS}label` && label === null) {
        label = quad.object.value;
      }
    }
    return { iri: owner.value, targetClass, label };
  });
}
