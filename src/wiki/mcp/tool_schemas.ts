import type { ToolDefinition } from "./types.ts";

export const PATH_PROPERTY = {
  type: "string",
  description:
    "Page path relative to the wiki config root, for example wiki/Ethan.md.",
} as const;

export const EXPECT_PROPERTY = {
  type: "string",
  description:
    "SHA-256 of the file as last read (the hash of wiki_page_show). The edit is refused with a conflict when the file has changed.",
} as const;

export const DRY_RUN_PROPERTY = {
  type: "boolean",
  default: true,
  description:
    "Validate and report only. Pass false to write; applying is all-or-nothing.",
} as const;

export const EDIT_OP_SCHEMA = {
  type: "object",
  description:
    "One edit operation: create, replace, delete, set, patch, or move. Fields as in wiki edit.",
  properties: {
    op: {
      type: "string",
      enum: ["create", "replace", "delete", "set", "patch", "move"],
    },
  },
  required: ["op"],
  additionalProperties: true,
} as const;

export const EDIT_REPORT_SCHEMA = {
  type: "object",
  description: "The wiki edit --json report.",
  properties: {
    version: { type: "integer" },
    status: {
      type: "string",
      enum: ["dry_run", "applied", "rejected", "conflict"],
    },
    ok: { type: "boolean" },
    files: { type: "array", items: { type: "object" } },
    conflicts: { type: "array", items: { type: "object" } },
    introduced: { type: "array", items: { type: "object" } },
    check: { type: ["object", "null"] },
  },
  required: ["version", "status", "ok", "files", "conflicts", "introduced"],
} as const;

export const readPageTools: readonly ToolDefinition[] = [
  {
    name: "wiki_page_show",
    description:
      "Show one page as the engine sees it: frontmatter, headings, outbound links, and the content hash to pass as expect in an edit.",
    inputSchema: {
      type: "object",
      properties: { path: PATH_PROPERTY },
      required: ["path"],
      additionalProperties: false,
    },
  },
  {
    name: "wiki_page_refs",
    description: "List the pages that link to, and are linked from, one page.",
    inputSchema: {
      type: "object",
      properties: { path: PATH_PROPERTY },
      required: ["path"],
      additionalProperties: false,
    },
  },
];
