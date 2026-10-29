import type { Wiki } from "../wiki.ts";
import { usageError } from "./usage.ts";
import { applyAndReport } from "./edit.ts";
import { PATCH_HELP } from "./write_verb_help.ts";
import { parseVerbArgs } from "./verb_args.ts";

export async function runPatchCommand(
  wiki: Wiki,
  args: readonly string[],
): Promise<number> {
  const parsed = parseVerbArgs(args, PATCH_HELP, {
    valueOptions: ["--heading", "--content"],
    flagOptions: [
      "--body",
      "--frontmatter",
      "--append",
      "--prepend",
      "--replace",
    ],
    expect: true,
  });
  if (typeof parsed === "number") return parsed;
  if (parsed.positionals.length !== 1) {
    return usageError("Error: wiki patch takes exactly one PATH.");
  }
  const heading = parsed.values.get("--heading")?.at(-1);
  const targets = [
    heading !== undefined,
    parsed.flags.has("--body"),
    parsed.flags.has("--frontmatter"),
  ].filter(Boolean).length;
  if (targets !== 1) {
    return usageError(
      "Error: give exactly one target: --heading TEXT, --body, or --frontmatter.",
    );
  }
  const modes = (["append", "prepend", "replace"] as const).filter((mode) =>
    parsed.flags.has(`--${mode}`)
  );
  if (modes.length !== 1) {
    return usageError(
      "Error: give exactly one of --append, --prepend, or --replace.",
    );
  }
  const content = parsed.values.get("--content")?.at(-1) ??
    await new Response(Deno.stdin.readable).text();
  const target = heading !== undefined
    ? { heading }
    : parsed.flags.has("--body")
    ? { body: true }
    : { frontmatter: true };
  return await applyAndReport(wiki, {
    ops: [{
      op: "patch",
      path: parsed.positionals[0]!,
      target,
      mode: modes[0],
      content,
      ...(parsed.expect ? { expect: parsed.expect } : {}),
    }],
  }, parsed.run);
}
