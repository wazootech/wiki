import {
  ALLOWED_QUERY_FORMS,
  QUERY_FORMAT_ALIASES,
  QUERY_FORMATS,
  type ToolDefinition,
} from "./types.ts";

export const tools: readonly ToolDefinition[] = [
  {
    name: "query_sparql",
    description:
      "Execute SPARQL SELECT, ASK, CONSTRUCT, or DESCRIBE against the wiki graph.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "SPARQL query to execute." },
        format: {
          type: "string",
          enum: [...QUERY_FORMATS, ...QUERY_FORMAT_ALIASES],
          default: "json",
          description: "Result format or a supported media-type alias.",
        },
        inference: {
          type: "boolean",
          default: true,
          description: "Include the inferred graph when true.",
        },
        reload: {
          type: "boolean",
          default: false,
          description: "Rebuild the graph before querying.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        format: { type: "string" },
        query_form: { type: "string", enum: [...ALLOWED_QUERY_FORMS] },
        result: { type: "string" },
      },
      required: ["format", "query_form", "result"],
      additionalProperties: false,
    },
  },
  {
    name: "describe_wiki",
    description:
      "Return config, namespaces, graph stats, and observed vocabulary.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        version: { type: "string" },
        config: { type: ["string", "null"] },
        inputs: { type: "array", items: { type: "string" } },
        namespaces: {
          type: "object",
          additionalProperties: { type: "string" },
        },
        graph: {
          type: "object",
          properties: {
            triples: { type: "integer" },
            subjects: { type: "integer" },
            predicates: { type: "integer" },
            objects: { type: "integer" },
            inference: { type: "boolean" },
          },
          required: [
            "triples",
            "subjects",
            "predicates",
            "objects",
            "inference",
          ],
          additionalProperties: false,
        },
        vocabulary: {
          type: "object",
          properties: {
            classes: {
              type: "array",
              items: { $ref: "#/$defs/vocabularyEntry" },
            },
            predicates: {
              type: "array",
              items: { $ref: "#/$defs/vocabularyEntry" },
            },
          },
          required: ["classes", "predicates"],
          additionalProperties: false,
        },
      },
      required: [
        "version",
        "config",
        "inputs",
        "namespaces",
        "graph",
        "vocabulary",
      ],
      additionalProperties: false,
      $defs: {
        vocabularyEntry: {
          type: "object",
          properties: {
            iri: { type: "string" },
            count: { type: "integer" },
            curie: { type: "string" },
          },
          required: ["iri", "count"],
          additionalProperties: false,
        },
      },
    },
  },
];
