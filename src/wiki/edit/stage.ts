import { extname } from "@std/path";
import type { Config } from "../config.ts";
import {
  EditOpError,
  patchContent,
  requiredFields,
  scaffoldPage,
  setField,
  typeKey,
} from "../edit_ops.ts";
import { EditUsageError, type FileOp } from "./types.ts";
import { type FilePlan, formatIfMarkdown } from "./plan_support.ts";

/**
 * Apply one op to a file's staged text.
 *
 * `set` and `patch` re-run `wiki fmt` on their result only when the page was
 * already fmt-clean, so an edit to an unformatted page does not smuggle an
 * unrelated reformat into its diff. A typed create is always formatted: it is
 * new text, and it should arrive the way `fmt` would leave it.
 */
export async function stage(
  config: Config,
  op: FileOp,
  plan: FilePlan,
): Promise<void> {
  switch (op.op) {
    case "create": {
      if (plan.after !== null) {
        throw new EditUsageError(
          `${op.path}: cannot create a file that exists; use "replace".`,
        );
      }
      if (op.content !== undefined) {
        plan.after = op.content;
        return;
      }
      const type = op.type ?? null;
      const fields = Object.entries(op.frontmatter ?? {}).map((
        [key, json],
      ) => [key, { json }] as const);
      const page = scaffoldPage({
        path: plan.path,
        typeKey: typeKey(config),
        type,
        required: type === null ? [] : await requiredFields(config, type),
        fields,
        body: op.body ?? null,
        context: config.context,
      });
      plan.after = formatIfMarkdown(config, plan.path, page);
      return;
    }
    case "replace":
      if (plan.after === null) {
        throw new EditUsageError(
          `${op.path}: cannot replace a file that does not exist; use "create".`,
        );
      }
      plan.after = op.content;
      return;
    case "delete":
      if (plan.after === null) {
        throw new EditUsageError(`${op.path}: cannot delete a missing file.`);
      }
      plan.after = null;
      return;
    case "set":
    case "patch": {
      const current = plan.after;
      if (current === null) {
        throw new EditUsageError(`${op.path}: the file does not exist.`);
      }
      if (extname(plan.path).toLowerCase() !== ".md") {
        throw new EditUsageError(
          `${op.path}: ${op.op} applies to Markdown pages; use "replace" for data documents.`,
        );
      }
      let next: string;
      try {
        next = op.op === "set"
          ? setField(
            current,
            op.path,
            op.field,
            op.yaml !== undefined
              ? { yaml: op.yaml }
              : op.value === null
              ? null
              : { json: op.value },
          )
          : patchContent(current, op.path, op.target, op.mode, op.content);
      } catch (error) {
        if (error instanceof EditOpError) {
          throw new EditUsageError(error.message);
        }
        throw error;
      }
      const clean = formatIfMarkdown(config, plan.path, current) === current;
      plan.after = clean ? formatIfMarkdown(config, plan.path, next) : next;
      return;
    }
  }
}
