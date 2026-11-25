import { pageLinkMatches } from "./wiki_links.ts";
import { WIKILINK_FULL_REGEX } from "./document.ts";
import { splitTarget } from "./links.ts";
import { readTextTolerant } from "./parser.ts";
import type { BrokenLinkFix } from "./schemas/domain.ts";
import { replaceTargetInMatch } from "./link_fix/rewrite.ts";

export { findBrokenLinkFixes, remainingBrokenLinks } from "./link_fix/find.ts";
export { rewriteLinkTargets } from "./link_fix/rewrite.ts";

/**
 * Replace every link to one of `routes` with its plain text: the
 * `--prune-links` half of `wiki rm`. `[label](X.md)` becomes `label`,
 * `[[X|label]]` becomes `label`, and `[[X]]` becomes `X`.
 */
export function pruneLinksTo(
  content: string,
  sourceRoute: string,
  routes: ReadonlySet<string>,
): string {
  const matches = pageLinkMatches(sourceRoute, content);
  let out = content;
  for (const match of [...matches].reverse()) {
    if (match.route === null || !routes.has(match.route)) continue;
    let text: string;
    if (match.kind === "WikiLink") {
      const parsed = new RegExp(WIKILINK_FULL_REGEX.source).exec(
        match.fullMatch,
      );
      text = parsed?.[2] ?? splitTarget(match.target)[0];
    } else {
      text = /^!?\[([^\]]*)\]/.exec(match.fullMatch)?.[1] ?? "";
    }
    out = out.slice(0, match.start) + text + out.slice(match.end);
  }
  return out;
}

/** Metadata keys that hold a document's own identity, never a reference. */
const IDENTITY_KEY_LINE = /^\s*(?:-\s*)?["']?(?:@id|id)["']?\s*:/;

/**
 * Rewrite references to moved pages in metadata text: `wiki:` CURIEs (which
 * name a route) and, when given, full page IRIs.
 *
 * The edit is textual and token-exact, so the YAML or JSON around it keeps its
 * formatting: a reference matches only as a whole scalar (bounded by quotes,
 * whitespace, `,`, `[`, `]`, or line ends), with an optional `.md` and
 * `#fragment` carried over. Lines that set the document's own `@id`/`id` are
 * left alone: an explicit identity does not change when the file moves.
 */
export function rewriteMetadataRefs(
  text: string,
  refs: ReadonlyArray<{ readonly from: string; readonly to: string }>,
): string {
  if (refs.length === 0) return text;
  const escape = (value: string) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.split(/(?<=\n)/).map((line) => {
    if (IDENTITY_KEY_LINE.test(line)) return line;
    let out = line;
    for (const { from, to } of refs) {
      const pattern = new RegExp(
        `(?<=^|[\\s"'\\[,])${
          escape(from)
        }(?=(?:\\.md)?(?:#[^\\s"',\\]]*)?(?:$|[\\s"',\\]]))`,
        "g",
      );
      out = out.replace(pattern, to);
    }
    return out;
  }).join("");
}

export function applyBrokenLinkFixes(
  fixes: readonly BrokenLinkFix[],
  dryRun = false,
): string[] {
  const byPath = new Map<string, { path: string; fixes: BrokenLinkFix[] }>();
  for (const fix of fixes) {
    const key = fix.issue.source_path;
    const entry = byPath.get(key) ?? { path: fix.issue.source_path, fixes: [] };
    entry.fixes.push(fix);
    byPath.set(key, entry);
  }

  const changed: string[] = [];
  for (const { path, fixes: pathFixes } of byPath.values()) {
    let content = readTextTolerant(path);
    pathFixes.sort((left, right) =>
      (right.issue.match_start ?? 0) - (left.issue.match_start ?? 0)
    );
    for (const fix of pathFixes) {
      const { match_start: start, match_end: end, full_match: fullMatch } =
        fix.issue;
      if (start === null || end === null || fullMatch === null) continue;
      if (content.slice(start, end) !== fullMatch) continue;
      const replacement = replaceTargetInMatch(
        fix.issue,
        fix.replacement_target,
      );
      content = content.slice(0, start) + replacement + content.slice(end);
    }
    if (!dryRun) Deno.writeTextFileSync(path, content);
    changed.push(path);
  }
  return changed;
}
