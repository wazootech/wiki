import type { DataRecord } from "../parser.ts";
import type { IssueSeverity } from "../schemas/reports.ts";

/** A named shape, resolved to the shape page that declares it when it has one. */
export interface CheckShape {
  readonly iri: string;
  readonly route: string | null;
  readonly path: string | null;
  readonly targetClass: readonly string[];
  readonly label: string | null;
}

/** One failing field (or document-level finding) in `documents[].results`. */
export interface CheckDocumentResult {
  readonly code: string;
  readonly severity: IssueSeverity;
  readonly check: "shacl" | "jsonSchema" | null;
  readonly message: string;
  readonly resultPath: string | null;
  /** Frontmatter keys that resolve to `resultPath`, so callers never expand CURIEs. */
  readonly frontmatterKeys: readonly string[];
  readonly shaclSeverity: string | null;
  readonly sourceConstraintComponent: string | null;
  readonly sourceShapes: readonly CheckShape[];
  readonly value: string | null;
  readonly schema: string | null;
  readonly instancePath: readonly (string | number)[] | null;
  readonly keyword: string | null;
}

/** One document the check examined or reported on. */
export interface CheckDocument {
  /** Path relative to the config root, `/`-separated; `null` when unattributed. */
  readonly path: string | null;
  readonly route: string | null;
  readonly focusNode: string | null;
  readonly conforms: boolean;
  readonly results: readonly CheckDocumentResult[];
}

/** An issue exactly as the text report prints it. */
export interface CheckIssue {
  readonly code: string;
  readonly severity: IssueSeverity;
  readonly message: string;
  readonly path: string | null;
  readonly route: string | null;
}

/**
 * The envelope's format version. Adding a field is not a version change;
 * renaming, removing, or changing the meaning of one is, and bumps this.
 */
export const CHECK_REPORT_VERSION = 1;

/** The `wiki check -f json` payload. */
export interface CheckEnvelope {
  readonly version: typeof CHECK_REPORT_VERSION;
  readonly ok: boolean;
  readonly documents: readonly CheckDocument[];
  readonly issues: readonly CheckIssue[];
}

/** What the envelope needs to know about one document file. */
export interface IndexedDocument {
  readonly path: string;
  readonly route: string | null;
  readonly focusNode: string | null;
  readonly data: DataRecord | null;
}
