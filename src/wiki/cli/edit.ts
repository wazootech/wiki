import { errorText } from "../errors.ts";
import type { Wiki } from "../wiki.ts";
import { EXIT_CONFLICT, EXIT_FAILURE, EXIT_OK, usageError } from "./usage.ts";
import type { ParsedEditCommand } from "./edit_args.ts";

export async function runEditCommand(
  wiki: Wiki,
  parsed: ParsedEditCommand,
): Promise<number> {
  let text: string;
  try {
    text = parsed.from === "-"
      ? await new Response(Deno.stdin.readable).text()
      : await Deno.readTextFile(parsed.from);
  } catch (error) {
    return usageError(
      `Error: Cannot read edit from '${parsed.from}': ${errorText(error)}`,
    );
  }
  let edit: unknown;
  try {
    edit = JSON.parse(text);
  } catch (error) {
    return usageError(`Error: The edit is not valid JSON: ${errorText(error)}`);
  }

  return await applyAndReport(wiki, edit, parsed);
}

export interface EditRunOptions {
  readonly apply: boolean;
  readonly force: boolean;
  readonly format: "text" | "json";
}

/**
 * Apply one edit and report it: the shared tail of `wiki edit` and the verbs
 * built on it (`new`, `set`, `patch`, `mv`, `rm`). `extra` adds verb-specific fields to the
 * JSON report, such as `new`'s missing required fields.
 */
export async function applyAndReport(
  wiki: Wiki,
  edit: unknown,
  options: EditRunOptions,
  extra: Readonly<Record<string, unknown>> = {},
): Promise<number> {
  const { EditUsageError } = await import("../edit.ts");
  let report;
  try {
    report = await wiki.edit(edit as Parameters<Wiki["edit"]>[0], {
      apply: options.apply,
      force: options.force,
    });
  } catch (error) {
    if (error instanceof EditUsageError) {
      return usageError(`Error: ${error.message}`);
    }
    console.error(`Error: ${errorText(error)}`);
    return EXIT_FAILURE;
  }

  if (options.format === "json") {
    console.log(JSON.stringify({ ...report, ...extra }, null, 2));
  }
  // The human summary always goes to stderr, as `check -f json` does, so a
  // JSON consumer can read stdout and still see why the run failed.
  for (const file of report.files) {
    console.error(`${file.action} ${file.path}`);
  }
  for (const conflict of report.conflicts) {
    console.error(
      `conflict: ${conflict.path} expected ${conflict.expected}, found ${
        conflict.actual ?? "no file"
      }`,
    );
  }
  for (const issue of report.introduced) {
    console.error(`${issue.severity}: ${issue.message}`);
  }
  switch (report.status) {
    case "conflict":
      console.error(
        "Edit not written: the files changed since they were read.",
      );
      return EXIT_CONFLICT;
    case "rejected":
      console.error("Edit not written: it introduces the errors above.");
      return EXIT_FAILURE;
    case "dry_run":
      console.error("Edit is valid. Re-run with --apply to write it.");
      return EXIT_OK;
    case "applied":
      console.error("Edit written.");
      return EXIT_OK;
  }
}
