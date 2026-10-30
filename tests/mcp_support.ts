import { join } from "@std/path";
import { assertEquals } from "@std/assert";
import type { createMcpServer } from "../src/wiki/mcp.ts";
import { Wiki } from "../src/wiki/wiki.ts";

export function tempRoot(): string {
  return Deno.makeTempDirSync({ prefix: "wiki-mcp-" });
}

export function cleanup(root: string): void {
  try {
    Deno.removeSync(root, { recursive: true });
  } catch {
    // Windows can briefly retain a handle after a graph read.
  }
}

export function makeWiki(root: string): Wiki {
  const wikiDir = join(root, "wiki");
  Deno.mkdirSync(wikiDir, { recursive: true });
  Deno.writeTextFileSync(
    join(root, "wiki.yaml"),
    "wiki:\n  input: [wiki]\n",
  );
  Deno.writeTextFileSync(
    join(wikiDir, "Ethan.md"),
    "---\ntype: schema:Person\ngivenName: Ethan\nfamilyName: Davidson\n---\n",
  );
  return Wiki.load(root);
}

interface ToolResult {
  isError: boolean;
  structuredContent?: {
    status?: string;
    hash?: string;
    [key: string]: unknown;
  };
  content: { type: string; text: string }[];
}

export async function callTool(
  server: ReturnType<typeof createMcpServer>,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const response = await server.handleMessage({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name, arguments: args },
  });
  assertEquals(response?.error, undefined);
  return response?.result as ToolResult;
}
