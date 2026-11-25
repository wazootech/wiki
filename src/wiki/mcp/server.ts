import { errorText } from "../errors.ts";
import { VERSION } from "../version.ts";
import { type EditOp, EditUsageError } from "../edit.ts";
import type { Wiki } from "../wiki.ts";
import {
  type JsonRpcResponse,
  MCP_PROTOCOL_VERSION,
  type McpServerOptions,
  type ToolDefinition,
} from "./types.ts";
import { tools } from "./tools.ts";
import { readPageTools } from "./tool_schemas.ts";
import { writeTools } from "./write_tools.ts";
import { describeWiki } from "./describe.ts";
import { querySparql } from "./sparql.ts";
import {
  graphTtlResource,
  infoResource,
  namespacesResource,
  resources,
} from "./resources.ts";
import {
  assertBoolean,
  assertNoExtraFields,
  assertObject,
  assertString,
  dryRun,
  isRecord,
  protocolError,
  RpcRequestError,
  SINGLE_OP_ARGS,
  singleOp,
  structuredResult,
  toolError,
} from "./rpc.ts";

export class WikiMcpServer {
  readonly #wiki: Wiki;
  readonly #diskCache: boolean;
  readonly #allowWrite: boolean;
  readonly #tools: readonly ToolDefinition[];
  /** An applied edit makes the cached graph stale: rebuild it on next read. */
  #reloadNext = false;

  constructor(wiki: Wiki, options: McpServerOptions = {}) {
    this.#wiki = wiki;
    this.#diskCache = options.diskCache ?? false;
    this.#allowWrite = options.allowWrite ?? false;
    this.#tools = [
      ...tools,
      ...readPageTools,
      ...(this.#allowWrite ? writeTools : []),
    ];
  }

  #takeReload(requested = false): boolean {
    const reload = requested || this.#reloadNext;
    this.#reloadNext = false;
    return reload;
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
        errorText(error),
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
        return { tools: this.#tools };
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
          reload: this.#takeReload(reload),
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
          reload: this.#takeReload(),
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
          structuredContent: result,
          isError: false,
        };
      }
      if (name === "wiki_page_show" || name === "wiki_page_refs") {
        assertNoExtraFields(args, ["path"]);
        const path = assertString(args["path"], "path");
        const report = name === "wiki_page_show"
          ? await this.#wiki.show(path)
          : this.#wiki.refs(path);
        return structuredResult(report, false);
      }
      if (name === "wiki_edit_apply") {
        this.#requireWrite(name);
        assertNoExtraFields(args, ["ops", "dry_run"]);
        const ops = args["ops"];
        if (!Array.isArray(ops) || ops.length === 0) {
          throw new TypeError("ops must be a non-empty array");
        }
        return await this.#applyOps(ops as EditOp[], dryRun(args));
      }
      if (Object.hasOwn(SINGLE_OP_ARGS, name)) {
        this.#requireWrite(name);
        assertNoExtraFields(args, [...SINGLE_OP_ARGS[name]!, "dry_run"]);
        return await this.#applyOps([singleOp(name, args)], dryRun(args));
      }
      return toolError(new Error(`Unknown tool: ${name}`));
    } catch (error) {
      return toolError(error);
    }
  }

  #requireWrite(name: string): void {
    if (!this.#allowWrite) {
      throw new Error(
        `${name} is unavailable: start the server with --allow-write.`,
      );
    }
  }

  async #applyOps(
    ops: readonly EditOp[],
    dry: boolean,
  ): Promise<Record<string, unknown>> {
    let report;
    try {
      report = await this.#wiki.edit({ ops }, { apply: !dry });
    } catch (error) {
      // A malformed edit is the caller's to repair, not a protocol failure.
      if (error instanceof EditUsageError) return toolError(error);
      throw error;
    }
    if (report.status === "applied") this.#reloadNext = true;
    return structuredResult(report, !report.ok);
  }

  async #readResource(params: Record<string, unknown>): Promise<unknown> {
    const uri = assertString(params["uri"], "uri");
    let text: string;
    let mimeType: string;
    switch (uri) {
      case "wiki://info":
        text = await infoResource(this.#wiki, {
          diskCache: this.#diskCache,
          reload: this.#takeReload(),
        });
        mimeType = "application/json";
        break;
      case "wiki://namespaces":
        text = await namespacesResource(this.#wiki, {
          diskCache: this.#diskCache,
          reload: this.#takeReload(),
        });
        mimeType = "application/json";
        break;
      case "wiki://graph.ttl":
        text = await graphTtlResource(this.#wiki, {
          diskCache: this.#diskCache,
          reload: this.#takeReload(),
        });
        mimeType = "text/turtle";
        break;
      default:
        throw new RpcRequestError(-32002, `Resource not found: ${uri}`);
    }
    return { contents: [{ uri, mimeType, text }] };
  }
}
