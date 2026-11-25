import { EditUsageError } from "./types.ts";

const PATCH_MODES: ReadonlySet<string> = new Set([
  "append",
  "prepend",
  "replace",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** The per-kind field checks behind {@link validateShape}. */
export function validateOpFields(
  kind: string,
  op: Record<string, unknown>,
  where: string,
): void {
  if (op.expect !== undefined && typeof op.expect !== "string") {
    throw new EditUsageError(`${where}.expect must be a string.`);
  }
  const optionalString = (key: string) => {
    if (op[key] !== undefined && typeof op[key] !== "string") {
      throw new EditUsageError(`${where}.${key} must be a string.`);
    }
  };
  switch (kind) {
    case "create": {
      if (op.expect !== undefined && op.expect !== "absent") {
        throw new EditUsageError(
          `${where}: a create can only expect "absent".`,
        );
      }
      const scaffold = op.type !== undefined || op.frontmatter !== undefined ||
        op.body !== undefined;
      if (op.content !== undefined && scaffold) {
        throw new EditUsageError(
          `${where}: give either content, or type/frontmatter/body, not both.`,
        );
      }
      if (op.content === undefined && !scaffold) {
        throw new EditUsageError(
          `${where}: a create needs content, or a type/frontmatter/body scaffold.`,
        );
      }
      optionalString("content");
      optionalString("type");
      optionalString("body");
      if (op.frontmatter !== undefined && !isRecord(op.frontmatter)) {
        throw new EditUsageError(`${where}.frontmatter must be an object.`);
      }
      return;
    }
    case "replace":
      if (typeof op.content !== "string") {
        throw new EditUsageError(`${where}.content must be a string.`);
      }
      return;
    case "delete":
      if (op.pruneLinks !== undefined && typeof op.pruneLinks !== "boolean") {
        throw new EditUsageError(`${where}.pruneLinks must be a boolean.`);
      }
      return;
    case "move":
      return;
    case "set":
      if (typeof op.field !== "string" || op.field === "") {
        throw new EditUsageError(`${where}.field must be a non-empty string.`);
      }
      if (("value" in op) === (op.yaml !== undefined)) {
        throw new EditUsageError(
          `${where}: a set needs exactly one of value (null removes the field) or yaml.`,
        );
      }
      optionalString("yaml");
      return;
    case "patch": {
      const target = op.target;
      const valid = isRecord(target) && (
        (typeof target.heading === "string" && target.heading !== "") ||
        target.frontmatter === true || target.body === true
      );
      if (!valid) {
        throw new EditUsageError(
          `${where}.target must be {"heading": "..."}, {"frontmatter": true}, or {"body": true}.`,
        );
      }
      if (typeof op.mode !== "string" || !PATCH_MODES.has(op.mode)) {
        throw new EditUsageError(
          `${where}.mode must be one of append, prepend, replace.`,
        );
      }
      if (typeof op.content !== "string") {
        throw new EditUsageError(`${where}.content must be a string.`);
      }
      return;
    }
  }
}
