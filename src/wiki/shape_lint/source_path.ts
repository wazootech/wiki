import { SH } from "../context.ts";
import type { Quad, Term } from "../rdf.ts";
import { PATH_FORMS, shLocal } from "./terms.ts";
import { describeTerm, type SourceFindings } from "./triples.ts";

/** Lint a property path value (§2.3.1). */
export function lintPathTerm(
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

/** Whether a triple touches the SHACL namespace at all. */
export function isShaclRelevant(item: Quad): boolean {
  return [item.subject, item.predicate, item.object].some((term) =>
    term.termType === "NamedNode" && term.value.startsWith(SH)
  );
}
