/**
 * Probe: what does the swap stack actually cover for RDF *input and output*?
 *
 * The plan swaps `rdflib` for `@wazoo/sparql-engine`, which the reasoning spike
 * verified for stores, term semantics, and SPARQL evaluation. But the engine
 * also uses rdflib as an IO library, in ways a SPARQL engine need not offer:
 *
 * - parse: Turtle and TriG (`.ttl`/`.trig`, plus ```turtle blocks in pages),
 *   N-Triples and N-Quads (the disk cache the engine writes and reads),
 *   RDF/XML and JSON-LD (`.rdf`/`.xml`/`.jsonld` files in a wiki tree).
 * - serialize: N-Triples and N-Quads (that same cache — a *contract*, since the
 *   file is reused across processes), Turtle/N3/XML/JSON-LD for `export` and
 *   the serve metadata views, and JSON-LD twice over (expanded, and compacted
 *   against the wiki's own prefix table).
 *
 * Run: deno run --allow-read --allow-write --allow-run --config deno.json probe.ts
 */

import { Readable } from "node:stream";
import { dataFactory, parseTurtleQuads, termKey } from "@wazoo/sparql-engine";
// `@zazuko/env` alone registers **no** parsers or serializers, and a missing
// serializer is not an error: `dataset.serialize` silently returns canonical
// N-Quads. The Node flavour is what registers rdf-parse / rdf-serialize.
import rdf from "@zazuko/env-node";
import type { Quad, Term } from "@rdfjs/types";

/** One triple in the shared fixture. */
interface Triple {
  readonly s: TermSpec;
  readonly p: string;
  readonly o: TermSpec;
}

interface TermSpec {
  readonly iri?: string;
  readonly blank?: boolean;
  readonly literal?: string;
  readonly lang?: string;
  readonly datatype?: string;
}

const fixture: Triple[] =
  JSON.parse(await Deno.readTextFile(new URL("./graph.json", import.meta.url)))[0].triples;

/** Blank nodes are per-spec, so the same spec yields the same node twice. */
const blanks = new Map<TermSpec, Term>();

function term(spec: TermSpec): Term {
  if (spec.iri !== undefined) return dataFactory.namedNode(spec.iri);
  if (spec.blank === true) {
    let node = blanks.get(spec);
    if (node === undefined) {
      node = dataFactory.blankNode();
      blanks.set(spec, node);
    }
    return node;
  }
  if (spec.datatype !== undefined) {
    return dataFactory.literal(spec.literal ?? "", dataFactory.namedNode(spec.datatype));
  }
  if (spec.lang !== undefined) return dataFactory.literal(spec.literal ?? "", spec.lang);
  return dataFactory.literal(spec.literal ?? "");
}

const quads: Quad[] = fixture.map((triple) =>
  dataFactory.quad(term(triple.s), dataFactory.namedNode(triple.p), term(triple.o))
);

const outDir = new URL("./deno/", import.meta.url);
await Deno.mkdir(outDir, { recursive: true });

type Attempt = { ok: boolean; bytes?: number; error?: string };

const report: Record<string, unknown> = {};

// --- 0. What is even registered? ------------------------------------------

report["registered parsers"] = [...rdf.formats.parsers.keys()];
report["registered serializers"] = [...rdf.formats.serializers.keys()];

// --- 1. Parsing -----------------------------------------------------------

const inputs: Record<string, string> = {
  "text/turtle": "<https://example.org/a> <https://schema.org/name> \"caf\u00e9\" .\n",
  "application/trig":
    "<https://example.org/g> { <https://example.org/a> <https://schema.org/name> \"x\" . }\n",
  "application/n-triples": "<https://example.org/a> <https://schema.org/name> \"x\" .\n",
  "application/n-quads":
    "<https://example.org/a> <https://schema.org/name> \"x\" <https://example.org/g> .\n",
  "application/rdf+xml": `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:schema="https://schema.org/">
  <rdf:Description rdf:about="https://example.org/a"><schema:name>x</schema:name></rdf:Description>
</rdf:RDF>
`,
  "application/ld+json": JSON.stringify([{
    "@id": "https://example.org/a",
    "https://schema.org/name": [{ "@value": "x" }],
  }]),
};

// The store's own parser, which the port uses for ```turtle blocks and `.ttl`.
const storeParse: Record<string, Attempt> = {};
for (const [mediaType, text] of Object.entries(inputs)) {
  if (mediaType !== "text/turtle" && mediaType !== "application/n-triples") continue;
  try {
    const parsed = parseTurtleQuads(text);
    storeParse[mediaType] = { ok: true, bytes: parsed.length };
  } catch (error) {
    storeParse[mediaType] = { ok: false, error: String(error).slice(0, 120) };
  }
}
report["parse @wazoo/sparql-engine/parser"] = storeParse;

// `@zazuko/env` registers every rdf-parse parser, which is the candidate for
// the formats the store does not handle.
const envParse: Record<string, Attempt> = {};
for (const [mediaType, text] of Object.entries(inputs)) {
  try {
    const stream = rdf.formats.parsers.import(
      mediaType,
      // deno-lint-ignore no-explicit-any -- rdf-parse expects a Node Readable
      Readable.from([text]) as any,
    );
    if (stream === null) throw new Error("no parser registered for this media type");
    const parsed = await rdf.dataset().import(stream);
    envParse[mediaType] = { ok: true, bytes: [...parsed].length };
  } catch (error) {
    envParse[mediaType] = { ok: false, error: String(error).slice(0, 120) };
  }
}
report["parse @zazuko/env (rdf-parse)"] = envParse;

// --- 2. Serialization -----------------------------------------------------

const dataset = rdf.dataset(quads);
const mediaTypes: Record<string, string> = {
  "nt": "application/n-triples",
  "nquads": "application/n-quads",
  "turtle": "text/turtle",
  "n3": "text/n3",
  "trig": "application/trig",
  "xml": "application/rdf+xml",
  "json-ld": "application/ld+json",
};

for (const [name, format] of Object.entries(mediaTypes)) {
  try {
    // `format` must be a *media type*: an unknown value silently yields
    // canonical N-Quads rather than raising, which is worth knowing before a
    // typo ships.
    const text = await dataset.serialize({ format: format as never });
    await Deno.writeTextFile(new URL(`${name}.txt`, outDir), text);
    report[`serialize ${name}`] = {
      ok: true,
      bytes: text.length,
      canonicalNQuadsFallback: text === dataset.toCanonical(),
    };
  } catch (error) {
    report[`serialize ${name}`] = { ok: false, error: String(error).slice(0, 160) };
  }
}

// A short-name call, to demonstrate the silent fallback.
const shortName = await dataset.serialize({ format: "turtle" as never });
report["serialize short name 'turtle'"] = {
  bytes: shortName.length,
  canonicalNQuadsFallback: shortName === dataset.toCanonical(),
};

// The engine's N-Quads *writer* is hand-rolled over `term.n3()`, so the port
// needs an equivalent: a term-to-N-Triples rendering that is byte-identical.
const handwritten = quads
  .map((quad) => `${n3(quad.subject)} ${n3(quad.predicate)} ${n3(quad.object)} .`)
  .join("\n") + "\n";
await Deno.writeTextFile(new URL("nquads-handwritten.txt", outDir), handwritten);
report["serialize nquads (hand-rolled n3())"] = { ok: true, bytes: handwritten.length };

// --- 3. Which formats have no serializer at all? --------------------------

report["serializer coverage"] = Object.fromEntries(
  Object.entries(mediaTypes).map(([name, format]) => [
    name,
    rdf.formats.serializers.get(format) === undefined ? "MISSING" : "present",
  ]),
);

// --- 4. Round-trip of the cache dialect -----------------------------------

for (const name of ["nt", "nquads-handwritten"]) {
  const text = await Deno.readTextFile(new URL(`${name}.txt`, outDir));
  try {
    const reparsed = parseTurtleQuads(text);
    report[`round-trip ${name} -> store`] = { ok: true, bytes: reparsed.length };
  } catch (error) {
    report[`round-trip ${name} -> store`] = { ok: false, error: String(error).slice(0, 160) };
  }
}

report["fixture"] = { quads: quads.length, distinct: new Set(quads.map(termKey)).size };

console.log(JSON.stringify(report, null, 2));

/**
 * A stand-in for rdflib's `term.n3()`.
 *
 * rdflib renders every term with `n3()`, and the engine's hand-rolled N-Quads
 * writer depends on the escaping it produces. This says whether the RDF/JS
 * terms carry enough information to reproduce it without a library.
 */
function n3(node: Term): string {
  switch (node.termType) {
    case "NamedNode":
      return `<${node.value}>`;
    case "BlankNode":
      return `_:${node.value}`;
    case "Literal": {
      const value = node.value
        .replaceAll("\\", "\\\\")
        .replaceAll('"', '\\"')
        .replaceAll("\n", "\\n")
        .replaceAll("\r", "\\r")
        .replaceAll("\t", "\\t");
      const language = node.language;
      const datatype = node.datatype.value;
      if (language !== "") return `"${value}"@${language}`;
      if (datatype !== "http://www.w3.org/2001/XMLSchema#string") {
        return `"${value}"^^<${datatype}>`;
      }
      return `"${value}"`;
    }
    default:
      return `<${node.value}>`;
  }
}
