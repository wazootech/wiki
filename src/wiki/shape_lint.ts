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
import { OWL, RDFS, SH } from "./context.ts";
import { ValueError } from "./errors.ts";
import { frontmatterToGraph, loadGraph } from "./graph.ts";
import { documentDataFromPath } from "./parser.ts";
import { iterDocumentFiles, routeForDocumentFile } from "./paths.ts";
import { namedNode, RDF_TYPE } from "./rdf.ts";
import type { IssueDetail } from "./schemas/reports.ts";
import { Findings, isShaclTerm, shLocal } from "./shape_lint/terms.ts";
import { lintShape } from "./shape_lint/shape.ts";
import {
  hasTarget,
  referencedShapes,
  typeIris,
} from "./shape_lint/shape_helpers.ts";
import {
  lintRdfShapes,
  type ShapeLintResult,
} from "./shape_lint/rdf_shapes.ts";

export { type ShapeLintResult } from "./shape_lint/rdf_shapes.ts";

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
