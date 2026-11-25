/**
 * SHACL validation over `rdf-validate-shacl`.
 *
 * There is no Python module for this file: `audit.py` calls `pyshacl` inline,
 * and the cutover swaps that library for `rdf-validate-shacl`. Three things the
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

import type { Config } from "./config.ts";
import { frontmatterToGraph, loadGraph } from "./graph.ts";
import { deriveMetadata } from "./derived.ts";
import { documentDataFromPath } from "./parser.ts";
import { routeForDocumentFile } from "./paths.ts";
import type { RdfGraph } from "./rdf.ts";
import { loadShapes, loadWikiShapes } from "./shacl/shapes.ts";
import { type ShaclOutcome, validateShacl } from "./shacl/validate.ts";

export { formatReport } from "./shacl/report.ts";
export { loadShapes, loadWikiShapes } from "./shacl/shapes.ts";
export {
  namedSourceShapes,
  type ShaclOutcome,
  structuredResult,
  validateShacl,
} from "./shacl/validate.ts";

/**
 * Validate one document's metadata against the shapes the wiki declares.
 *
 * `null` means the document carries no metadata at all — a distinct outcome from
 * "conforms", and the reason `audit` reports `missing_metadata` for it.
 * `shapesGraph` defaults to {@link loadWikiShapes}; pass it when checking more
 * than one file, or each call rescans the whole corpus for the same shapes.
 */
export async function checkShaclFile(
  filePath: string,
  config: Config,
  shapesGraph?: RdfGraph,
): Promise<ShaclOutcome | null> {
  const data = documentDataFromPath(filePath);
  if (data === null || Object.keys(data).length === 0) return null;

  const shapes = shapesGraph ?? await loadWikiShapes(config);
  const dataGraph = frontmatterToGraph(data, config, {
    fileId: routeForDocumentFile(config, filePath),
    derived: await deriveMetadata(filePath),
  });

  return await validateShacl(dataGraph, shapes);
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
      results: [],
    };
  }

  return await validateShacl(dataGraph, shapesGraph);
}
