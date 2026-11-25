import { type EditOp, EditUsageError, type WikiEdit } from "./types.ts";
import { validateOpFields } from "./op_fields.ts";

/** The op kinds the contract names. */
const KNOWN_OPS: ReadonlySet<string> = new Set([
  "create",
  "replace",
  "delete",
  "set",
  "patch",
  "move",
]);

/**
 * Check an edit's shape before touching anything.
 *
 * Edits arrive as JSON from agents, so the types above are a hope, not a fact:
 * every field the handlers read is checked here, and the message names the op
 * by index so the agent can fix its plan.
 */
export function validateShape(edit: WikiEdit): EditOp[] {
  if (
    edit === null || typeof edit !== "object" || !Array.isArray(edit.ops)
  ) {
    throw new EditUsageError('An edit is an object with an "ops" array.');
  }
  if (edit.ops.length === 0) {
    throw new EditUsageError("The edit has no ops.");
  }
  const ops: EditOp[] = [];
  edit.ops.forEach((raw, index) => {
    const where = `ops[${index}]`;
    const op = raw as unknown as Record<string, unknown>;
    if (op === null || typeof op !== "object") {
      throw new EditUsageError(`${where} is not an object.`);
    }
    const kind = op.op;
    if (typeof kind !== "string" || !KNOWN_OPS.has(kind)) {
      throw new EditUsageError(
        `${where}.op must be one of ${[...KNOWN_OPS].join(", ")}; got ${
          JSON.stringify(kind)
        }.`,
      );
    }
    const pathKeys = kind === "move" ? ["from", "to"] : ["path"];
    for (const key of pathKeys) {
      if (typeof op[key] !== "string" || op[key] === "") {
        throw new EditUsageError(`${where}.${key} must be a non-empty string.`);
      }
    }
    validateOpFields(kind, op, where);
    ops.push(op as unknown as EditOp);
  });
  return ops;
}
