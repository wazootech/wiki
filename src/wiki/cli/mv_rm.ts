import type { Wiki } from "../wiki.ts";
import { usageError } from "./usage.ts";
import { applyAndReport } from "./edit.ts";
import {
  WRITE_VERB_EXIT_CODES,
  WRITE_VERB_OPTIONS,
} from "./write_verb_help.ts";
import { parseVerbArgs } from "./verb_args.ts";

export const MV_HELP = [
  "Usage: wiki file mv [OPTIONS] FROM TO",
  "",
  "  Move or rename a file, as a wiki edit (see wiki edit).",
  "",
  "  Every page that links to FROM is repointed at TO, in the link's own style",
  "  (wikilink or markdown, extension, ./ prefix, #fragment kept); FROM's own",
  "  relative links are re-derived when it changes directory; and wiki: CURIEs",
  "  and the page's IRI in other pages' frontmatter follow it. TO must not",
  "  exist (exit 3 if it does); --expect applies to FROM.",
  "",
  WRITE_VERB_EXIT_CODES,
  "",
  "Options:",
  ...WRITE_VERB_OPTIONS,
].join("\n");

export const RM_HELP = [
  "Usage: wiki file rm [OPTIONS] PATH",
  "",
  "  Delete a file, as a wiki edit (see wiki edit).",
  "",
  "  Refuses (exit 1, naming each linking page) while other pages link to",
  "  PATH, unless --prune-links turns those links into their plain label text.",
  "",
  WRITE_VERB_EXIT_CODES,
  "",
  "Options:",
  "  --prune-links  Replace inbound links with their label text.",
  ...WRITE_VERB_OPTIONS,
].join("\n");

export async function runMvCommand(
  wiki: Wiki,
  args: readonly string[],
): Promise<number> {
  const parsed = parseVerbArgs(args, MV_HELP, {
    valueOptions: [],
    flagOptions: [],
    expect: true,
  });
  if (typeof parsed === "number") return parsed;
  if (parsed.positionals.length !== 2) {
    return usageError("Error: wiki mv takes FROM and TO.");
  }
  const [from, to] = parsed.positionals as [string, string];
  return await applyAndReport(wiki, {
    ops: [{
      op: "move",
      from,
      to,
      ...(parsed.expect ? { expect: parsed.expect } : {}),
    }],
  }, parsed.run);
}

export async function runRmCommand(
  wiki: Wiki,
  args: readonly string[],
): Promise<number> {
  const parsed = parseVerbArgs(args, RM_HELP, {
    valueOptions: [],
    flagOptions: ["--prune-links"],
    expect: true,
  });
  if (typeof parsed === "number") return parsed;
  if (parsed.positionals.length !== 1) {
    return usageError("Error: wiki rm takes exactly one PATH.");
  }
  return await applyAndReport(wiki, {
    ops: [{
      op: "delete",
      path: parsed.positionals[0]!,
      ...(parsed.flags.has("--prune-links") ? { pruneLinks: true } : {}),
      ...(parsed.expect ? { expect: parsed.expect } : {}),
    }],
  }, parsed.run);
}
