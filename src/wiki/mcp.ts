import type { Wiki } from "./wiki.ts";
import type { McpServerOptions, RunMcpOptions } from "./mcp/types.ts";
import { protocolError } from "./mcp/rpc.ts";
import { WikiMcpServer } from "./mcp/server.ts";

export {
  ALLOWED_QUERY_FORMS,
  type JsonRpcError,
  type JsonRpcResponse,
  MCP_PROTOCOL_VERSION,
  type McpOptions,
  type McpServerOptions,
  type McpTransport,
  QUERY_FORMATS,
  type QuerySparqlOptions,
  type QuerySparqlResult,
  type RunMcpOptions,
  type VocabularyEntry,
  type WikiDescription,
} from "./mcp/types.ts";
export { describeWiki } from "./mcp/describe.ts";
export { querySparql } from "./mcp/sparql.ts";
export {
  graphTtlResource,
  infoResource,
  namespacesResource,
} from "./mcp/resources.ts";
export { WikiMcpServer } from "./mcp/server.ts";

export function createMcpServer(
  wiki: Wiki,
  options: McpServerOptions = {},
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
    allowWrite: options.allowWrite ?? false,
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
