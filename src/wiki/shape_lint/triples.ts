import { type Context, SH } from "../context.ts";
import {
  type Quad,
  RDF_FIRST,
  RDF_NIL,
  RDF_REST,
  type Term,
  termKey,
} from "../rdf.ts";

// ---------------------------------------------------------------------------
// RDF sources: ` ```turtle ` blocks and RDF data files (#342)
// ---------------------------------------------------------------------------

/** One source's triples, indexed by subject and by object. */
export class TripleIndex {
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

export function describeTerm(term: Term, context: Context): string {
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
export class SourceFindings {
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
