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
 *
 * Separately, under its own rule (`check.shape_unused`, default `warning`), a
 * node shape page should apply to something. The spec does not require a
 * target, because a shape can be reached through `sh:node`, `sh:property`,
 * `sh:qualifiedValueShape`, `sh:not`, or a logical list, so this is a likely
 * mistake rather than an ill-formed shape: a page typed `sh:NodeShape` is
 * flagged only when it has no target, is not also a class (the implicit class
 * target, §2.1.3.1), and no other shape references it.
 *
 * Shapes written in RDF (fenced `turtle` blocks and RDF data files such as
 * `.ttl`) get the same rules over their triples (#342). Their findings name
 * the source and the shape, since there is no frontmatter key to point at.
 * Shapes from installed sources are not linted: their own wiki owns them.
 */

import type { Config } from "./config.ts";
import { type Context, OWL, RDFS, SH } from "./context.ts";
import { describeValue } from "./describe.ts";
import { ValueError } from "./errors.ts";
import {
  effectiveTypes,
  frontmatterToGraph,
  loadGraph,
  rdfSources,
} from "./graph.ts";
import { type DataRecord, documentDataFromPath, isRecord } from "./parser.ts";
import { iterDocumentFiles, routeForDocumentFile } from "./paths.ts";
import { resolve } from "@std/path";
import {
  namedNode,
  type Quad,
  RDF_FIRST,
  RDF_NIL,
  RDF_REST,
  RDF_TYPE,
  type RdfGraph,
  type Term,
  termKey,
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

/** The findings of {@link lintShapeDefinitions}, one list per rule. */
export interface ShapeLintResult {
  /** `check.shape_definition`: shapes that break a SHACL Core rule. */
  readonly definitions: IssueDetail[];
  /** `check.shape_unused`: node shapes that apply to nothing. */
  readonly unused: IssueDetail[];
}

/**
 * Lint every document's SHACL terms, and the structure of every shape page.
 *
 * Returns one finding per problem, each naming the route and the key path,
 * split by rule. A rule set to `off` is not computed. `filePaths` scopes the
 * pass to those files; references between shapes are still read from the
 * whole wiki, because a shape that another page references needs no target of
 * its own.
 */
export async function lintShapeDefinitions(
  config: Config,
  fileFilter: ReadonlySet<string> | null = null,
  options: { readonly filePaths?: readonly string[] | null } = {},
): Promise<ShapeLintResult> {
  const lintDefinitions = config.check.shape_definition !== "off";
  const lintUnused = config.check.shape_unused !== "off";
  const definitions: IssueDetail[] = [];
  const unused: IssueDetail[] = [];
  if (!lintDefinitions && !lintUnused) return { definitions, unused };
  const context = config.context;
  let referenced: Set<string> | null = null;
  const referencedShapeIris = async (): Promise<Set<string>> =>
    referenced ??= referencedShapes(await loadGraph(config, { infer: false }));

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

    const types = typeIris(data, config);
    const isNodeShape = types.has(SH + "NodeShape");
    const isPropertyShape = types.has(SH + "PropertyShape");

    if (lintDefinitions) {
      const findings = new Findings(route);
      for (const type of types) {
        const local = shLocal(type);
        if (local !== null && !isShaclTerm(local)) {
          findings.add(
            "type",
            `sh:${local} is not a term of the SHACL vocabulary.`,
          );
        }
      }
      lintShape(
        data,
        "",
        isPropertyShape ? "property" : isNodeShape ? "node" : "other",
        context,
        findings,
      );
      for (const message of findings.messages) {
        definitions.push({ message, path: filePath, route });
      }
    }

    if (
      lintUnused && isNodeShape && !isPropertyShape &&
      !hasTarget(data, context) &&
      !types.has(RDFS + "Class") && !types.has(OWL + "Class")
    ) {
      const shapeIris = await referencedShapeIris();
      const graph = frontmatterToGraph(data, config, { fileId: route });
      const subjects = [
        ...graph.match(null, namedNode(RDF_TYPE), namedNode(SH + "NodeShape")),
      ].map((quad) => quad.subject.value);
      if (!subjects.some((iri) => shapeIris.has(iri))) {
        const findings = new Findings(route);
        findings.add(
          "sh:targetClass",
          "this node shape has no target (sh:targetClass, sh:targetNode, " +
            "sh:targetSubjectsOf, sh:targetObjectsOf) and no other shape " +
            "references it, so it validates nothing (SHACL §2.1).",
        );
        for (const message of findings.messages) {
          unused.push({ message, path: filePath, route });
        }
      }
    }
  }

  const rdf = await lintRdfShapes(
    config,
    fileFilter,
    options.filePaths ?? null,
    { definitions: lintDefinitions, unused: lintUnused },
    referencedShapeIris,
  );
  definitions.push(...rdf.definitions);
  unused.push(...rdf.unused);
  return { definitions, unused };
}

// ---------------------------------------------------------------------------
// RDF sources: ` ```turtle ` blocks and RDF data files (#342)
// ---------------------------------------------------------------------------

/** One source's triples, indexed by subject and by object. */
class TripleIndex {
  readonly bySubject = new Map<string, Quad[]>();
  readonly byObject = new Map<string, Quad[]>();

  constructor(readonly quads: readonly Quad[]) {
    for (const item of quads) {
      push(this.bySubject, termKey(item.subject), item);
      push(this.byObject, termKey(item.object), item);
    }
  }

  out(node: Term): Quad[] {
    return this.bySubject.get(termKey(node)) ?? [];
  }

  incoming(node: Term): Quad[] {
    return this.byObject.get(termKey(node)) ?? [];
  }

  values(node: Term, predicate: string): Term[] {
    return this.out(node)
      .filter((item) => item.predicate.value === predicate)
      .map((item) => item.object);
  }

  /** The members of the RDF list at `node`, or `null` if it is not one. */
  list(node: Term): Term[] | null {
    if (node.termType === "NamedNode" && node.value === RDF_NIL) return [];
    if (node.termType !== "BlankNode") return null;
    const members: Term[] = [];
    const seen = new Set<string>();
    let cell: Term = node;
    while (cell.termType === "BlankNode" && !seen.has(cell.value)) {
      seen.add(cell.value);
      const first = this.values(cell, RDF_FIRST);
      const rest = this.values(cell, RDF_REST);
      if (first.length !== 1 || rest.length !== 1) return null;
      members.push(first[0]!);
      cell = rest[0]!;
    }
    return cell.termType === "NamedNode" && cell.value === RDF_NIL
      ? members
      : null;
  }
}

function push(map: Map<string, Quad[]>, key: string, item: Quad): void {
  const list = map.get(key);
  if (list === undefined) map.set(key, [item]);
  else list.push(item);
}

/** `prefix:local` for an IRI under a declared namespace, else `<iri>`. */
function compactIri(iri: string, context: Context): string {
  let best: [string, string] | null = null;
  for (const [prefix, namespace] of context.namespaces) {
    if (
      namespace !== "" && iri.startsWith(namespace) &&
      (best === null || namespace.length > best[1].length)
    ) {
      best = [prefix, namespace];
    }
  }
  if (best === null && iri.startsWith(SH)) return `sh:${iri.slice(SH.length)}`;
  return best === null ? `<${iri}>` : `${best[0]}:${iri.slice(best[1].length)}`;
}

function describeTerm(term: Term, context: Context): string {
  if (term.termType === "NamedNode") return compactIri(term.value, context);
  if (term.termType === "Literal") return JSON.stringify(term.value);
  return "[ ]";
}

/**
 * Where a node sits, for a message: an IRI as itself, a blank node as the
 * chain of triples that reaches it from a named node, e.g.
 * `ex:PersonShape sh:property [ ] sh:path`.
 */
function locate(node: Term, index: TripleIndex, context: Context): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  let current: Term = node;
  while (current.termType === "BlankNode" && !seen.has(current.value)) {
    seen.add(current.value);
    const parent = index.incoming(current)[0];
    if (parent === undefined) break;
    if (parent.predicate.value !== RDF_REST) {
      parts.unshift(
        parent.predicate.value === RDF_FIRST
          ? "( )"
          : `${compactIri(parent.predicate.value, context)} [ ]`,
      );
    }
    current = parent.subject;
  }
  parts.unshift(
    current.termType === "BlankNode" ? "[ ]" : describeTerm(current, context),
  );
  return parts.join(" ");
}

/** Collects one source's findings, each prefixed with the source. */
class SourceFindings {
  readonly messages: string[] = [];
  constructor(
    readonly label: string,
    readonly index: TripleIndex,
    readonly context: Context,
  ) {}

  add(node: Term, predicate: string | null, message: string): void {
    const at = locate(node, this.index, this.context) +
      (predicate === null ? "" : ` ${compactIri(predicate, this.context)}`);
    this.messages.push(`In ${this.label}: ${at}: ${message}`);
  }
}

/** Lint a property path value (§2.3.1). */
function lintPathTerm(
  node: Term,
  holder: Term,
  predicate: string,
  findings: SourceFindings,
  seen: Set<string> = new Set(),
): void {
  const { index } = findings;
  if (node.termType === "NamedNode") return;
  if (node.termType !== "BlankNode") {
    findings.add(
      holder,
      predicate,
      `${describeTerm(node, findings.context)} is not an IRI, so it is not a ` +
        "property path (SHACL §2.3.1).",
    );
    return;
  }
  if (seen.has(node.value)) return;
  seen.add(node.value);

  const members = index.list(node);
  if (members !== null) {
    if (members.length < 2) {
      findings.add(
        holder,
        predicate,
        "a sequence path is a list of at least two paths (SHACL §2.3.1.1).",
      );
    }
    for (const member of members) {
      lintPathTerm(member, holder, predicate, findings, seen);
    }
    return;
  }

  const out = index.out(node);
  const forms = out.filter((item) => {
    const local = shLocal(item.predicate.value);
    return local !== null && PATH_FORMS.has(local);
  });
  if (forms.length !== 1 || out.length !== 1) {
    findings.add(
      holder,
      predicate,
      "a complex path is a blank node with exactly one triple, whose " +
        "predicate is one of sh:inversePath, sh:alternativePath, " +
        "sh:zeroOrMorePath, sh:oneOrMorePath, or sh:zeroOrOnePath " +
        "(SHACL §2.3.1).",
    );
  }
  for (const item of forms) {
    if (shLocal(item.predicate.value) === "alternativePath") {
      const alternatives = index.list(item.object);
      if (alternatives === null || alternatives.length < 2) {
        findings.add(
          node,
          item.predicate.value,
          "sh:alternativePath takes a list of at least two paths " +
            "(SHACL §2.3.1.3).",
        );
      }
      for (const member of alternatives ?? []) {
        lintPathTerm(member, node, item.predicate.value, findings, seen);
      }
    } else {
      lintPathTerm(item.object, node, item.predicate.value, findings, seen);
    }
  }
}

/** Lint one RDF source's shapes: the same SHACL Core rules as frontmatter. */
async function lintSource(
  index: TripleIndex,
  findings: SourceFindings,
  unused: SourceFindings | null,
  referenced: () => Promise<Set<string>>,
): Promise<void> {
  const typed = (local: string) =>
    index.quads
      .filter((item) =>
        item.predicate.value === RDF_TYPE && item.object.value === SH + local
      )
      .map((item) => item.subject);
  const objectsOf = (local: string) =>
    index.quads
      .filter((item) => item.predicate.value === SH + local)
      .map((item) => item.object);
  // A shape this source only references, by IRI, is defined (and linted)
  // wherever its own triples are.
  const defined = (node: Term) =>
    node.termType === "BlankNode" || index.out(node).length > 0;

  // Vocabulary.
  for (const item of index.quads) {
    const predicate = shLocal(item.predicate.value);
    if (predicate !== null && !SHACL_PROPERTIES.has(predicate)) {
      findings.add(
        item.subject,
        item.predicate.value,
        `sh:${predicate} is not a property of the SHACL vocabulary.`,
      );
    }
    for (const term of [item.subject, item.object]) {
      if (term.termType !== "NamedNode") continue;
      const local = shLocal(term.value);
      if (local !== null && !isShaclTerm(local)) {
        findings.add(
          item.subject,
          item.predicate.value,
          `sh:${local} is not a term of the SHACL vocabulary.`,
        );
      }
    }
  }

  // Property shapes need exactly one sh:path (§2.3); node shapes have none
  // (§2.2, and §4.7.1 for the values of sh:node).
  const propertyShapes = new Map<string, Term>();
  for (const node of [...typed("PropertyShape"), ...objectsOf("property")]) {
    if (defined(node)) propertyShapes.set(termKey(node), node);
  }
  for (const node of propertyShapes.values()) {
    const paths = index.values(node, SH + "path");
    if (paths.length !== 1) {
      findings.add(
        node,
        null,
        `a property shape needs exactly one sh:path, found ${paths.length} ` +
          "(SHACL §2.3).",
      );
    }
  }
  const nodeShapes = new Map<string, Term>();
  for (const node of [...typed("NodeShape"), ...objectsOf("node")]) {
    if (defined(node) && !propertyShapes.has(termKey(node))) {
      nodeShapes.set(termKey(node), node);
    }
  }
  for (const node of nodeShapes.values()) {
    if (index.values(node, SH + "path").length > 0) {
      findings.add(
        node,
        SH + "path",
        "a node shape cannot have sh:path (SHACL §2.2); put a path " +
          "constraint in a property shape under sh:property.",
      );
    }
  }

  // Paths, IRI-valued parameters, and sh:nodeKind.
  for (const item of index.quads) {
    const local = shLocal(item.predicate.value);
    if (local === null) continue;
    if (local === "path") {
      lintPathTerm(item.object, item.subject, item.predicate.value, findings);
    } else if (local === "ignoredProperties") {
      const members = index.list(item.object);
      if (members === null) {
        findings.add(
          item.subject,
          item.predicate.value,
          "sh:ignoredProperties takes a list of IRIs (SHACL §4.8.1).",
        );
      }
      for (const member of members ?? []) {
        if (member.termType !== "NamedNode") {
          findings.add(
            item.subject,
            item.predicate.value,
            `${
              describeTerm(member, findings.context)
            } is not an IRI (SHACL §4.8.1).`,
          );
        }
      }
    } else if (IRI_VALUED.has(local) && item.object.termType !== "NamedNode") {
      findings.add(
        item.subject,
        item.predicate.value,
        `${
          describeTerm(item.object, findings.context)
        } is not an IRI; sh:${local} takes an IRI.`,
      );
    } else if (
      local === "nodeKind" &&
      !(item.object.termType === "NamedNode" &&
        NODE_KINDS.has(shLocal(item.object.value) ?? ""))
    ) {
      findings.add(
        item.subject,
        item.predicate.value,
        `${
          describeTerm(item.object, findings.context)
        } is not one of the six node kinds (SHACL §4.1.3).`,
      );
    }
  }

  if (unused === null) return;
  for (const node of nodeShapes.values()) {
    if (
      index.values(node, RDF_TYPE).every((t) => t.value !== SH + "NodeShape")
    ) {
      continue;
    }
    const predicates = new Set(
      index.out(node).map((item) => item.predicate.value),
    );
    if ([...TARGETS].some((local) => predicates.has(SH + local))) continue;
    const types = new Set(index.values(node, RDF_TYPE).map((t) => t.value));
    if (types.has(RDFS + "Class") || types.has(OWL + "Class")) continue;
    const isReferenced = node.termType === "BlankNode"
      ? index.incoming(node).length > 0
      : (await referenced()).has(node.value);
    if (!isReferenced) {
      unused.add(
        node,
        null,
        "this node shape has no target (sh:targetClass, sh:targetNode, " +
          "sh:targetSubjectsOf, sh:targetObjectsOf) and no other shape " +
          "references it, so it validates nothing (SHACL §2.1).",
      );
    }
  }
}

/** Whether a triple touches the SHACL namespace at all. */
function isShaclRelevant(item: Quad): boolean {
  return [item.subject, item.predicate, item.object].some((term) =>
    term.termType === "NamedNode" && term.value.startsWith(SH)
  );
}

/**
 * Lint the shapes written in RDF rather than frontmatter: ` ```turtle `
 * blocks and RDF data files under `wiki.input`. Findings name the source and
 * the shape (an IRI, or the triples that reach a blank node from one), since
 * there is no frontmatter key to point at.
 */
async function lintRdfShapes(
  config: Config,
  fileFilter: ReadonlySet<string> | null,
  filePaths: readonly string[] | null,
  lint: { readonly definitions: boolean; readonly unused: boolean },
  referenced: () => Promise<Set<string>>,
): Promise<ShapeLintResult> {
  const definitions: IssueDetail[] = [];
  const unused: IssueDetail[] = [];
  const scoped = filePaths === null
    ? null
    : new Set(filePaths.map((path) => resolve(path)));
  for (const source of await rdfSources(config)) {
    if (scoped !== null && !scoped.has(resolve(source.path))) continue;
    if (
      fileFilter !== null &&
      (source.route === null || !fileFilter.has(source.route))
    ) continue;
    if (!source.quads.some(isShaclRelevant)) continue;
    const label = source.route === null
      ? config.relativeToRoot(source.path)
      : `${source.route} (turtle block ${source.block})`;
    const index = new TripleIndex(source.quads);
    const findings = new SourceFindings(label, index, config.context);
    const unusedFindings = lint.unused
      ? new SourceFindings(label, index, config.context)
      : null;
    await lintSource(index, findings, unusedFindings, referenced);
    const detail = (message: string): IssueDetail => ({
      message,
      path: source.path,
      route: source.route,
    });
    if (lint.definitions) definitions.push(...findings.messages.map(detail));
    if (unusedFindings !== null) {
      unused.push(...unusedFindings.messages.map(detail));
    }
  }
  return { definitions, unused };
}
