import { parseTurtleQuads } from "@wazoo/sparql-engine";
import env from "@zazuko/env-node";
import { Readable } from "node:stream";
import { Writer } from "n3";
import type { Quad } from "@rdfjs/types";
import {
  mediaTypeFor,
  normalizeFormat,
  UnsupportedFormatError,
} from "./formats.ts";
import { serializeNquads, serializeNt } from "./serialize_terms.ts";

// ---------------------------------------------------------------------------
// Parsing and serializing
// ---------------------------------------------------------------------------

/**
 * Parse Turtle with the store's own parser.
 *
 * Used for ` ```turtle ` blocks and `.ttl` files so a block parses exactly as
 * the query engine would see it. The other formats go through the registry
 * below: the store's parser also accepts TriG, N-Triples, and N-Quads, but
 * routing only the Turtle path through it is deliberate.
 */
export function parseTurtle(text: string): Quad[] {
  return parseTurtleQuads(text) as unknown as Quad[];
}

/** Parse RDF in any registered format. */
export async function parseRdf(text: string, format: string): Promise<Quad[]> {
  const normalized = normalizeFormat(format);
  const parser = env.formats.parsers.get(mediaTypeFor(normalized));
  if (parser === undefined) throw new UnsupportedFormatError(format, "parse");
  // rdf-parse takes a Node Readable, which the RDF/JS `Stream` type does not
  // describe; the cast names the parameter type instead of erasing it.
  const stream = parser.import(
    Readable.from([text]) as unknown as Parameters<typeof parser.import>[0],
  );
  if (stream === null) throw new UnsupportedFormatError(format, "parse");
  const dataset = await env.dataset().import(stream);
  return [...dataset] as unknown as Quad[];
}

/**
 * Prefix bindings a serializer may abbreviate IRIs with.
 *
 * Both shapes are accepted because `Context.namespaces` is a `Map` and
 * `Record` is what a caller writes inline; the dispatch is on `Symbol.iterator`
 * rather than `instanceof Map`, which does not narrow a `ReadonlyMap`.
 */
export type PrefixTable =
  | ReadonlyMap<string, string>
  | Readonly<Record<string, string>>;

function prefixObject(
  prefixes: PrefixTable | undefined,
): Record<string, string> {
  if (prefixes === undefined) return {};
  const iterable = prefixes as Iterable<readonly [string, string]>;
  if (typeof iterable[Symbol.iterator] === "function") {
    return Object.fromEntries(iterable);
  }
  return { ...(prefixes as Readonly<Record<string, string>>) };
}

/**
 * Serialize triples in any format the engine can write.
 *
 * Always consulted instead of a library's own `serialize`, because a miss there
 * is silent (see the module doc). A deferred or unsupported format raises.
 */
export async function serializeRdf(
  quads: readonly Quad[],
  format: string,
  options: { prefixes?: PrefixTable } = {},
): Promise<string> {
  const normalized = normalizeFormat(format);
  if (normalized === "nt") return serializeNt(quads);
  if (normalized === "nquads") return serializeNquads(quads);
  if (normalized === "xml") throw new UnsupportedFormatError(format);

  if (normalized === "json-ld") {
    if (env.formats.serializers.get(mediaTypeFor(normalized)) === undefined) {
      throw new UnsupportedFormatError(format);
    }
    return await env.dataset(quads as Quad[])
      .serialize({ format: mediaTypeFor(normalized) as never });
  }

  // Turtle, N3 and TriG: n3.js, because the registry's Turtle writer emits
  // N-Triples under a Turtle media type.
  return await new Promise<string>((resolve, reject) => {
    const writer = new Writer({
      format: normalized === "trig"
        ? "TriG"
        : normalized === "n3"
        ? "N3"
        : "Turtle",
      prefixes: prefixObject(options.prefixes),
    });
    writer.addQuads(quads as never[]);
    writer.end((error: Error | null, result: string) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
}
