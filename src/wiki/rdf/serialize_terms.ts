import type { Literal, Quad, Term } from "@rdfjs/types";
import { XSD_STRING } from "./terms.ts";

// ---------------------------------------------------------------------------
// Term rendering
// ---------------------------------------------------------------------------

/** Escape a string for N-Triples, copying rdflib's `NTSerializer._quote_encode`. */
function quoteLiteralNt(value: string): string {
  return `"${
    value
      .replaceAll("\\", "\\\\")
      .replaceAll("\n", "\\n")
      .replaceAll('"', '\\"')
      .replaceAll("\r", "\\r")
  }"`;
}

/** The datatype suffix rdflib writes, or `""` for a plain literal. */
function literalSuffix(node: Literal): string {
  const language = node.language;
  if (language !== "") return `@${language}`;
  const datatype = node.datatype.value;
  if (datatype === XSD_STRING) return "";
  return `^^<${datatype}>`;
}

/**
 * Render a term the way rdflib's `NTSerializer` does.
 *
 * Tabs and other control characters are left raw, on purpose: rdflib does not
 * escape them, and the disk cache is compared against rdflib's own output.
 */
export function ntTerm(node: Term): string {
  switch (node.termType) {
    case "NamedNode":
      return `<${node.value}>`;
    case "BlankNode":
      return `_:${node.value}`;
    case "Literal":
      return `${quoteLiteralNt(node.value)}${literalSuffix(node)}`;
    default:
      return `<${node.value}>`;
  }
}

/**
 * Render a literal the way rdflib's `Literal.n3()` does.
 *
 * The difference from {@link ntTerm} is the whole point of having both: a value
 * containing a newline is written triple-quoted with the newline left raw, so
 * the rendered string spans lines. `format.py`'s N-Quads writer is built on
 * `n3()`, so its output has that shape.
 */
export function n3Term(node: Term): string {
  switch (node.termType) {
    case "NamedNode":
      return `<${node.value}>`;
    case "BlankNode":
      return `_:${node.value}`;
    case "Literal":
      return `${quoteLiteralN3(node.value)}${literalSuffix(node)}`;
    default:
      return `<${node.value}>`;
  }
}

/** rdflib's `Literal._quote_encode`. */
function quoteLiteralN3(value: string): string {
  if (value.includes("\n")) {
    let encoded = value.replaceAll("\\", "\\\\");
    if (value.includes('"""')) encoded = encoded.replaceAll('"""', '\\"\\"\\"');
    // A trailing quote would otherwise read as the closing delimiter.
    if (encoded.endsWith('"') && !encoded.endsWith('\\"')) {
      encoded = `${encoded.slice(0, -1)}\\"`;
    }
    return `"""${encoded.replaceAll("\r", "\\r")}"""`;
  }
  return `"${
    value
      .replaceAll("\\", "\\\\")
      .replaceAll('"', '\\"')
      .replaceAll("\r", "\\r")
  }"`;
}

/**
 * Render triples as N-Triples, the way rdflib's `NTSerializer` does.
 *
 * This writes the `.wiki/cache/*.nt` file, so its bytes are the contract.
 */
export function serializeNt(quads: readonly Quad[]): string {
  return quads
    .map((item) =>
      `${ntTerm(item.subject)} ${ntTerm(item.predicate)} ${
        ntTerm(item.object)
      } .`
    )
    .join("\n") + (quads.length > 0 ? "\n" : "");
}

/**
 * Render triples as N-Quads, the way `format.py`'s hand-rolled writer does.
 *
 * That function is `f"{s.n3()} {p.n3()} {o.n3()} ."` per triple, so it is
 * N-Triples spelled with `n3()` — which is why a multi-line literal looks
 * different here than in {@link serializeNt}.
 */
export function serializeNquads(quads: readonly Quad[]): string {
  return quads
    .map((item) =>
      `${n3Term(item.subject)} ${n3Term(item.predicate)} ${
        n3Term(item.object)
      } .`
    )
    .join("\n") + (quads.length > 0 ? "\n" : "");
}

/**
 * Render a dataset as N-Quads, carrying each quad's graph.
 *
 * Distinct from {@link serializeNquads} on purpose: this is the *formal*
 * N-Quads dialect used for the `.wiki/cache/*.nq` file, whereas the engine's
 * `export --format nquads` path is the hand-rolled `n3()` writer above. Both
 * round-trip; only the export path has an oracle byte contract.
 */
export function serializeNquadsDataset(quads: readonly Quad[]): string {
  return quads
    .map((item) => {
      const graph = item.graph.termType === "DefaultGraph"
        ? ""
        : ` ${ntTerm(item.graph)}`;
      return `${ntTerm(item.subject)} ${ntTerm(item.predicate)} ${
        ntTerm(item.object)
      }${graph} .`;
    })
    .join("\n") + (quads.length > 0 ? "\n" : "");
}
