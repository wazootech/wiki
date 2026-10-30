import { serializeRdf } from "../rdf.ts";
import type { Wiki } from "../wiki.ts";
import type { McpOptions, ResourceDefinition } from "./types.ts";
import { describeWiki, namespaceMap } from "./describe.ts";

export const resources: readonly ResourceDefinition[] = [
  {
    uri: "wiki://info",
    name: "wiki-info",
    description:
      "Version, config, inputs, graph stats, namespaces, and vocabulary.",
    mimeType: "application/json",
  },
  {
    uri: "wiki://namespaces",
    name: "wiki-namespaces",
    description: "Prefix map for SPARQL authoring.",
    mimeType: "application/json",
  },
  {
    uri: "wiki://graph.ttl",
    name: "wiki-graph",
    description: "The current inferred wiki graph serialized as Turtle.",
    mimeType: "text/turtle",
  },
];

function stableJson(value: unknown): string {
  const sort = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(sort);
    if (item !== null && typeof item === "object") {
      return Object.fromEntries(
        Object.entries(item).sort(([left], [right]) =>
          left < right ? -1 : left > right ? 1 : 0
        ).map(([key, nested]) => [key, sort(nested)]),
      );
    }
    return item;
  };
  return JSON.stringify(sort(value), null, 2);
}

export async function infoResource(
  wiki: Wiki,
  options: McpOptions = {},
): Promise<string> {
  return stableJson(await describeWiki(wiki, options));
}

export async function namespacesResource(
  wiki: Wiki,
  options: McpOptions = {},
): Promise<string> {
  const graph = await wiki.graph({
    infer: true,
    reload: options.reload ?? false,
    diskCache: options.diskCache ?? false,
  });
  return stableJson(namespaceMap(graph));
}

export async function graphTtlResource(
  wiki: Wiki,
  options: McpOptions = {},
): Promise<string> {
  const graph = await wiki.graph({
    infer: true,
    reload: options.reload ?? false,
    diskCache: options.diskCache ?? false,
  });
  return await serializeRdf([...graph], "turtle", { prefixes: graph.bindings });
}
