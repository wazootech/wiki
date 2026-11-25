import { resolve } from "@std/path";
import { relativeWithin } from "../fspath.ts";
import { graphStats } from "../graph.ts";
import { VERSION } from "../version.ts";
import type { Wiki } from "../wiki.ts";
import type { McpOptions, VocabularyEntry, WikiDescription } from "./types.ts";

function relativePath(path: string, root: string): string {
  const resolved = resolve(path);
  const resolvedRoot = resolve(root);
  if (resolved === resolvedRoot) return ".";
  try {
    return (relativeWithin(resolved, resolvedRoot)).replaceAll("\\", "/");
  } catch {
    return resolved.replaceAll("\\", "/");
  }
}

export function namespaceMap(
  graph: Awaited<ReturnType<Wiki["graph"]>>,
): Record<string, string> {
  return Object.fromEntries(graph.bindings);
}

function compactIri(
  iri: string,
  namespaces: ReadonlyMap<string, string>,
): string | null {
  const candidates = [...namespaces]
    .filter(([prefix, namespace]) =>
      prefix !== "" && iri.startsWith(namespace) &&
      iri.length > namespace.length
    )
    .sort((left, right) => right[1].length - left[1].length);
  for (const [prefix, namespace] of candidates) {
    const local = iri.slice(namespace.length);
    if (/^[\p{L}_][\p{L}\p{N}._~-]*$/u.test(local)) return `${prefix}:${local}`;
  }
  return null;
}

function vocabularySummary(
  graph: Awaited<ReturnType<Wiki["graph"]>>,
): WikiDescription["vocabulary"] {
  const classes = new Map<string, number>();
  const predicates = new Map<string, number>();
  for (const quad of graph) {
    const predicate = quad.predicate.value;
    predicates.set(predicate, (predicates.get(predicate) ?? 0) + 1);
    if (
      predicate === "http://www.w3.org/1999/02/22-rdf-syntax-ns#type" &&
      quad.object.termType === "NamedNode"
    ) {
      const iri = quad.object.value;
      classes.set(iri, (classes.get(iri) ?? 0) + 1);
    }
  }
  const entries = (counts: Map<string, number>, limit: number) =>
    [...counts]
      .sort((left, right) => right[1] - left[1])
      .slice(0, limit)
      .map(([iri, count]): VocabularyEntry => {
        const curie = compactIri(iri, graph.bindings);
        return curie === null ? { iri, count } : { iri, count, curie };
      });
  return {
    classes: entries(classes, 25),
    predicates: entries(predicates, 50),
  };
}

export async function describeWiki(
  wiki: Wiki,
  options: McpOptions = {},
): Promise<WikiDescription> {
  const graph = await wiki.graph({
    infer: true,
    reload: options.reload ?? false,
    diskCache: options.diskCache ?? false,
  });
  const root = wiki.config.config_root;
  const configPath = wiki.config_path;
  return {
    version: VERSION,
    config: configPath === null ? null : relativePath(configPath, root),
    inputs: wiki.config.wiki.input.map((path) => relativePath(path, root)),
    namespaces: namespaceMap(graph),
    graph: { ...graphStats(graph), inference: true },
    vocabulary: vocabularySummary(graph),
  };
}
