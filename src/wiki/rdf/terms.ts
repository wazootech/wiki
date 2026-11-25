import { dataFactory } from "@wazoo/sparql-engine";
import type { BlankNode, Literal, NamedNode, Quad, Term } from "@rdfjs/types";

/** The RDF, RDFS, and XSD vocabularies the loaders need. */
export const RDF_NS = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
export const XSD_NS = "http://www.w3.org/2001/XMLSchema#";
export const RDF_TYPE = `${RDF_NS}type`;
export const RDF_FIRST = `${RDF_NS}first`;
export const RDF_REST = `${RDF_NS}rest`;
export const RDF_NIL = `${RDF_NS}nil`;
export const XSD_STRING = `${XSD_NS}string`;
export const XSD_BOOLEAN = `${XSD_NS}boolean`;
export const XSD_INTEGER = `${XSD_NS}integer`;
export const XSD_DECIMAL = `${XSD_NS}decimal`;
export const XSD_DOUBLE = `${XSD_NS}double`;
export const XSD_DATETIME = `${XSD_NS}dateTime`;
export const XSD_DATE = `${XSD_NS}date`;

/** The RDF/JS data factory the whole port builds terms with. */
export const factory = dataFactory;

/** A node that can be a subject or object. */
export function namedNode(iri: string): NamedNode {
  return dataFactory.namedNode(iri);
}

/** A blank node, optionally with a stable label. */
export function blankNode(label?: string): BlankNode {
  return label === undefined
    ? dataFactory.blankNode()
    : dataFactory.blankNode(label);
}

/** Options for {@link literal}: at most one of `language` and `datatype`. */
export interface LiteralOptions {
  readonly language?: string;
  readonly datatype?: string;
}

/**
 * A literal.
 *
 * RDF/JS gives every literal a datatype (`xsd:string` by default), while
 * rdflib distinguishes a "plain" literal from an `xsd:string`-typed one. The
 * distinction survives: the unit tests compare against rdflib's own output, and
 * both encoders below treat `xsd:string` as suffix-free, which is what makes
 * them agree.
 */
export function literal(value: string, options: LiteralOptions = {}): Literal {
  if (options.language !== undefined) {
    return dataFactory.literal(value, options.language);
  }
  if (options.datatype !== undefined) {
    return dataFactory.literal(value, dataFactory.namedNode(options.datatype));
  }
  return dataFactory.literal(value);
}

/** Build a triple. */
export function triple(
  subject: Term,
  predicate: NamedNode,
  object: Term,
): Quad {
  return dataFactory.quad(subject, predicate, object);
}

/** Build a quad in a named graph. */
export function quad(
  subject: Term,
  predicate: NamedNode,
  object: Term,
  graph: NamedNode,
): Quad {
  return dataFactory.quad(subject, predicate, object, graph);
}
