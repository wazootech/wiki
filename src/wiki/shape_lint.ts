/**
 * Meta-validation of SHACL shape pages (wiki#306).
 *
 * A shape page is ordinary frontmatter compiled generically into the graph, so
 * a misspelled `sh:` key compiles to an inert triple and the constraint it was
 * meant to declare never fires. `wiki check` stays green while the shape it
 * trusts validates nothing. This pass makes that ill-formedness a finding.
 *
 * It is an allowlist lint, not SHACL-for-SHACL. The spec's own shapes graph
 * (SHACL Appendix C, "SHACL Shapes to Validate Shapes Graphs") validates the
 * compiled RDF, where a typo is just an unknown predicate and the YAML key that
 * spelled it is gone. Linting the frontmatter keeps each finding pointed at the
 * file and the key the author wrote. The rules come from the spec:
 *
 * - **Vocabulary.** Every `sh:` term must be one the SHACL vocabulary defines.
 *   A key must be an `rdf:Property` of it; a type or a value may be any of its
 *   terms. The lists below are generated from the namespace document
 *   <http://www.w3.org/ns/shacl.ttl> ("Version from 2017-07-20", SHA-256
 *   `0e5d8aea…4a13f69`), so they cover Core, SHACL-SPARQL, and the Advanced
 *   Features terms that document also declares.
 * - **Property shapes** have exactly one `sh:path` (§2.3), and a path is
 *   well-formed (§2.3.1): an IRI, a sequence of at least two paths, or a blank
 *   node with exactly one of `sh:inversePath`, `sh:alternativePath` (a list of
 *   at least two paths), `sh:zeroOrMorePath`, `sh:oneOrMorePath`, or
 *   `sh:zeroOrOnePath`. A one-member list is accepted because the compiler
 *   collapses it to its member (wiki#336).
 * - **IRI-valued parameters** (targets §2.1.3–2.1.5, `sh:class` §4.1.1,
 *   `sh:datatype` §4.1.2, the property-pair parameters §4.5, and the members of
 *   `sh:ignoredProperties` §4.8.1) must compile to IRIs. A CURIE whose prefix
 *   the context does not declare compiles to a plain literal instead.
 * - **A node shape page applies to something.** The spec does not require a
 *   target, because a shape can be reached through `sh:node`, `sh:property`,
 *   `sh:qualifiedValueShape`, `sh:not`, or a logical list. So a page typed
 *   `sh:NodeShape` fails only when it has no target, is not also a class (the
 *   implicit class target, §2.1.3.1), and no other shape references it.
 *
 * Turtle shapes (`.ttl` sources and fenced `turtle` blocks) are out of scope:
 * they have no frontmatter keys to point at.
 */

import type { Config } from "./config.ts";
import { type Context, OWL, RDFS, SH } from "./context.ts";
import { describeValue } from "./describe.ts";
import { ValueError } from "./errors.ts";
import { effectiveTypes, frontmatterToGraph, loadGraph } from "./graph.ts";
import { type DataRecord, documentDataFromPath, isRecord } from "./parser.ts";
import { iterDocumentFiles, routeForDocumentFile } from "./paths.ts";
import {
  namedNode,
  RDF_FIRST,
  RDF_REST,
  RDF_TYPE,
  type RdfGraph,
} from "./rdf.ts";
import type { IssueDetail } from "./schemas/reports.ts";

/** Every `rdf:Property` the SHACL vocabulary defines (local names). */
const SHACL_PROPERTIES: ReadonlySet<string> = new Set([
  "alternativePath",
  "and",
  "annotationProperty",
  "annotationValue",
  "annotationVarName",
  "ask",
  "class",
  "closed",
  "condition",
  "conforms",
  "construct",
  "datatype",
  "deactivated",
  "declare",
  "defaultValue",
  "description",
  "detail",
  "disjoint",
  "entailment",
  "equals",
  "expression",
  "filterShape",
  "flags",
  "focusNode",
  "group",
  "hasValue",
  "ignoredProperties",
  "in",
  "intersection",
  "inversePath",
  "js",
  "jsFunctionName",
  "jsLibrary",
  "jsLibraryURL",
  "labelTemplate",
  "languageIn",
  "lessThan",
  "lessThanOrEquals",
  "maxCount",
  "maxExclusive",
  "maxInclusive",
  "maxLength",
  "message",
  "minCount",
  "minExclusive",
  "minInclusive",
  "minLength",
  "name",
  "namespace",
  "node",
  "nodeKind",
  "nodeValidator",
  "nodes",
  "not",
  "object",
  "oneOrMorePath",
  "optional",
  "or",
  "order",
  "parameter",
  "path",
  "pattern",
  "predicate",
  "prefix",
  "prefixes",
  "property",
  "propertyValidator",
  "qualifiedMaxCount",
  "qualifiedMinCount",
  "qualifiedValueShape",
  "qualifiedValueShapesDisjoint",
  "result",
  "resultAnnotation",
  "resultMessage",
  "resultPath",
  "resultSeverity",
  "returnType",
  "rule",
  "select",
  "severity",
  "shapesGraph",
  "shapesGraphWellFormed",
  "sourceConstraint",
  "sourceConstraintComponent",
  "sourceShape",
  "sparql",
  "subject",
  "suggestedShapesGraph",
  "target",
  "targetClass",
  "targetNode",
  "targetObjectsOf",
  "targetSubjectsOf",
  "union",
  "uniqueLang",
  "update",
  "validator",
  "value",
  "xone",
  "zeroOrMorePath",
  "zeroOrOnePath",
]);

/** The SHACL vocabulary's other terms: classes, node kinds, severities, … */
const SHACL_OTHER_TERMS: ReadonlySet<string> = new Set([
  "AbstractResult",
  "AndConstraintComponent",
  "AndConstraintComponent-and",
  "BlankNode",
  "BlankNodeOrIRI",
  "BlankNodeOrLiteral",
  "ClassConstraintComponent",
  "ClassConstraintComponent-class",
  "ClosedConstraintComponent",
  "ClosedConstraintComponent-closed",
  "ClosedConstraintComponent-ignoredProperties",
  "ConstraintComponent",
  "DatatypeConstraintComponent",
  "DatatypeConstraintComponent-datatype",
  "DisjointConstraintComponent",
  "DisjointConstraintComponent-disjoint",
  "EqualsConstraintComponent",
  "EqualsConstraintComponent-equals",
  "ExpressionConstraintComponent",
  "ExpressionConstraintComponent-expression",
  "Function",
  "HasValueConstraintComponent",
  "HasValueConstraintComponent-hasValue",
  "IRI",
  "IRIOrLiteral",
  "InConstraintComponent",
  "InConstraintComponent-in",
  "Info",
  "JSConstraint",
  "JSConstraint-js",
  "JSConstraintComponent",
  "JSExecutable",
  "JSFunction",
  "JSLibrary",
  "JSRule",
  "JSTarget",
  "JSTargetType",
  "JSValidator",
  "LanguageInConstraintComponent",
  "LanguageInConstraintComponent-languageIn",
  "LessThanConstraintComponent",
  "LessThanConstraintComponent-lessThan",
  "LessThanOrEqualsConstraintComponent",
  "LessThanOrEqualsConstraintComponent-lessThanOrEquals",
  "Literal",
  "MaxCountConstraintComponent",
  "MaxCountConstraintComponent-maxCount",
  "MaxExclusiveConstraintComponent",
  "MaxExclusiveConstraintComponent-maxExclusive",
  "MaxInclusiveConstraintComponent",
  "MaxInclusiveConstraintComponent-maxInclusive",
  "MaxLengthConstraintComponent",
  "MaxLengthConstraintComponent-maxLength",
  "MinCountConstraintComponent",
  "MinCountConstraintComponent-minCount",
  "MinExclusiveConstraintComponent",
  "MinExclusiveConstraintComponent-minExclusive",
  "MinInclusiveConstraintComponent",
  "MinInclusiveConstraintComponent-minInclusive",
  "MinLengthConstraintComponent",
  "MinLengthConstraintComponent-minLength",
  "NodeConstraintComponent",
  "NodeConstraintComponent-node",
  "NodeKind",
  "NodeKindConstraintComponent",
  "NodeKindConstraintComponent-nodeKind",
  "NodeShape",
  "NotConstraintComponent",
  "NotConstraintComponent-not",
  "OrConstraintComponent",
  "OrConstraintComponent-or",
  "Parameter",
  "Parameterizable",
  "PatternConstraintComponent",
  "PatternConstraintComponent-flags",
  "PatternConstraintComponent-pattern",
  "PrefixDeclaration",
  "PropertyConstraintComponent",
  "PropertyConstraintComponent-property",
  "PropertyGroup",
  "PropertyShape",
  "QualifiedMaxCountConstraintComponent",
  "QualifiedMaxCountConstraintComponent-qualifiedMaxCount",
  "QualifiedMaxCountConstraintComponent-qualifiedValueShape",
  "QualifiedMaxCountConstraintComponent-qualifiedValueShapesDisjoint",
  "QualifiedMinCountConstraintComponent",
  "QualifiedMinCountConstraintComponent-qualifiedMinCount",
  "QualifiedMinCountConstraintComponent-qualifiedValueShape",
  "QualifiedMinCountConstraintComponent-qualifiedValueShapesDisjoint",
  "ResultAnnotation",
  "Rule",
  "SPARQLAskExecutable",
  "SPARQLAskValidator",
  "SPARQLConstraint",
  "SPARQLConstraintComponent",
  "SPARQLConstraintComponent-sparql",
  "SPARQLConstructExecutable",
  "SPARQLExecutable",
  "SPARQLFunction",
  "SPARQLRule",
  "SPARQLSelectExecutable",
  "SPARQLSelectValidator",
  "SPARQLTarget",
  "SPARQLTargetType",
  "SPARQLUpdateExecutable",
  "Severity",
  "Shape",
  "Target",
  "TargetType",
  "TripleRule",
  "UniqueLangConstraintComponent",
  "UniqueLangConstraintComponent-uniqueLang",
  "ValidationReport",
  "ValidationResult",
  "Validator",
  "Violation",
  "Warning",
  "XoneConstraintComponent",
  "XoneConstraintComponent-xone",
  "this",
]);

/** Parameters whose values the spec requires to be IRIs. */
const IRI_VALUED: ReadonlySet<string> = new Set([
  "targetClass",
  "targetSubjectsOf",
  "targetObjectsOf",
  "class",
  "datatype",
  "equals",
  "disjoint",
  "lessThan",
  "lessThanOrEquals",
  "ignoredProperties",
]);

/** Keys whose value is a property path (§2.3.1). */
const PATH_VALUED: ReadonlySet<string> = new Set([
  "path",
  "inversePath",
  "zeroOrMorePath",
  "oneOrMorePath",
  "zeroOrOnePath",
]);

/** The complex-path keys; a path mapping has exactly one of them (§2.3.1). */
const PATH_FORMS: ReadonlySet<string> = new Set([
  "inversePath",
  "alternativePath",
  "zeroOrMorePath",
  "oneOrMorePath",
  "zeroOrOnePath",
]);

/** Parameters whose values are shapes, so they may reference a shape page. */
const SHAPE_VALUED: ReadonlySet<string> = new Set([
  "node",
  "property",
  "qualifiedValueShape",
  "not",
]);

/** Parameters whose value is a list of shapes (§4.6). */
const SHAPE_LISTS: ReadonlySet<string> = new Set(["and", "or", "xone"]);

/** The target declarations of SHACL Core and Advanced Features (§2.1). */
const TARGETS: ReadonlySet<string> = new Set([
  "targetClass",
  "targetNode",
  "targetObjectsOf",
  "targetSubjectsOf",
  "target",
]);

/** The six values `sh:nodeKind` allows (§4.1.3). */
const NODE_KINDS: ReadonlySet<string> = new Set([
  "BlankNode",
  "IRI",
  "Literal",
  "BlankNodeOrIRI",
  "BlankNodeOrLiteral",
  "IRIOrLiteral",
]);

/** Top-level keys the compiler never turns into triples. */
const SKIP_KEYS: ReadonlySet<string> = new Set(["id", "type", "@type"]);

/** Expand `prefix:local` against the context, or `null` for an unknown prefix. */
function expandCurie(value: string, context: Context): string | null {
  const index = value.indexOf(":");
  if (index < 0) return null;
  const namespace = context.namespaces.get(value.slice(0, index));
  return namespace === undefined ? null : namespace + value.slice(index + 1);
}

/** The IRI a frontmatter key compiles to, mirroring `resolvePredicate`. */
function keyIri(key: string, context: Context): string | null {
  if (key.includes(":")) {
    const expanded = expandCurie(key, context);
    if (expanded !== null) return expanded;
  }
  if (key.startsWith("wiki.")) return null;
  return context.vocab ? context.vocab + key : null;
}

/** The SHACL local name of an IRI, or `null` outside the `sh:` namespace. */
function shLocal(iri: string | null): string | null {
  return iri !== null && iri.startsWith(SH) ? iri.slice(SH.length) : null;
}

/**
 * The IRI a scalar value compiles to, or `null` when it compiles to a literal.
 * Mirrors the `@id` and string branches of the compiler's `addObject`.
 */
function valueIri(value: unknown, context: Context): string | null {
  if (isRecord(value)) {
    const id = value["@id"];
    if (typeof id !== "string" || id === "") return null;
    return id.includes(":") ? expandCurie(id, context) ?? id : id;
  }
  if (typeof value !== "string") return null;
  if (value.startsWith("http")) return value;
  if (value.includes(":") && !value.includes(" ") && !value.includes("\n")) {
    return expandCurie(value, context);
  }
  return null;
}

/** A mapping that compiles to a blank node rather than an `@id` reference. */
function isBlankMapping(value: unknown): value is DataRecord {
  return isRecord(value) && !("@id" in value);
}

/** Collects one document's findings, each prefixed with its key path. */
class Findings {
  readonly messages: string[] = [];
  constructor(readonly route: string) {}

  add(where: string, message: string): void {
    this.messages.push(`In ${this.route}: ${where}: ${message}`);
  }
}

/** `key` or `key[index]`, for a value that may or may not be a list. */
function itemPath(where: string, value: unknown, index: number): string {
  return Array.isArray(value) ? `${where}[${index}]` : where;
}

/** Lint an `sh:alternativePath` value: a list of at least two paths. */
function lintAlternatives(
  value: unknown,
  where: string,
  context: Context,
  findings: Findings,
): void {
  const items = Array.isArray(value)
    ? value.filter((item) => item !== null && item !== undefined)
    : [];
  if (items.length < 2) {
    findings.add(
      where,
      "sh:alternativePath must be a list of at least two paths " +
        "(SHACL §2.3.1.3).",
    );
  }
  if (!Array.isArray(value)) {
    lintPath(value, where, context, findings);
    return;
  }
  value.forEach((item, index) => {
    if (item === null || item === undefined) return;
    lintPath(item, `${where}[${index}]`, context, findings);
  });
}

/** Lint a property path value at `where` (§2.3.1). */
function lintPath(
  value: unknown,
  where: string,
  context: Context,
  findings: Findings,
): void {
  if (Array.isArray(value)) {
    const items = value.filter((item) => item !== null && item !== undefined);
    if (items.length === 0) {
      findings.add(where, "an empty list is not a SHACL property path.");
    }
    value.forEach((item, index) => {
      if (item === null || item === undefined) return;
      lintPath(item, `${where}[${index}]`, context, findings);
    });
    return;
  }
  if (isBlankMapping(value)) {
    const keys = Object.keys(value);
    const forms = keys.filter((key) => {
      const local = shLocal(keyIri(key, context));
      return local !== null && PATH_FORMS.has(local);
    });
    if (forms.length !== 1 || keys.length !== 1) {
      findings.add(
        where,
        "a complex path must have exactly one key, one of sh:inversePath, " +
          "sh:alternativePath, sh:zeroOrMorePath, sh:oneOrMorePath, or " +
          "sh:zeroOrOnePath (SHACL §2.3.1).",
      );
    }
    for (const key of forms) {
      const at = `${where}.${key}`;
      if (shLocal(keyIri(key, context)) === "alternativePath") {
        lintAlternatives(value[key], at, context, findings);
      } else {
        lintPath(value[key], at, context, findings);
      }
    }
    return;
  }
  if (valueIri(value, context) === null) {
    findings.add(
      where,
      `${describeValue(value)} is not an IRI, so it is not a property path; ` +
        "use a full IRI or a CURIE whose prefix the wiki declares.",
    );
  }
}

/** Check that every `sh:` IRI among the scalar values is a SHACL term. */
function lintValues(
  value: unknown,
  where: string,
  context: Context,
  findings: Findings,
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      lintValues(item, `${where}[${index}]`, context, findings)
    );
    return;
  }
  if (isBlankMapping(value)) return;
  const local = shLocal(valueIri(value, context));
  if (local !== null && !isShaclTerm(local)) {
    findings.add(where, `sh:${local} is not a term of the SHACL vocabulary.`);
  }
}

/** Whether a local name is any term of the SHACL vocabulary. */
function isShaclTerm(local: string): boolean {
  return SHACL_PROPERTIES.has(local) || SHACL_OTHER_TERMS.has(local);
}

/**
 * Walk one mapping. `kind` is what the spec says the node is: a property shape
 * needs `sh:path` (§2.3), a node shape must not have one (§2.2, and §4.7.1 for
 * the values of `sh:node`), and anything else is checked for vocabulary and
 * nested shapes.
 */
function lintShape(
  shape: DataRecord,
  where: string,
  kind: "property" | "node" | "other",
  context: Context,
  findings: Findings,
): void {
  const prefix = where === "" ? "" : `${where}.`;
  let pathKey: string | null = null;

  for (const [key, value] of Object.entries(shape)) {
    if (key.startsWith("@") || (where === "" && SKIP_KEYS.has(key))) continue;
    const at = `${prefix}${key}`;
    const local = shLocal(keyIri(key, context));
    if (local === null) {
      // Not a SHACL key, but a nested mapping may still carry SHACL keys.
      if (isBlankMapping(value)) {
        lintShape(value, at, "other", context, findings);
      } else if (Array.isArray(value)) {
        value.forEach((item, index) => {
          if (isBlankMapping(item)) {
            lintShape(item, `${at}[${index}]`, "other", context, findings);
          }
        });
      }
      continue;
    }

    if (!SHACL_PROPERTIES.has(local)) {
      findings.add(
        at,
        `sh:${local} is not a property of the SHACL vocabulary, so it ` +
          "constrains nothing.",
      );
      continue;
    }

    if (local === "path") pathKey = at;
    if (PATH_VALUED.has(local)) {
      lintPath(value, at, context, findings);
      continue;
    }
    if (local === "alternativePath") {
      lintAlternatives(value, at, context, findings);
      continue;
    }
    if (local === "nodeKind") {
      const kind = shLocal(valueIri(value, context));
      if (kind === null || !NODE_KINDS.has(kind)) {
        findings.add(
          at,
          `sh:nodeKind must be one of ${
            [...NODE_KINDS].map((k) => `sh:${k}`)
              .join(", ")
          }, not ${describeValue(value)} (SHACL §4.1.3).`,
        );
      }
      continue;
    }

    if (IRI_VALUED.has(local)) {
      (Array.isArray(value) ? value : [value]).forEach((item, index) => {
        if (item === null || item === undefined) return;
        if (valueIri(item, context) !== null) return;
        findings.add(
          itemPath(at, value, index),
          `sh:${local} takes IRIs, and ${describeValue(item)} compiles to a ` +
            "literal; use a full IRI or a CURIE whose prefix the wiki declares.",
        );
      });
      continue;
    }

    if (SHAPE_VALUED.has(local) || SHAPE_LISTS.has(local)) {
      const childKind = local === "property"
        ? "property"
        : local === "node"
        ? "node"
        : "other";
      (Array.isArray(value) ? value : [value]).forEach((item, index) => {
        if (isBlankMapping(item)) {
          lintShape(
            item,
            itemPath(at, value, index),
            childKind,
            context,
            findings,
          );
        }
      });
      continue;
    }

    lintValues(value, at, context, findings);
  }

  if (kind === "property" && pathKey === null) {
    findings.add(
      where === "" ? "sh:path" : where,
      "a property shape needs exactly one sh:path (SHACL §2.3).",
    );
  }
  if (kind === "node" && pathKey !== null) {
    findings.add(
      pathKey,
      "a node shape cannot have sh:path (SHACL §2.2); put a path constraint " +
        "in a property shape under sh:property.",
    );
  }
}

/** The shape IRIs that other shapes reach through a shape-valued parameter. */
function referencedShapes(graph: RdfGraph): Set<string> {
  const referenced = new Set<string>();
  for (const local of SHAPE_VALUED) {
    for (const quad of graph.match(null, namedNode(SH + local), null)) {
      referenced.add(quad.object.value);
    }
  }
  for (const local of SHAPE_LISTS) {
    for (const quad of graph.match(null, namedNode(SH + local), null)) {
      let cell = quad.object;
      const seen = new Set<string>();
      while (cell.termType === "BlankNode" && !seen.has(cell.value)) {
        seen.add(cell.value);
        for (const first of graph.match(cell, namedNode(RDF_FIRST), null)) {
          referenced.add(first.object.value);
        }
        const rest = [...graph.match(cell, namedNode(RDF_REST), null)];
        if (rest.length === 0) break;
        cell = rest[0]!.object;
      }
    }
  }
  return referenced;
}

/** The type IRIs a document declares, as the compiler resolves them. */
function typeIris(data: DataRecord, config: Config): Set<string> {
  const context = config.context;
  const out = new Set<string>();
  for (const item of effectiveTypes(data, config)) {
    if (typeof item !== "string") continue;
    const iri = valueIri(item, context) ??
      (context.vocab ? context.vocab + item : null);
    if (iri !== null) out.add(iri);
  }
  return out;
}

/** Whether the top level declares any target (§2.1). */
function hasTarget(data: DataRecord, context: Context): boolean {
  return Object.keys(data).some((key) => {
    const local = shLocal(keyIri(key, context));
    return local !== null && TARGETS.has(local);
  });
}

/**
 * Lint every document's SHACL terms, and the structure of every shape page.
 *
 * Returns one finding per problem, each naming the route and the key path.
 * `filePaths` scopes the pass to those files; references between shapes are
 * still read from the whole wiki, because a shape that another page references
 * needs no target of its own.
 */
export async function lintShapeDefinitions(
  config: Config,
  fileFilter: ReadonlySet<string> | null = null,
  options: { readonly filePaths?: readonly string[] | null } = {},
): Promise<IssueDetail[]> {
  if (config.check.shape_definition === "off") return [];
  const context = config.context;
  const issues: IssueDetail[] = [];
  let referenced: Set<string> | null = null;

  for (const filePath of options.filePaths ?? iterDocumentFiles(config)) {
    let route: string;
    try {
      route = routeForDocumentFile(config, filePath);
    } catch (error) {
      if (error instanceof ValueError) continue;
      throw error;
    }
    if (fileFilter !== null && !fileFilter.has(route)) continue;
    const data = documentDataFromPath(
      filePath,
      config.graph.content_predicate ?? undefined,
    );
    if (data === null || Object.keys(data).length === 0) continue;

    const findings = new Findings(route);
    const types = typeIris(data, config);
    for (const type of types) {
      const local = shLocal(type);
      if (local !== null && !isShaclTerm(local)) {
        findings.add(
          "type",
          `sh:${local} is not a term of the SHACL vocabulary.`,
        );
      }
    }
    const isNodeShape = types.has(SH + "NodeShape");
    const isPropertyShape = types.has(SH + "PropertyShape");
    lintShape(
      data,
      "",
      isPropertyShape ? "property" : isNodeShape ? "node" : "other",
      context,
      findings,
    );

    if (isNodeShape && !isPropertyShape && !hasTarget(data, context)) {
      const isClass = types.has(RDFS + "Class") || types.has(OWL + "Class");
      if (!isClass) {
        referenced ??= referencedShapes(
          await loadGraph(config, { infer: false }),
        );
        const graph = frontmatterToGraph(data, config, { fileId: route });
        const subjects = [
          ...graph.match(
            null,
            namedNode(RDF_TYPE),
            namedNode(SH + "NodeShape"),
          ),
        ].map((quad) => quad.subject.value);
        if (!subjects.some((iri) => referenced!.has(iri))) {
          findings.add(
            "sh:targetClass",
            "this node shape has no target (sh:targetClass, sh:targetNode, " +
              "sh:targetSubjectsOf, sh:targetObjectsOf) and no other shape " +
              "references it, so it validates nothing (SHACL §2.1).",
          );
        }
      }
    }

    for (const message of findings.messages) {
      issues.push({ message, path: filePath, route });
    }
  }
  return issues;
}
