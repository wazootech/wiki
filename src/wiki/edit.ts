/**
 * Guarded writes: stage an edit, validate it, then write it atomically.
 *
 * Agents used to change a wiki the way a human does in an editor: write the
 * Markdown, run `check`, read the diff, repeat. This module is the
 * semantics-aware alternative decided in wiki#353. An edit is a list of
 * operations (a {@link WikiEdit}, shaped like an LSP `WorkspaceEdit` so a
 * language-server adapter stays cheap, wiki#354), and applying one runs:
 *
 * 1. **Preconditions.** Each op may carry `expect`, the SHA-256 of the file's
 *    current bytes, or `"absent"` for a create. A mismatch means someone else
 *    changed the file since the caller read it, so nothing is written. This is
 *    what makes concurrent agents safe.
 * 2. **Containment.** Writes land only on wiki documents under `wiki.input`,
 *    never in `.wiki/` (installed sources and the cache), never through a
 *    symlink, never on an excluded path.
 * 3. **Staging.** New contents go into a {@link FileOverlay} that every read in
 *    `fspath.ts` consults, so validation sees the proposed tree with no writes.
 * 4. **Validation.** The ordinary `check` and `lint` passes run before and
 *    after, over the same scope, and only findings the edit *introduces* count.
 *    A wiki that is already broken elsewhere does not block an unrelated write.
 * 5. **Write**, only when asked: every file to a sibling temp file, then each
 *    renamed over its target, with byte-exact rollback if any step fails.
 *
 * The report is data, never an exception, for everything the caller can act on
 * (conflicts, rejections); a malformed edit throws {@link EditUsageError}.
 */

import { extname } from "@std/path";
import {
  buildCheckEnvelope,
  type CheckEnvelope,
  type CheckIssue,
} from "./check_report.ts";
import type { Config } from "./config.ts";
import { type FileOverlay, overlayKey, withOverlay } from "./fspath.ts";
import { LinkIndex } from "./wiki_links.ts";
import type {
  EditConflict,
  EditOptions,
  EditReport,
  WikiEdit,
} from "./edit/types.ts";
import { validateShape } from "./edit/validate_shape.ts";
import {
  contentHash,
  decode,
  type FilePlan,
  readBytes,
  safeRoute,
  sameBytes,
  type StagedMove,
  unchanged,
} from "./edit/plan_support.ts";
import { checkExpect, fileChange, report, targetPath } from "./edit/targets.ts";
import { stageMove } from "./edit/move.ts";
import { guardDelete } from "./edit/delete_guard.ts";
import { stage } from "./edit/stage.ts";
import { remapReport, scopedAudit } from "./edit/audit_scope.ts";
import { checkIssue, newIssues } from "./edit/issues.ts";
import { commitFiles } from "./edit/commit.ts";

export {
  EDIT_REPORT_VERSION,
  type EditConflict,
  type EditFileChange,
  type EditOp,
  type EditOptions,
  type EditReport,
  type EditStatus,
  type EditTarget,
  EditUsageError,
  type WikiEdit,
} from "./edit/types.ts";
export { contentHash, type FilePlan } from "./edit/plan_support.ts";
export { commitFiles, type CommitIo } from "./edit/commit.ts";

/**
 * Apply (or dry-run) an edit against `config`'s wiki.
 *
 * Validation is scoped, not whole-wiki: it re-checks the touched documents and
 * the pages that link to deleted ones. A page whose SHACL result depends on a
 * touched page without linking to it (say an `sh:class` constraint on an IRI
 * that page defines) is not re-validated, so an accepted edit can still break
 * it. `wiki check` over the whole wiki remains the full gate; run it in CI.
 */
export async function applyEdit(
  config: Config,
  edit: WikiEdit,
  options: EditOptions = {},
): Promise<EditReport> {
  const ops = validateShape(edit);
  const plans = new Map<string, FilePlan>();
  const conflicts: EditConflict[] = [];
  const moves: StagedMove[] = [];
  // Deletes that would leave links dangling: reported as errors of their own,
  // because a broken link is only a lint *warning* and would not block.
  const guards: CheckIssue[] = [];
  const planFor = (path: string): FilePlan => {
    let plan = plans.get(overlayKey(path));
    if (plan === undefined) {
      plan = { path, before: readBytes(path), after: null };
      plan.after = plan.before === null ? null : decode(plan.before);
      plans.set(overlayKey(path), plan);
    }
    return plan;
  };

  for (const op of ops) {
    if (op.op === "move") {
      const staged = stageMove(config, op, plans, planFor);
      if ("conflict" in staged) conflicts.push(staged.conflict);
      else moves.push(staged.move);
      continue;
    }
    const path = targetPath(config, op.path);
    const plan = planFor(path);
    const conflict = checkExpect(config, path, op.expect, plan.before);
    if (conflict !== null) {
      // Staging against a file that is not what the caller thinks it is would
      // only produce a misleading usage error ("cannot create a file that
      // exists"); the conflict is the real answer.
      conflicts.push(conflict);
      continue;
    }
    if (op.op === "delete" && plan.after !== null) {
      guards.push(
        ...guardDelete(config, plans, planFor, plan, op.pruneLinks ?? false),
      );
    }
    await stage(config, op, plan);
  }

  const files = [...plans.values()]
    .filter((plan) => !unchanged(plan))
    .map((plan) => fileChange(config, plan));

  if (conflicts.length > 0) {
    return report("conflict", files, conflicts, [], null);
  }
  if (guards.length > 0 && !(options.force ?? false)) {
    return report("rejected", files, [], guards, null);
  }

  const overlay: FileOverlay = {
    id: crypto.randomUUID(),
    files: new Map(
      [...plans.values()].map((plan) => [overlayKey(plan.path), plan.after]),
    ),
  };
  const validated = await validate(config, plans, overlay, moves);
  const envelope = validated.envelope;
  const introduced = [...guards, ...validated.introduced];
  const blocking = introduced.some((issue) => issue.severity === "error");
  if (blocking && !(options.force ?? false)) {
    return report("rejected", files, [], introduced, envelope);
  }
  if (!(options.apply ?? false)) {
    return report("dry_run", files, [], introduced, envelope);
  }

  // Re-check the preconditions at the last moment: validation took time, and a
  // write that clobbers a file changed meanwhile is exactly what `expect` is for.
  for (const plan of plans.values()) {
    const now = readBytes(plan.path);
    if (!sameBytes(now, plan.before)) {
      conflicts.push({
        path: config.relativeToRoot(plan.path).replaceAll("\\", "/"),
        expected: plan.before === null ? "absent" : contentHash(plan.before),
        actual: now === null ? null : contentHash(now),
      });
    }
  }
  if (conflicts.length > 0) {
    return report("conflict", files, conflicts, [], envelope);
  }

  commitFiles([...plans.values()].filter((plan) => !unchanged(plan)));
  return report("applied", files, [], introduced, envelope);
}

/**
 * Run the scoped audits before and after, and keep what the edit introduced.
 *
 * The scope is the touched documents plus every page that links to a deleted
 * one, run identically in both states so the comparison is like for like:
 * whole-wiki SHACL is skipped (as `check FILE...` skips it), so route safety
 * and output collisions, which scoped `check` omits, run here directly.
 */
async function validate(
  config: Config,
  plans: ReadonlyMap<string, FilePlan>,
  overlay: FileOverlay,
  moves: readonly StagedMove[] = [],
): Promise<{ introduced: CheckIssue[]; envelope: CheckEnvelope }> {
  const touched = [...plans.values()].map((plan) => plan.path);
  const deleted = [...plans.values()]
    .filter((plan) => plan.before !== null && plan.after === null)
    .map((plan) => plan.path);

  const backlinkRoutes = new Set<string>();
  if (deleted.length > 0) {
    const index = LinkIndex.fromConfig(config);
    for (const path of deleted) {
      const route = safeRoute(config, path);
      if (route === null) continue;
      for (const source of index.backlinksTo(route)) backlinkRoutes.add(source);
    }
  }

  // One route set for both runs. Computing it per run from the documents that
  // exist would lint nothing before a pure create (its route does not exist
  // yet) and the new route after, so every wiki-wide, path-less lint finding
  // would show up only in the after run and count as introduced.
  const lintRoutes = new Set(backlinkRoutes);
  for (const path of touched) {
    const route = safeRoute(config, path);
    if (route !== null && extname(path).toLowerCase() === ".md") {
      lintRoutes.add(route);
    }
  }

  const before = await scopedAudit(config, touched, lintRoutes);
  // A moved page's findings are anchored to its old route, path, and IRI
  // before the edit and to its new ones after; re-anchor the before side so a
  // finding the page already had does not count as introduced by the move.
  const beforeReport = remapReport(before.report, moves);
  return await withOverlay(overlay, async () => {
    const after = await scopedAudit(config, touched, lintRoutes);
    const introduced = newIssues(beforeReport, after.report).map((issue) =>
      checkIssue(config, issue)
    );
    const envelope = buildCheckEnvelope(after.report, config, after.documents);
    return { introduced, envelope };
  });
}
