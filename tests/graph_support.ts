import { dirname, join } from "@std/path";
import { assert, assertEquals } from "@std/assert";
import type { Context } from "../src/wiki/context.ts";
import { type LogRecord, setLogSink } from "../src/wiki/logging.ts";
import {
  namedNode,
  type Quad,
  RDF_FIRST,
  RDF_NIL,
  RDF_REST,
  type RdfGraph,
} from "../src/wiki/rdf.ts";
import { saveLockfile } from "../src/wiki/schemas/sources.ts";

export const SCHEMA = "https://schema.org/";
export const WIKI = "https://wiki.example.org/";
export const RDFS_SUBCLASS_OF =
  "http://www.w3.org/2000/01/rdf-schema#subClassOf";

/** Namespace helper: the prefix table is a `Map` in the port. */
export function ns(context: Context, prefix: string): string {
  const iri = context.namespaces.get(prefix);
  assert(iri !== undefined, `namespace ${prefix} is not bound`);
  return iri;
}

/** A unique temp directory, to be removed with {@link cleanup}. */
export function tempRoot(): string {
  return Deno.makeTempDirSync({ prefix: "wiki-graph-" });
}

export function cleanup(root: string): void {
  try {
    Deno.removeSync(root, { recursive: true });
  } catch {
    // Windows keeps a handle open long enough to lose this race occasionally.
  }
}

/** Write a file below `root`, creating parent directories. */
export function write(root: string, relative: string, content: string): string {
  const target = join(root, ...relative.split("/"));
  Deno.mkdirSync(dirname(target), { recursive: true });
  Deno.writeTextFileSync(target, content);
  return target;
}

/** Run `fn` with the log sink captured, and return what it collected. */
export async function captureLogs<T>(
  fn: () => T | Promise<T>,
): Promise<{ records: LogRecord[]; value: T }> {
  const records: LogRecord[] = [];
  setLogSink((record) => records.push(record));
  try {
    return { records, value: await fn() };
  } finally {
    setLogSink(null);
  }
}

/** The members of the RDF list headed at `head`, in order. */
export function listMembers(graph: RdfGraph, head: Quad["object"]): string[] {
  const members: string[] = [];
  let cell = head;
  while (cell.value !== RDF_NIL) {
    const first = [...graph.match(cell, namedNode(RDF_FIRST))];
    const rest = [...graph.match(cell, namedNode(RDF_REST))];
    assertEquals(first.length, 1);
    assertEquals(rest.length, 1);
    members.push(first[0]!.object.value);
    cell = rest[0]!.object;
  }
  return members;
}

// ---------------------------------------------------------------------------
// Dataset and descriptors
// ---------------------------------------------------------------------------

/** A source checkout the way `sources install` leaves one. */
export function sourceFixture(root: string): { wiki: string; source: string } {
  const wiki = join(root, "wiki");
  Deno.mkdirSync(wiki, { recursive: true });
  const source = join(root, ".wiki", "sources", "brain", "repo", "wiki");
  Deno.mkdirSync(source, { recursive: true });
  return { wiki, source };
}

/** The locked entry every dataset test uses, with `required_by` overridable. */
export function lockBrain(
  root: string,
  requiredBy: readonly string[] = ["root"],
): void {
  saveLockfile({
    version: 2,
    sources: new Map([["brain", {
      url: "https://example.com/brain.git",
      resolved_ref: "abcdef1234567890",
      ref: null,
      path: "wiki",
      fetched_at: "2026-01-01T00:00:00+00:00",
      required_by: requiredBy,
    }]]),
  }, join(root, "wiki.lock"));
}
