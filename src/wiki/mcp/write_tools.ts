import type { ToolDefinition } from "./types.ts";
import {
  DRY_RUN_PROPERTY,
  EDIT_OP_SCHEMA,
  EDIT_REPORT_SCHEMA,
  EXPECT_PROPERTY,
  PATH_PROPERTY,
} from "./tool_schemas.ts";

export const writeTools: readonly ToolDefinition[] = [
  {
    name: "wiki_edit_apply",
    description:
      "Validate a batch of page edits and, with dry_run=false, write them atomically. Defaults to a dry run. Rejections and conflicts come back as results with isError true; repair and retry. Prefer this over the single-op tools.",
    inputSchema: {
      type: "object",
      properties: {
        ops: { type: "array", minItems: 1, items: EDIT_OP_SCHEMA },
        dry_run: DRY_RUN_PROPERTY,
      },
      required: ["ops"],
      additionalProperties: false,
    },
    outputSchema: EDIT_REPORT_SCHEMA,
  },
  {
    name: "wiki_page_create",
    description:
      "Create a page, from full content or from a typed scaffold (type, frontmatter, body). Defaults to a dry run.",
    inputSchema: {
      type: "object",
      properties: {
        path: PATH_PROPERTY,
        content: { type: "string" },
        type: { type: "string", description: "Class such as schema:Purchase." },
        frontmatter: { type: "object" },
        body: { type: "string" },
        dry_run: DRY_RUN_PROPERTY,
      },
      required: ["path"],
      additionalProperties: false,
    },
    outputSchema: EDIT_REPORT_SCHEMA,
  },
  {
    name: "wiki_page_set_field",
    description:
      "Set one frontmatter field, keeping comments and key order. value null removes it; yaml keeps a scalar's spelling. Defaults to a dry run.",
    inputSchema: {
      type: "object",
      properties: {
        path: PATH_PROPERTY,
        field: { type: "string" },
        value: {},
        yaml: { type: "string" },
        expect: EXPECT_PROPERTY,
        dry_run: DRY_RUN_PROPERTY,
      },
      required: ["path", "field"],
      additionalProperties: false,
    },
    outputSchema: EDIT_REPORT_SCHEMA,
  },
  {
    name: "wiki_page_patch",
    description:
      "Append, prepend, or replace the body, a heading's section, or the frontmatter of a page. Defaults to a dry run.",
    inputSchema: {
      type: "object",
      properties: {
        path: PATH_PROPERTY,
        target: {
          type: "object",
          description:
            "One of {heading: string}, {frontmatter: true}, or {body: true}.",
        },
        mode: { type: "string", enum: ["append", "prepend", "replace"] },
        content: { type: "string" },
        expect: EXPECT_PROPERTY,
        dry_run: DRY_RUN_PROPERTY,
      },
      required: ["path", "target", "mode", "content"],
      additionalProperties: false,
    },
    outputSchema: EDIT_REPORT_SCHEMA,
  },
  {
    name: "wiki_page_move",
    description:
      "Move a page and repoint every link to it. Defaults to a dry run.",
    inputSchema: {
      type: "object",
      properties: {
        from: PATH_PROPERTY,
        to: PATH_PROPERTY,
        expect: EXPECT_PROPERTY,
        dry_run: DRY_RUN_PROPERTY,
      },
      required: ["from", "to"],
      additionalProperties: false,
    },
    outputSchema: EDIT_REPORT_SCHEMA,
  },
  {
    name: "wiki_page_delete",
    description:
      "Delete a page. Refused while other pages link to it, unless prune_links turns those links into plain text. Defaults to a dry run.",
    inputSchema: {
      type: "object",
      properties: {
        path: PATH_PROPERTY,
        expect: EXPECT_PROPERTY,
        prune_links: { type: "boolean", default: false },
        dry_run: DRY_RUN_PROPERTY,
      },
      required: ["path"],
      additionalProperties: false,
    },
    outputSchema: EDIT_REPORT_SCHEMA,
  },
];
