import { extname } from "@std/path";
import type { Config } from "../config.ts";
import { splitFrontmatterText } from "../document.ts";
import { overlayKey, readText, withOverlay } from "../fspath.ts";
import { rewriteLinkTargets, rewriteMetadataRefs } from "../link_fix.ts";
import { documentDataFromPath } from "../parser.ts";
import { iterDocumentFiles } from "../paths.ts";
import { type EditConflict, EditUsageError, type MoveOp } from "./types.ts";
import {
  contentHash,
  type FilePlan,
  hasExplicitId,
  isMarkdown,
  overlayOf,
  relativePath,
  safeRoute,
  type StagedMove,
} from "./plan_support.ts";
import { checkExpect, targetPath } from "./targets.ts";
import { backlinkers } from "./delete_guard.ts";

/**
 * Stage a `move`: the page to its new path with its own relative links
 * re-derived from its new directory, every page linking to it repointed, and
 * every metadata reference to it (`wiki:` CURIE, or its derived IRI) rewritten.
 */
export function stageMove(
  config: Config,
  op: MoveOp,
  plans: Map<string, FilePlan>,
  planFor: (path: string) => FilePlan,
): { move: StagedMove } | { conflict: EditConflict } {
  const from = targetPath(config, op.from);
  const to = targetPath(config, op.to);
  if (overlayKey(from) === overlayKey(to)) {
    throw new EditUsageError(`${op.from}: a move needs a different target.`);
  }
  if (extname(from).toLowerCase() !== extname(to).toLowerCase()) {
    throw new EditUsageError(
      `${op.to}: a move keeps the document's extension (${extname(from)}).`,
    );
  }
  const fromPlan = planFor(from);
  const toPlan = planFor(to);
  const conflict = checkExpect(config, from, op.expect, fromPlan.before);
  if (conflict !== null) return { conflict };
  if (toPlan.after !== null) {
    return {
      conflict: {
        path: relativePath(config, to),
        expected: "absent",
        actual: contentHash(toPlan.before ?? toPlan.after),
      },
    };
  }
  const content = fromPlan.after;
  if (content === null) {
    throw new EditUsageError(`${op.from}: cannot move a missing file.`);
  }

  const oldRoute = safeRoute(config, from);
  const newRoute = safeRoute(config, to);
  const explicitId = withOverlay(
    overlayOf(plans),
    () =>
      hasExplicitId(
        documentDataFromPath(from, config.graph.content_predicate ?? undefined),
      ),
  );
  const base = config.context.baseIri;
  const derived = !explicitId && base !== "";
  const move: StagedMove = {
    fromPath: from,
    toPath: to,
    oldRoute,
    newRoute,
    oldIri: derived && oldRoute !== null ? `${base}${oldRoute}` : null,
    newIri: derived && newRoute !== null ? `${base}${newRoute}` : null,
  };
  if (oldRoute === null || newRoute === null) {
    // Nothing can be repointed at an unsafe route; route safety rejects it.
    toPlan.after = content;
    fromPlan.after = null;
    return { move };
  }

  const linkers = backlinkers(config, plans, oldRoute);
  const documents = withOverlay(
    overlayOf(plans),
    () => iterDocumentFiles(config),
  );
  const routeMap = new Map([[oldRoute, newRoute]]);
  const refs = [{ from: `wiki:${oldRoute}`, to: `wiki:${newRoute}` }];
  if (move.oldIri !== null && move.newIri !== null) {
    refs.push({ from: move.oldIri, to: move.newIri });
  }

  let moved = isMarkdown(from)
    ? rewriteLinkTargets(content, oldRoute, routeMap, newRoute)
    : content;
  moved = rewriteRefsIn(from, moved, refs);
  toPlan.after = moved;
  fromPlan.after = null;

  for (const [source, path] of linkers) {
    if (!isMarkdown(path)) continue;
    const plan = planFor(path);
    if (plan.after === null) continue;
    plan.after = rewriteLinkTargets(plan.after, source, routeMap);
  }
  for (const path of documents) {
    if (overlayKey(path) === overlayKey(from)) continue;
    const current = plans.get(overlayKey(path))?.after ?? readText(path);
    if (!refs.some((ref) => current.includes(ref.from))) continue;
    const next = rewriteRefsIn(path, current, refs);
    if (next !== current) planFor(path).after = next;
  }
  return { move };
}

/** Rewrite metadata references: a page's frontmatter, or a whole data file. */
function rewriteRefsIn(
  path: string,
  text: string,
  refs: ReadonlyArray<{ readonly from: string; readonly to: string }>,
): string {
  if (!isMarkdown(path)) return rewriteMetadataRefs(text, refs);
  const { prefix } = splitFrontmatterText(text);
  if (prefix === "") return text;
  return rewriteMetadataRefs(prefix, refs) + text.slice(prefix.length);
}
