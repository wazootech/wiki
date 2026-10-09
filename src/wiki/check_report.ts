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

import { relative, resolve, SEPARATOR } from "@std/path";
import type { Config } from "./config.ts";
import { ValueError } from "./errors.ts";
import { frontmatterToGraph, resolvePredicate } from "./graph.ts";
import { type DataRecord, documentDataFromPath } from "./parser.ts";
import { iterDocumentFiles, routeForDocumentFile } from "./paths.ts";
import { RDF_TYPE } from "./rdf.ts";
import type {
  AuditReport,
  CheckResult,
  Issue,
  IssueSeverity,
} from "./schemas/reports.ts";

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

/** The `wiki check -f json` payload. */
export interface CheckEnvelope {
  readonly ok: boolean;
  readonly documents: readonly CheckDocument[];
  readonly issues: readonly CheckIssue[];
}

/** What the envelope needs to know about one document file. */
interface IndexedDocument {
  readonly path: string;
  readonly route: string | null;
  readonly focusNode: string | null;
  readonly data: DataRecord | null;
}

/** Document lookups by subject IRI, route, and resolved file path. */
class DocumentIndex {
  readonly #bySubject = new Map<string, IndexedDocument>();
  readonly #byRoute = new Map<string, IndexedDocument>();
  readonly #byFile = new Map<string, IndexedDocument>();

  constructor(private readonly config: Config) {
    for (const filePath of iterDocumentFiles(config)) this.add(filePath);
  }

  add(filePath: string): IndexedDocument {
    const key = resolve(filePath);
    const known = this.#byFile.get(key);
    if (known !== undefined) return known;

    const route = safeRoute(this.config, filePath);
    const data = documentDataFromPath(filePath);
    // The whole-wiki graph appends the file extension when the config asks;
    // the scoped pass does not. Index both spellings of the subject.
    const subjects = new Set<string>();
    if (data !== null && route !== null) {
      for (const includeFileExtension of [true, false]) {
        const subject = documentSubject(this.config, data, route, filePath, {
          includeFileExtension: includeFileExtension &&
            this.config.graph.include_file_extension,
        });
        if (subject !== null) subjects.add(subject);
      }
    }

    const doc: IndexedDocument = {
      path: displayPath(this.config, filePath),
      route,
      focusNode: subjects.values().next().value ?? null,
      data,
    };
    this.#byFile.set(key, doc);
    if (route !== null && !this.#byRoute.has(route)) {
      this.#byRoute.set(route, doc);
    }
    for (const subject of subjects) {
      if (!this.#bySubject.has(subject)) this.#bySubject.set(subject, doc);
    }
    return doc;
  }

  bySubject(iri: string | null | undefined): IndexedDocument | undefined {
    return iri ? this.#bySubject.get(iri) : undefined;
  }

  byRoute(route: string | null | undefined): IndexedDocument | undefined {
    return route ? this.#byRoute.get(route) : undefined;
  }
}

/** The subject IRI `frontmatterToGraph` gives a document, or `null`. */
function documentSubject(
  config: Config,
  data: DataRecord,
  route: string,
  filePath: string,
  options: { readonly includeFileExtension: boolean },
): string | null {
  const graph = frontmatterToGraph(data, config, {
    fileId: route,
    includeFileExtension: options.includeFileExtension,
    fileExt: filePath.slice(filePath.lastIndexOf(".")).toLowerCase(),
  });
  for (const quad of graph.toArray()) {
    if (
      quad.predicate.value === RDF_TYPE && quad.subject.termType === "NamedNode"
    ) {
      return quad.subject.value;
    }
  }
  return null;
}

function safeRoute(config: Config, filePath: string): string | null {
  try {
    return routeForDocumentFile(config, filePath);
  } catch (error) {
    if (error instanceof ValueError) return null;
    throw error;
  }
}

/** A path relative to the config root with `/` separators. */
function displayPath(config: Config, filePath: string): string {
  const rel = relative(resolve(config.config_root), resolve(filePath));
  return SEPARATOR === "/" ? rel : rel.split(SEPARATOR).join("/");
}

/**
 * The frontmatter keys that spell a predicate.
 *
 * Keys the document actually carries win: that is the field a form shows. A
 * missing field (`sh:minCount`) has no key in the document, so the candidates
 * are the spellings the context would resolve to the same IRI — the `@vocab`
 * local name, then each `prefix:local` CURIE — checked through the same
 * {@link resolvePredicate} the graph builder uses.
 */
export function frontmatterKeysFor(
  config: Config,
  predicate: string | null | undefined,
  data: DataRecord | null,
): string[] {
  if (!predicate) return [];
  const context = config.context;
  const resolvesTo = (key: string) =>
    resolvePredicate(key, context)?.value === predicate;

  const present = Object.keys(data ?? {}).filter((key) =>
    !key.startsWith("@") && resolvesTo(key)
  );
  if (present.length > 0) return present;

  const candidates: string[] = [];
  if (context.vocab && predicate.startsWith(context.vocab)) {
    candidates.push(predicate.slice(context.vocab.length));
  }
  for (const [prefix, namespace] of context.namespaces) {
    if (prefix !== "" && predicate.startsWith(namespace)) {
      candidates.push(`${prefix}:${predicate.slice(namespace.length)}`);
    }
  }
  return [...new Set(candidates)].filter((key) =>
    key !== "" && resolvesTo(key)
  );
}

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

/** A document-level finding with no per-field detail (`missing_metadata`). */
function plainResult(
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

function detailedResult(
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
