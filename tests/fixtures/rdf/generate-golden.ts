import {
  literal,
  namedNode,
  serializeNquads,
  serializeNt,
  triple,
} from "../../../src/wiki/rdf.ts";

interface TermSpec {
  readonly iri?: string;
  readonly literal?: string;
  readonly lang?: string;
  readonly datatype?: string;
}

interface TripleSpec {
  readonly s: TermSpec;
  readonly p: string;
  readonly o: TermSpec;
}

function termOf(spec: TermSpec) {
  if (spec.iri !== undefined) return namedNode(spec.iri);
  if (spec.datatype !== undefined) {
    return literal(spec.literal ?? "", { datatype: spec.datatype });
  }
  if (spec.lang !== undefined) {
    return literal(spec.literal ?? "", { language: spec.lang });
  }
  return literal(spec.literal ?? "");
}

function stableStatements(statements: readonly string[]): string {
  const sorted = [...statements].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0
  );
  return sorted.length === 0 ? "" : `${sorted.join("\n")}\n`;
}

const fixtureUrl = new URL("./", import.meta.url);
const fixture = JSON.parse(
  Deno.readTextFileSync(new URL("terms.json", fixtureUrl)),
) as { triples: TripleSpec[] };
const quads = fixture.triples.map((item) =>
  triple(termOf(item.s), namedNode(item.p), termOf(item.o))
);

const nt = stableStatements(quads.map((quad) => serializeNt([quad]).trimEnd()));
const nquads = stableStatements(
  quads.map((quad) => serializeNquads([quad]).trimEnd()),
);

await Deno.writeTextFile(new URL("oracle-nt.txt", fixtureUrl), nt);
await Deno.writeTextFile(new URL("oracle-nquads.txt", fixtureUrl), nquads);

console.log(`wrote ${quads.length} triples to ${fixtureUrl.pathname}`);
