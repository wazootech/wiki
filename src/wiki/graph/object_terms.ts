import type { NamedNode, Term } from "../rdf.ts";
import {
  blankNode,
  literal,
  namedNode,
  RDF_FIRST,
  RDF_NIL,
  RDF_REST,
  RDF_TYPE,
  type RdfGraph,
  XSD_BOOLEAN,
} from "../rdf.ts";
import { WikiFloat } from "../scalars.ts";
import type { Context } from "../context.ts";
import { isRecord } from "../parser.ts";
import { describeText } from "../describe.ts";
import { logger } from "./descriptors.ts";
import {
  expandCurie,
  isTruthy,
  numericLiteral,
  resolvePredicate,
  resolveType,
  SHACL_ALTERNATIVE_PATH,
  SHACL_LIST_PARAMETERS,
  SHACL_PATH_PARAMETERS,
  temporalLiteral,
} from "./terms.ts";

/** Add `value` as a property path: a list is a sequence path (SHACL §2.3.1.2). */
function addPath(
  pred: NamedNode,
  value: unknown,
  graph: RdfGraph,
  subject: Term,
  context: Context,
): void {
  if (!Array.isArray(value)) {
    addObject(pred, value, graph, subject, context);
    return;
  }
  const members = listMembers(value, pred);
  if (members.length === 0) {
    logger.warning(
      `Empty list for <${pred.value}> is not a SHACL path; skipped.`,
    );
  } else if (members.length === 1) {
    addPath(pred, members[0], graph, subject, context);
  } else {
    graph.add(subject, pred, rdfList(members, graph, context, true));
  }
}

/** A list's members without `null`s, warning that RDF has no null to keep. */
function listMembers(items: readonly unknown[], pred: NamedNode): unknown[] {
  const members = items.filter((item) => item !== null && item !== undefined);
  if (members.length !== items.length) {
    logger.warning(`Dropped null members from the list for <${pred.value}>.`);
  }
  return members;
}

/**
 * Build a SHACL list (`rdf:first`/`rdf:rest`, exactly one of each per cell)
 * and return its head. A list member that is itself a list becomes a nested
 * list, never repeated `rdf:first` triples; when `paths` is set, members are
 * property paths and follow {@link addPath}.
 */
function rdfList(
  members: readonly unknown[],
  graph: RdfGraph,
  context: Context,
  paths: boolean,
): Term {
  const first = namedNode(RDF_FIRST);
  let head: Term = namedNode(RDF_NIL);
  for (let index = members.length - 1; index >= 0; index--) {
    const cell = blankNode();
    const member = members[index];
    if (paths) {
      addPath(first, member, graph, cell, context);
    } else if (Array.isArray(member)) {
      const nested = listMembers(member, first);
      graph.add(cell, first, rdfList(nested, graph, context, false));
    } else {
      addObject(first, member, graph, cell, context);
    }
    graph.add(cell, namedNode(RDF_REST), head);
    head = cell;
  }
  return head;
}

/** Add a predicate-object pair, recursively handling nested structures. */
export function resolveObject(
  key: string,
  value: unknown,
  graph: RdfGraph,
  subject: Term,
  context: Context,
): void {
  const pred = resolvePredicate(key, context);
  if (pred === null) return;
  addObject(pred, value, graph, subject, context);
}

/** {@link resolveObject} once the key has resolved to a predicate. */
function addObject(
  pred: NamedNode,
  value: unknown,
  graph: RdfGraph,
  subject: Term,
  context: Context,
): void {
  // A list is one triple per item, at any depth: a list nested inside a list of
  // mappings must not fall through to the stringifying catch-all (wiki#305).
  // SHACL's list-valued parameters are the exception and become an RDF list.
  if (Array.isArray(value)) {
    if (SHACL_PATH_PARAMETERS.has(pred.value)) {
      addPath(pred, value, graph, subject, context);
    } else if (pred.value === SHACL_ALTERNATIVE_PATH) {
      const members = listMembers(value, pred);
      graph.add(subject, pred, rdfList(members, graph, context, true));
    } else if (SHACL_LIST_PARAMETERS.has(pred.value)) {
      const members = listMembers(value, pred);
      graph.add(subject, pred, rdfList(members, graph, context, false));
    } else {
      for (const item of value) addObject(pred, item, graph, subject, context);
    }
    return;
  }

  // A `Date` is an object in JavaScript but not a `dict` in Python, so it has to
  // be excluded from the mapping branch: otherwise `2026-05-30` becomes an
  // empty blank node and loses its datatype entirely.
  if (value instanceof Date) {
    graph.add(subject, pred, temporalLiteral(value));
    return;
  }

  // A `WikiFloat` is likewise an object (a `Number` subclass): unwrap it
  // before the mapping branch. Only the parser's float-lexical flag tells
  // `"30.0"^^xsd:double` apart from `"30"^^xsd:integer`.
  if (value instanceof WikiFloat) {
    graph.add(subject, pred, numericLiteral(value));
    return;
  }

  if (isRecord(value)) {
    if (isTruthy(value["@id"])) {
      let uri = String(value["@id"]);
      const expanded = uri.includes(":") ? expandCurie(uri, context) : null;
      if (expanded !== null) uri = expanded;
      graph.add(subject, pred, namedNode(uri));
    } else if ("@type" in value) {
      // A typed nested mapping is a *fresh* blank node, never a reuse of the
      // parent: sharing one is the wiki#144 collision between shape files.
      const blank = blankNode();
      graph.add(subject, pred, blank);
      const resolved = resolveType(value["@type"], context);
      if (resolved !== null) graph.add(blank, namedNode(RDF_TYPE), resolved);
      for (const [childKey, childValue] of Object.entries(value)) {
        if (childKey.startsWith("@")) continue;
        resolveObject(childKey, childValue, graph, blank, context);
      }
    } else {
      const blank = blankNode();
      graph.add(subject, pred, blank);
      for (const [childKey, childValue] of Object.entries(value)) {
        if (childKey.startsWith("@")) continue;
        resolveObject(childKey, childValue, graph, blank, context);
      }
    }
    return;
  }

  if (typeof value === "string") {
    if (value.startsWith("http")) {
      graph.add(subject, pred, namedNode(value));
    } else if (
      value.includes(":") && !value.includes(" ") && !value.includes("\n")
    ) {
      // A CURIE-ish string, but only a *known* prefix makes it a URI; anything
      // else stays a literal so `time: 9:30` does not invent a namespace.
      const expanded = expandCurie(value, context);
      if (expanded !== null) graph.add(subject, pred, namedNode(expanded));
      else graph.add(subject, pred, literal(value));
    } else {
      graph.add(subject, pred, literal(value));
    }
    return;
  }

  // Booleans before numbers: Python's `bool` is an `int` subclass, and
  // `isinstance(True, int)` is true, so the order in the oracle is load-bearing.
  if (typeof value === "boolean") {
    graph.add(
      subject,
      pred,
      literal(value ? "true" : "false", { datatype: XSD_BOOLEAN }),
    );
    return;
  }
  if (typeof value === "number") {
    graph.add(subject, pred, numericLiteral(value));
    return;
  }
  if (value !== null && value !== undefined) {
    graph.add(subject, pred, literal(describeText(value)));
  }
}
