import type { graphStats } from "../graph.ts";

export const QUERY_FORMATS = [
  "table",
  "json",
  "csv",
  "tsv",
  "turtle",
  "n3",
  "markdown",
] as const;

export const QUERY_FORMAT_ALIASES = [
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
  /** Rebuild the in-memory graph before reading it. */
  reload?: boolean;
}

export interface McpServerOptions extends McpOptions {
  /** List and serve the write tools. Off by default: the server is read-only. */
  allowWrite?: boolean;
}

export interface McpTransport {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
}

export interface RunMcpOptions extends McpServerOptions {
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

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

export interface ResourceDefinition {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}
