import { OWL, RDFS, SH } from "../context.ts";
import { RDF_TYPE, type Term, termKey } from "../rdf.ts";
import { SHACL_PROPERTIES } from "./shacl_properties.ts";
import {
  IRI_VALUED,
  isShaclTerm,
  NODE_KINDS,
  shLocal,
  TARGETS,
} from "./terms.ts";
import {
  describeTerm,
  type SourceFindings,
  type TripleIndex,
} from "./triples.ts";
import { lintPathTerm } from "./source_path.ts";

/** Lint one RDF source's shapes: the same SHACL Core rules as frontmatter. */
export async function lintSource(
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
