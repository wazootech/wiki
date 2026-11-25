import type { Config } from "../config.ts";
import type { CheckResult, Issue, IssueSeverity } from "../schemas/reports.ts";
import type { CheckDocumentResult, IndexedDocument } from "./types.ts";
import { type DocumentIndex, frontmatterKeysFor } from "./document_index.ts";

/** A document-level finding with no per-field detail (`missing_metadata`). */
export function plainResult(
  issue: Issue,
  severity: IssueSeverity,
): CheckDocumentResult {
  return {
    code: issue.code,
    severity,
    check: null,
    message: issue.message,
    resultPath: null,
    frontmatterKeys: [],
    shaclSeverity: null,
    sourceConstraintComponent: null,
    sourceShapes: [],
    value: null,
    schema: null,
    instancePath: null,
    keyword: null,
  };
}

export function detailedResult(
  issue: Issue,
  severity: IssueSeverity,
  result: CheckResult,
  doc: IndexedDocument | null,
  config: Config,
  index: DocumentIndex,
): CheckDocumentResult {
  const instancePath = result.instancePath ?? null;
  const topKey = instancePath?.[0];
  return {
    code: issue.code,
    severity,
    check: result.check,
    message: result.message,
    resultPath: result.resultPath ?? null,
    frontmatterKeys: result.check === "shacl"
      ? frontmatterKeysFor(config, result.resultPath, doc?.data ?? null)
      : typeof topKey === "string"
      ? [topKey]
      : [],
    shaclSeverity: result.shaclSeverity ?? null,
    sourceConstraintComponent: result.sourceConstraintComponent ?? null,
    sourceShapes: (result.sourceShapes ?? []).map((shape) => {
      const shapeDoc = index.bySubject(shape.iri);
      return {
        iri: shape.iri,
        route: shapeDoc?.route ?? null,
        path: shapeDoc?.path ?? null,
        targetClass: shape.targetClass,
        label: shape.label,
      };
    }),
    value: result.value ?? null,
    schema: result.schema ?? null,
    instancePath,
    keyword: result.keyword ?? null,
  };
}
