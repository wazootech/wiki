import { errorText } from "../errors.ts";
import type { EditOp } from "../edit.ts";
import type { JsonRpcResponse } from "./types.ts";

/** Argument names each single-op write tool accepts, besides dry_run. */
export const SINGLE_OP_ARGS: Readonly<Record<string, readonly string[]>> = {
  wiki_page_create: ["path", "content", "type", "frontmatter", "body"],
  wiki_page_set_field: ["path", "field", "value", "yaml", "expect"],
  wiki_page_patch: ["path", "target", "mode", "content", "expect"],
  wiki_page_move: ["from", "to", "expect"],
  wiki_page_delete: ["path", "expect", "prune_links"],
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function protocolError(
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

export function assertObject(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new RpcRequestError(-32602, `${label} must be an object`);
  }
  return value;
}

export function assertString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new RpcRequestError(-32602, `${label} must be a string`);
  }
  return value;
}

export function assertBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new RpcRequestError(-32602, `${label} must be a boolean`);
  }
  return value;
}

export function toolError(error: unknown): Record<string, unknown> {
  return {
    content: [{
      type: "text",
      text: errorText(error),
    }],
    isError: true,
  };
}

export function assertNoExtraFields(
  args: Record<string, unknown>,
  allowed: readonly string[],
): void {
  const unknown = Object.keys(args).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new TypeError(`Unexpected argument: ${unknown[0]}`);
  }
}

/** A tool result carrying a report as both text and structured content. */
export function structuredResult(
  report: unknown,
  isError: boolean,
): Record<string, unknown> {
  // Round-trip so the payload serializes as the CLI's --json does.
  const structured = JSON.parse(JSON.stringify(report));
  return {
    content: [{ type: "text", text: JSON.stringify(structured) }],
    structuredContent: structured,
    isError,
  };
}

/** Writes default to a dry run: applying takes an explicit dry_run: false. */
export function dryRun(args: Record<string, unknown>): boolean {
  return args["dry_run"] === undefined
    ? true
    : assertBoolean(args["dry_run"], "dry_run");
}

/** The one EditOp a single-op convenience tool stands for. */
export function singleOp(name: string, args: Record<string, unknown>): EditOp {
  const fields: Record<string, unknown> = {};
  for (const key of SINGLE_OP_ARGS[name] ?? []) {
    if (args[key] !== undefined) fields[key] = args[key];
  }
  switch (name) {
    case "wiki_page_create":
      return { op: "create", ...fields } as EditOp;
    case "wiki_page_set_field":
      return { op: "set", ...fields } as EditOp;
    case "wiki_page_patch":
      return { op: "patch", ...fields } as EditOp;
    case "wiki_page_move":
      return { op: "move", ...fields } as EditOp;
    default: {
      const { prune_links: pruneLinks, ...rest } = fields;
      return {
        op: "delete",
        ...rest,
        ...(pruneLinks === undefined
          ? {}
          : { pruneLinks: assertBoolean(pruneLinks, "prune_links") }),
      } as EditOp;
    }
  }
}

export class RpcRequestError extends Error {
  readonly code: number;

  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}
