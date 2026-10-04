import { resolve } from "@std/path";
import { relativeWithin } from "./fspath.ts";
import { detectQueryForm, normalizeQueryFormat } from "./format.ts";
import { graphStats } from "./graph.ts";
import { serializeRdf } from "./rdf.ts";
import { VERSION } from "./version.ts";
import type { Wiki } from "./wiki.ts";

export const QUERY_FORMATS = [
  "table",
  "json",
  "csv",
  "tsv",
  "turtle",
  "n3",
  "markdown",
] as const;

const QUERY_FORMAT_ALIASES = [
  "application/json",
  "application/sparql-results+json",
  "text/csv",
  "text/tab-separated-values",
  "text/turtle",
  "application/x-turtle",
  "text/n3",
  "ttl",
  "tt",
  "md",
] as const;

export const ALLOWED_QUERY_FORMS = [
  "SELECT",
  "ASK",
  "CONSTRUCT",
  "DESCRIBE",
] as const;

export const MCP_PROTOCOL_VERSION = "2025-06-18";

export interface QuerySparqlResult {
  format: string;
  query_form: string;
  result: string;
}

export interface VocabularyEntry {
  iri: string;
  count: number;
  curie?: string;
}

export interface WikiDescription {
  version: string;
  config: string | null;
  inputs: string[];
  namespaces: Record<string, string>;
  graph: ReturnType<typeof graphStats> & { inference: true };
  vocabulary: {
    classes: VocabularyEntry[];
    predicates: VocabularyEntry[];
  };
}

export interface QuerySparqlOptions {
  format?: string;
  inference?: boolean;
  reload?: boolean;
  cache?: boolean;
}

export interface McpOptions {
  diskCache?: boolean;
}

export interface McpTransport {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
}

export interface RunMcpOptions extends McpOptions {
  mode?: string;
  transport?: McpTransport;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: JsonRpcError;
}

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
}

interface ResourceDefinition {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

const tools: readonly ToolDefinition[] = [
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

const resources: readonly ResourceDefinition[] = [
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

function namespaceMap(
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
    reload: false,
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

function stripSparqlPrelude(query: string): string {
  return query.replace(/^[ \t]*(?:#.*)?$/gm, "")
    .replace(/\bPREFIX\b\s+[^\n\r]+/gi, "")
    .replace(/\bBASE\b\s+[^\n\r]+/gi, "")
    .trimStart();
}

function isSparqlUpdate(query: string): boolean {
  return /^(INSERT|DELETE|LOAD|CLEAR|CREATE|DROP|COPY|MOVE|ADD|WITH)\b/i.test(
    stripSparqlPrelude(query),
  );
}

export async function querySparql(
  wiki: Wiki,
  query: string,
  options: QuerySparqlOptions = {},
): Promise<QuerySparqlResult> {
  if (typeof query !== "string") throw new TypeError("query must be a string");
  if (isSparqlUpdate(query)) {
    throw new Error("SPARQL Update is not supported by wiki mcp.");
  }
  const queryForm = detectQueryForm(query);
  if (!(ALLOWED_QUERY_FORMS as readonly string[]).includes(queryForm)) {
    throw new Error(`Unsupported SPARQL query form: ${queryForm}`);
  }
  const rawFormat = options.format?.trim() || "json";
  let format: ReturnType<typeof normalizeQueryFormat>;
  try {
    format = normalizeQueryFormat(rawFormat);
  } catch {
    throw new Error(`Unsupported query result format: ${options.format}`);
  }
  const result = await wiki.query(query, {
    format,
    noInference: !(options.inference ?? true),
    reload: options.reload ?? false,
    cache: options.cache ?? false,
  });
  return { format, query_form: queryForm, result };
}

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
    reload: false,
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
    reload: false,
    diskCache: options.diskCache ?? false,
  });
  return await serializeRdf([...graph], "turtle", { prefixes: graph.bindings });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function protocolError(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id,
    error: data === undefined ? { code, message } : { code, message, data },
  };
}

function assertObject(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new RpcRequestError(-32602, `${label} must be an object`);
  }
  return value;
}

function assertString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new RpcRequestError(-32602, `${label} must be a string`);
  }
  return value;
}

function assertBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new RpcRequestError(-32602, `${label} must be a boolean`);
  }
  return value;
}

function toolError(error: unknown): Record<string, unknown> {
  return {
    content: [{
      type: "text",
      text: error instanceof Error ? error.message : String(error),
    }],
    isError: true,
  };
}

function assertNoExtraFields(
  args: Record<string, unknown>,
  allowed: readonly string[],
): void {
  const unknown = Object.keys(args).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new TypeError(`Unexpected argument: ${unknown[0]}`);
  }
}

export class WikiMcpServer {
  readonly #wiki: Wiki;
  readonly #diskCache: boolean;

  constructor(wiki: Wiki, options: McpOptions = {}) {
    this.#wiki = wiki;
    this.#diskCache = options.diskCache ?? false;
  }

  async handleMessage(message: unknown): Promise<JsonRpcResponse | null> {
    if (
      !isRecord(message) || message["jsonrpc"] !== "2.0" ||
      typeof message["method"] !== "string"
    ) {
      return protocolError(null, -32600, "Invalid Request");
    }
    const hasId = Object.hasOwn(message, "id");
    const idValue = message["id"];
    if (
      hasId &&
      !(typeof idValue === "string" || typeof idValue === "number" ||
        idValue === null)
    ) {
      return protocolError(null, -32600, "Invalid Request");
    }
    const id = hasId ? idValue as string | number | null : null;
    if (message["params"] !== undefined && !isRecord(message["params"])) {
      return hasId ? protocolError(id, -32600, "Invalid Request") : null;
    }
    try {
      const result = await this.#dispatch(
        message["method"],
        (message["params"] ?? {}) as Record<string, unknown>,
      );
      if (!hasId) return null;
      return { jsonrpc: "2.0", id, result };
    } catch (error) {
      if (!hasId) return null;
      if (error instanceof RpcRequestError) {
        return protocolError(id, error.code, error.message);
      }
      return protocolError(
        id,
        -32603,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  async #dispatch(
    method: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    switch (method) {
      case "initialize":
        return this.#initialize(params);
      case "notifications/initialized":
        return {};
      case "ping":
        return {};
      case "tools/list":
        return { tools };
      case "tools/call":
        return await this.#callTool(params);
      case "resources/list":
        return { resources };
      case "resources/read":
        return await this.#readResource(params);
      default:
        throw new RpcRequestError(-32601, `Method not found: ${method}`);
    }
  }

  #initialize(params: Record<string, unknown>): unknown {
    const protocolVersion = assertString(
      params["protocolVersion"],
      "protocolVersion",
    );
    assertObject(params["capabilities"], "capabilities");
    const clientInfo = assertObject(params["clientInfo"], "clientInfo");
    assertString(clientInfo["name"], "clientInfo.name");
    assertString(clientInfo["version"], "clientInfo.version");
    if (!protocolVersion) {
      throw new RpcRequestError(-32602, "protocolVersion must not be empty");
    }
    return {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {
        tools: { listChanged: false },
        resources: { listChanged: false, subscribe: false },
      },
      serverInfo: { name: "wiki", version: VERSION },
    };
  }

  async #callTool(
    params: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    let name: string;
    let args: Record<string, unknown>;
    try {
      name = assertString(params["name"], "name");
      args = params["arguments"] === undefined
        ? {}
        : assertObject(params["arguments"], "arguments");
      if (name === "query_sparql") {
        assertNoExtraFields(args, ["query", "format", "inference", "reload"]);
        const query = assertString(args["query"], "query");
        const format = args["format"] === undefined
          ? "json"
          : assertString(args["format"], "format");
        const inference = args["inference"] === undefined
          ? true
          : assertBoolean(args["inference"], "inference");
        const reload = args["reload"] === undefined
          ? false
          : assertBoolean(args["reload"], "reload");
        const result = await querySparql(this.#wiki, query, {
          format,
          inference,
          reload,
          cache: this.#diskCache,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
          structuredContent: result,
          isError: false,
        };
      }
      if (name === "describe_wiki") {
        assertNoExtraFields(args, []);
        const result = await describeWiki(this.#wiki, {
          diskCache: this.#diskCache,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
          structuredContent: result,
          isError: false,
        };
      }
      return toolError(new Error(`Unknown tool: ${name}`));
    } catch (error) {
      return toolError(error);
    }
  }

  async #readResource(params: Record<string, unknown>): Promise<unknown> {
    const uri = assertString(params["uri"], "uri");
    let text: string;
    let mimeType: string;
    switch (uri) {
      case "wiki://info":
        text = await infoResource(this.#wiki, { diskCache: this.#diskCache });
        mimeType = "application/json";
        break;
      case "wiki://namespaces":
        text = await namespacesResource(this.#wiki, {
          diskCache: this.#diskCache,
        });
        mimeType = "application/json";
        break;
      case "wiki://graph.ttl":
        text = await graphTtlResource(this.#wiki, {
          diskCache: this.#diskCache,
        });
        mimeType = "text/turtle";
        break;
      default:
        throw new RpcRequestError(-32002, `Resource not found: ${uri}`);
    }
    return { contents: [{ uri, mimeType, text }] };
  }
}

class RpcRequestError extends Error {
  readonly code: number;

  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

export function createMcpServer(
  wiki: Wiki,
  options: McpOptions = {},
): WikiMcpServer {
  return new WikiMcpServer(wiki, options);
}

async function writeLine(
  line: string,
  server: WikiMcpServer,
  writer: WritableStreamDefaultWriter<Uint8Array>,
  encoder: TextEncoder,
): Promise<void> {
  if (!line.trim()) return;
  let message: unknown;
  try {
    message = JSON.parse(line);
  } catch {
    await writer.write(
      encoder.encode(
        `${JSON.stringify(protocolError(null, -32700, "Parse error"))}\n`,
      ),
    );
    return;
  }
  const response = await server.handleMessage(message);
  if (response !== null) {
    await writer.write(encoder.encode(`${JSON.stringify(response)}\n`));
  }
}

export async function runMcpServer(
  wiki: Wiki,
  options: RunMcpOptions = {},
): Promise<void> {
  const mode = options.mode ?? "stdio";
  if (mode !== "stdio") throw new Error(`Unsupported MCP mode: ${mode}`);
  const transport = options.transport ?? {
    readable: Deno.stdin.readable,
    writable: Deno.stdout.writable,
  };
  const server = createMcpServer(wiki, {
    diskCache: options.diskCache ?? false,
  });
  const reader = transport.readable.getReader();
  const writer = transport.writable.getWriter();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let pending = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      let newline = pending.indexOf("\n");
      while (newline >= 0) {
        const line = pending.slice(0, newline).replace(/\r$/, "");
        pending = pending.slice(newline + 1);
        await writeLine(line, server, writer, encoder);
        newline = pending.indexOf("\n");
      }
      if (done) break;
    }
    if (pending.trim()) await writeLine(pending, server, writer, encoder);
  } finally {
    reader.releaseLock();
    writer.releaseLock();
  }
}
