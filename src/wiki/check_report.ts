/**
 * The machine-readable `wiki check` report: `wiki check -f json`.
 *
 * The text report is written for a person and is the canonical rendering; this
 * module is the *data contract* a caller (an editor form, a CI job) reads
 * instead of parsing it (#310). It is built from the same {@link AuditReport}
 * the text report prints, so the two cannot disagree about what failed:
 *
 * - `issues` is every issue the text report shows — errors, then warnings —
 *   with the same `code`, `severity`, and `message`. Warnings are always
 *   included: the text report hides them without `-v`, but a data consumer
 *   decides for itself.
 * - `documents` regroups the issues that are about one document, with each
 *   SHACL result and JSON Schema failure broken out per field: the result path,
 *   the frontmatter keys that spell it, the constraint component, and the
 *   named shape that declared it.
 *
 * Two identity rules hold throughout. Blank nodes are never serialized, because
 * their labels change between runs; a shape is named by the shape page that
 * owns it. And a result whose focus node maps to no document is kept, under a
 * document entry with `path: null`, rather than dropped.
 */

import type { Config } from "./config.ts";
import type { AuditReport, Issue } from "./schemas/reports.ts";
import {
  CHECK_REPORT_VERSION,
  type CheckDocument,
  type CheckDocumentResult,
  type CheckEnvelope,
  type IndexedDocument,
} from "./check_report/types.ts";
import { displayPath, DocumentIndex } from "./check_report/document_index.ts";
import { detailedResult, plainResult } from "./check_report/results.ts";

export {
  CHECK_REPORT_VERSION,
  type CheckDocument,
  type CheckDocumentResult,
  type CheckEnvelope,
  type CheckIssue,
  type CheckShape,
} from "./check_report/types.ts";
export { frontmatterKeysFor } from "./check_report/document_index.ts";

/**
 * Build the `wiki check -f json` payload from an audit report.
 *
 * `filePaths` are the scoped-mode documents: each gets an entry even when it
 * conforms, so a caller validating one page always finds it. In whole-wiki mode
 * only documents with findings are listed.
 */
export function buildCheckEnvelope(
  report: AuditReport,
  config: Config,
  filePaths: readonly string[] = [],
): CheckEnvelope {
  const index = new DocumentIndex(config);
  const entries = new Map<string, {
    doc: Omit<CheckDocument, "conforms" | "results">;
    results: CheckDocumentResult[];
    failed: boolean;
  }>();

  const entryFor = (
    doc: IndexedDocument | undefined,
    focusNode?: string | null,
  ) => {
    const key = doc ? `doc:${doc.path}` : `node:${focusNode ?? ""}`;
    let entry = entries.get(key);
    if (entry === undefined) {
      entry = {
        doc: doc
          ? { path: doc.path, route: doc.route, focusNode: doc.focusNode }
          : { path: null, route: null, focusNode: focusNode ?? null },
        results: [],
        failed: false,
      };
      entries.set(key, entry);
    }
    return entry;
  };

  for (const filePath of filePaths) entryFor(index.add(filePath));

  const issues: Issue[] = [...report.errors, ...report.warnings];
  for (const issue of issues) {
    const severity = issue.severity ?? "error";
    const issueDoc = issue.path
      ? index.add(issue.path)
      : index.byRoute(issue.route);

    if (issue.results === undefined || issue.results.length === 0) {
      if (issueDoc === undefined) continue;
      const entry = entryFor(issueDoc);
      entry.results.push(plainResult(issue, severity));
      if (severity === "error") entry.failed = true;
      continue;
    }

    for (const result of issue.results) {
      const doc = issueDoc ?? index.bySubject(result.focusNode);
      const entry = entryFor(doc, result.focusNode);
      entry.results.push(
        detailedResult(issue, severity, result, doc ?? null, config, index),
      );
      if (severity === "error") entry.failed = true;
    }
  }

  return {
    version: CHECK_REPORT_VERSION,
    ok: report.ok,
    documents: [...entries.values()].map((entry) => ({
      ...entry.doc,
      conforms: !entry.failed,
      results: entry.results,
    })),
    issues: issues.map((issue) => ({
      code: issue.code,
      severity: issue.severity ?? "error",
      message: issue.message,
      path: issue.path ? displayPath(config, issue.path) : null,
      route: issue.route ?? null,
    })),
  };
}
