import type { Wiki } from "../wiki.ts";
import { usageError } from "./usage.ts";
import { applyAndReport } from "./edit.ts";
import { NEW_HELP, SET_HELP } from "./write_verb_help.ts";
import { parseVerbArgs } from "./verb_args.ts";

export async function runNewCommand(
  wiki: Wiki,
  args: readonly string[],
): Promise<number> {
  const parsed = parseVerbArgs(args, NEW_HELP, {
    valueOptions: ["--type", "--set", "--body"],
    flagOptions: [],
    expect: false,
  });
  if (typeof parsed === "number") return parsed;
  if (parsed.positionals.length !== 1) {
    return usageError("Error: wiki new takes exactly one PATH.");
  }
  const {
    requiredFields,
    scaffoldPage,
    scaffoldTitle,
    titleFilename,
    typeKey,
  } = await import("../edit_ops.ts");
  const { EditOpError } = await import("../edit_ops.ts");
  const { isDirectory } = await import("../fspath.ts");
  const { join, resolve } = await import("@std/path");

  const fields: Array<readonly [string, { yaml: string }]> = [];
  for (const entry of parsed.values.get("--set") ?? []) {
    const at = entry.indexOf("=");
    if (at <= 0) {
      return usageError(`Error: --set takes KEY=VALUE; got '${entry}'.`);
    }
    fields.push([entry.slice(0, at), { yaml: entry.slice(at + 1) }]);
  }
  const type = parsed.values.get("--type")?.at(-1) ?? null;

  let path = parsed.positionals[0]!;
  try {
    if (
      /[\\/]$/.test(path) ||
      isDirectory(resolve(wiki.config.config_root, path))
    ) {
      const title = scaffoldTitle(fields);
      if (title === null) {
        return usageError(
          "Error: PATH is a directory, so the filename comes from the title; --set headline=... or name=....",
        );
      }
      path = join(path, titleFilename(title));
    }
    const required = type === null
      ? []
      : await requiredFields(wiki.config, type);
    const content = scaffoldPage({
      path,
      typeKey: typeKey(wiki.config),
      type,
      required,
      fields,
      body: parsed.values.get("--body")?.at(-1) ?? null,
      context: wiki.config.context,
    });
    const supplied = new Set(fields.map(([key]) => key));
    const missing = required.filter((key) => !supplied.has(key));
    if (missing.length > 0) {
      console.error(`missing required fields: ${missing.join(", ")}`);
    }
    return await applyAndReport(
      wiki,
      { ops: [{ op: "create", path, content, expect: "absent" }] },
      parsed.run,
      { required, missing },
    );
  } catch (error) {
    if (error instanceof EditOpError) {
      return usageError(`Error: ${error.message}`);
    }
    throw error;
  }
}

export async function runSetCommand(
  wiki: Wiki,
  args: readonly string[],
): Promise<number> {
  const parsed = parseVerbArgs(args, SET_HELP, {
    valueOptions: [],
    flagOptions: ["--unset"],
    expect: true,
  });
  if (typeof parsed === "number") return parsed;
  const unset = parsed.flags.has("--unset");
  const wanted = unset ? 2 : 3;
  if (parsed.positionals.length !== wanted) {
    return usageError(
      unset
        ? "Error: wiki set --unset takes PATH and FIELD."
        : "Error: wiki set takes PATH, FIELD, and VALUE (or --unset).",
    );
  }
  const [path, field, value] = parsed.positionals as [string, string, string?];
  const op = unset
    ? { op: "set", path, field, value: null }
    : { op: "set", path, field, yaml: value };
  return await applyAndReport(
    wiki,
    { ops: [{ ...op, ...(parsed.expect ? { expect: parsed.expect } : {}) }] },
    parsed.run,
  );
}
