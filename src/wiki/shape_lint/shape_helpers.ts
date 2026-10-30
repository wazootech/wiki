import type { Config } from "../config.ts";
import { type Context, SH } from "../context.ts";
import { effectiveTypes } from "../graph.ts";
import type { DataRecord } from "../parser.ts";
import { namedNode, RDF_FIRST, RDF_REST, type RdfGraph } from "../rdf.ts";
import {
  keyIri,
  SHAPE_LISTS,
  SHAPE_VALUED,
  shLocal,
  TARGETS,
  valueIri,
} from "./terms.ts";

/** The shape IRIs that other shapes reach through a shape-valued parameter. */
export function referencedShapes(graph: RdfGraph): Set<string> {
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
export function typeIris(data: DataRecord, config: Config): Set<string> {
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
export function hasTarget(data: DataRecord, context: Context): boolean {
  return Object.keys(data).some((key) => {
    const local = shLocal(keyIri(key, context));
    return local !== null && TARGETS.has(local);
  });
}
