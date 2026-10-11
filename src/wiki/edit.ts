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

import { basename, dirname, extname, join, resolve } from "@std/path";
import { runCheck, runLint } from "./audit.ts";
import { DocumentBatch } from "./batch.ts";
import {
  buildCheckEnvelope,
  type CheckEnvelope,
  type CheckIssue,
} from "./check_report.ts";
import type { Config } from "./config.ts";
import {
  EditOpError,
  patchContent,
  requiredFields,
  scaffoldPage,
  setField,
  typeKey,
} from "./edit_ops.ts";
import { splitFrontmatterText } from "./document.ts";
import { ValueError } from "./errors.ts";
import { formatMarkdown } from "./fmt_util.ts";
import {
  type FileOverlay,
  isSymlink,
  overlayKey,
  readText,
  relativeWithin,
  withOverlay,
} from "./fspath.ts";
import {
  pruneLinksTo,
  rewriteLinkTargets,
  rewriteMetadataRefs,
} from "./link_fix.ts";
import { DOCUMENT_EXTENSIONS, documentDataFromPath } from "./parser.ts";
import {
  buildPageManifest,
  detectOutputCollisions,
  iterDocumentFiles,
  routeForDocumentFile,
  validateRouteSafety,
} from "./paths.ts";
import { AuditReport, type Issue, severityIssues } from "./schemas/reports.ts";
import { sha256Hex } from "./sha256.ts";
import { LinkIndex } from "./wiki_links.ts";

/** Where a `patch` op lands in a page. */
export type EditTarget =
  | { readonly heading: string }
  | { readonly frontmatter: true }
  | { readonly body: true };

/**
 * One operation in a {@link WikiEdit}.
 *
 * Paths are relative to the config root (or absolute): an edit plan is an
 * artifact handed between agents, so it must not depend on anyone's cwd.
 * `expect` is checked against the file as it is on disk before the edit, even
 * when an earlier op in the same edit touched it.
 *
 * A `create` takes either the page's full `content`, or a typed scaffold:
 * `type` (a class such as `schema:Purchase`), `frontmatter`, and `body`, from
 * which the page is built with the type's required fields first and an H1.
 *
 * A `move` relocates a page and repoints every link to it (see
 * {@link rewriteLinkTargets}); its `expect` applies to `from`, and `to` must
 * not exist. A `delete` refuses while other pages link to the page, unless
 * `pruneLinks` turns those links into plain text.
 */
export type EditOp =
  | {
    readonly op: "create";
    readonly path: string;
    readonly content?: string;
    readonly type?: string;
    readonly frontmatter?: Readonly<Record<string, unknown>>;
    readonly body?: string;
    readonly expect?: "absent";
  }
  | {
    readonly op: "replace";
    readonly path: string;
    readonly content: string;
    readonly expect?: string;
  }
  | {
    readonly op: "delete";
    readonly path: string;
    readonly expect?: string;
    /** Replace inbound links with their label text instead of refusing. */
    readonly pruneLinks?: boolean;
  }
  | {
    readonly op: "set";
    readonly path: string;
    readonly field: string;
    /** `null` removes the field. */
    readonly value?: unknown;
    /**
     * The value as YAML source, kept verbatim (`"12.00"` stays `12.00`, where
     * the JSON `12.00` is the number `12`). Exclusive with `value`.
     */
    readonly yaml?: string;
    readonly expect?: string;
  }
  | {
    readonly op: "patch";
    readonly path: string;
    readonly target: EditTarget;
    readonly mode: "append" | "prepend" | "replace";
    readonly content: string;
    readonly expect?: string;
  }
  | {
    readonly op: "move";
    readonly from: string;
    readonly to: string;
    readonly expect?: string;
  };

/** A batch of operations, validated once and written all-or-nothing. */
export interface WikiEdit {
  readonly ops: readonly EditOp[];
}

export interface EditOptions {
  /** Write the edit. Without it, the edit is validated and reported only. */
  readonly apply?: boolean;
  /** Write even when the edit introduces errors (they are still reported). */
  readonly force?: boolean;
}

/**
 * - `dry_run`: valid, not written (no `apply`).
 * - `applied`: written.
 * - `rejected`: introduces errors (or would leave links dangling) and was not
 *   written (no `force`).
 * - `conflict`: an `expect` precondition failed; nothing was validated or written.
 */
export type EditStatus = "dry_run" | "applied" | "rejected" | "conflict";

/** What the edit does to one file. Hashes are SHA-256 of the raw bytes. */
export interface EditFileChange {
  /** Relative to the config root, `/`-separated. */
  readonly path: string;
  readonly action: "create" | "modify" | "delete";
  /** `null` when the file did not exist. */
  readonly before: string | null;
  /** `null` when the file is deleted; pass it as the next edit's `expect`. */
  readonly after: string | null;
}

/** An `expect` that did not match the file on disk. */
export interface EditConflict {
  readonly path: string;
  readonly expected: string;
  /** The file's current hash, or `null` when it does not exist. */
  readonly actual: string | null;
}

/** Bumped only when a field is renamed, removed, or changes meaning. */
export const EDIT_REPORT_VERSION = 1;

/** The `wiki edit --json` payload. */
export interface EditReport {
  readonly version: typeof EDIT_REPORT_VERSION;
  readonly status: EditStatus;
  /** `true` for `dry_run` and `applied`. */
  readonly ok: boolean;
  readonly files: readonly EditFileChange[];
  readonly conflicts: readonly EditConflict[];
  /** Findings present after the edit and absent before it. */
  readonly introduced: readonly CheckIssue[];
  /** The scoped `check -f json` envelope of the edited tree (wiki#310 shape). */
  readonly check: CheckEnvelope | null;
}

/** A malformed edit: unknown op, bad path, or an op not supported yet. */
export class EditUsageError extends ValueError {
  constructor(message: string) {
    super(message);
    this.name = "EditUsageError";
  }
}

/** The SHA-256 a caller passes as `expect`: over the file's raw bytes. */
export function contentHash(bytes: Uint8Array | string): string {
  return sha256Hex(
    typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes,
  );
}

/** One file's resolved state across the edit. */
interface FilePlan {
  readonly path: string;
  /** On-disk bytes before the edit, or `null` when absent. Kept for rollback. */
  readonly before: Uint8Array | null;
  /** Staged text, or `null` for a delete. */
  after: string | null;
}

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

/** A move as staged, kept so validation can match findings across it. */
interface StagedMove {
  readonly fromPath: string;
  readonly toPath: string;
  /** `null` when the path is not route-safe; validation then rejects it. */
  readonly oldRoute: string | null;
  readonly newRoute: string | null;
  /** The page's derived IRI before and after, or `null` with an explicit `@id`. */
  readonly oldIri: string | null;
  readonly newIri: string | null;
}

/** A throwaway overlay of everything staged so far. */
function overlayOf(plans: ReadonlyMap<string, FilePlan>): FileOverlay {
  return {
    id: crypto.randomUUID(),
    files: new Map(
      [...plans.values()].map((plan) => [overlayKey(plan.path), plan.after]),
    ),
  };
}

function isMarkdown(path: string): boolean {
  return extname(path).toLowerCase() === ".md";
}

function relativePath(config: Config, path: string): string {
  return config.relativeToRoot(path).replaceAll("\\", "/");
}

/** An `@id` or `id` the page sets itself: its IRI then survives a move. */
function hasExplicitId(data: Record<string, unknown> | null): boolean {
  if (data === null) return false;
  return [data["@id"], data["id"]].some((value) =>
    value !== undefined && value !== null && value !== ""
  );
}

/**
 * The pages (route, path) whose body links to `route` in the staged tree, not
 * counting the page itself.
 */
function backlinkers(
  config: Config,
  plans: ReadonlyMap<string, FilePlan>,
  route: string,
): Array<readonly [string, string]> {
  return withOverlay(overlayOf(plans), () => {
    const sources = new Set(
      LinkIndex.fromConfig(config).backlinksTo(route).filter((source) =>
        source !== route
      ),
    );
    const found: Array<readonly [string, string]> = [];
    for (const path of iterDocumentFiles(config)) {
      const source = safeRoute(config, path);
      if (source !== null && sources.has(source)) found.push([source, path]);
    }
    return found;
  });
}

/**
 * Stage a `move`: the page to its new path with its own relative links
 * re-derived from its new directory, every page linking to it repointed, and
 * every metadata reference to it (`wiki:` CURIE, or its derived IRI) rewritten.
 */
function stageMove(
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

/**
 * The dangling links a delete would leave, as `dangling_links` errors (one per
 * linking page), or none when `prune` rewrites those links to plain text.
 */
function guardDelete(
  config: Config,
  plans: Map<string, FilePlan>,
  planFor: (path: string) => FilePlan,
  plan: FilePlan,
  prune: boolean,
): CheckIssue[] {
  const route = safeRoute(config, plan.path);
  if (route === null) return [];
  const linkers = backlinkers(config, plans, route).filter(([, path]) =>
    isMarkdown(path)
  );
  if (prune) {
    for (const [source, path] of linkers) {
      const linker = planFor(path);
      if (linker.after === null) continue;
      linker.after = pruneLinksTo(linker.after, source, new Set([route]));
    }
    return [];
  }
  return linkers.map(([source, path]) => ({
    code: "dangling_links",
    severity: "error",
    message: `${source} links to ${route}, which this edit deletes; remove ` +
      `the links first, or prune them (pruneLinks, wiki rm --prune-links).`,
    path: relativePath(config, path),
    route: source,
  }));
}

function report(
  status: EditStatus,
  files: readonly EditFileChange[],
  conflicts: readonly EditConflict[],
  introduced: readonly CheckIssue[],
  check: CheckEnvelope | null,
): EditReport {
  return {
    version: EDIT_REPORT_VERSION,
    status,
    ok: status === "dry_run" || status === "applied",
    files,
    conflicts,
    introduced,
    check,
  };
}

/** The op kinds the contract names. */
const KNOWN_OPS: ReadonlySet<string> = new Set([
  "create",
  "replace",
  "delete",
  "set",
  "patch",
  "move",
]);

type FileOp = Exclude<EditOp, { op: "move" }>;
type MoveOp = Extract<EditOp, { op: "move" }>;

const PATCH_MODES: ReadonlySet<string> = new Set([
  "append",
  "prepend",
  "replace",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Check an edit's shape before touching anything.
 *
 * Edits arrive as JSON from agents, so the types above are a hope, not a fact:
 * every field the handlers read is checked here, and the message names the op
 * by index so the agent can fix its plan.
 */
function validateShape(edit: WikiEdit): EditOp[] {
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

/** The per-kind field checks behind {@link validateShape}. */
function validateOpFields(
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

/**
 * Resolve an op's path and refuse anything outside the wiki's own documents.
 *
 * Installed sources are appended to `wiki.input` at load time but live under
 * `.wiki/`, so the `.wiki/` rule is what keeps them read-only.
 */
function targetPath(config: Config, raw: string): string {
  const path = resolve(config.config_root, raw);
  const extension = extname(path).toLowerCase();
  if (!DOCUMENT_EXTENSIONS.has(extension)) {
    throw new EditUsageError(
      `${raw}: only wiki documents (${
        [...DOCUMENT_EXTENSIONS].sort().join(", ")
      }) can be edited.`,
    );
  }
  if (within(path, join(config.config_root, ".wiki"))) {
    throw new EditUsageError(
      `${raw}: files under .wiki/ (installed sources, cache) are read-only.`,
    );
  }
  if (!config.wiki.input.some((input) => within(path, input))) {
    throw new EditUsageError(`${raw}: not under any wiki.input directory.`);
  }
  if (config.isExcluded(path)) {
    throw new EditUsageError(`${raw}: excluded by wiki.exclude.`);
  }
  if (isSymlink(path)) {
    throw new EditUsageError(`${raw}: refusing to write through a symlink.`);
  }
  return path;
}

function within(path: string, base: string): boolean {
  try {
    relativeWithin(path, base);
    return true;
  } catch {
    return false;
  }
}

function readBytes(path: string): Uint8Array | null {
  try {
    return Deno.readFileSync(path);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return null;
    throw error;
  }
}

function decode(bytes: Uint8Array): string {
  const text = new TextDecoder().decode(bytes);
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function sameBytes(a: Uint8Array | null, b: Uint8Array | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.byteLength !== b.byteLength) return false;
  return a.every((byte, index) => byte === b[index]);
}

function checkExpect(
  config: Config,
  path: string,
  expect: string | undefined,
  before: Uint8Array | null,
): EditConflict | null {
  if (expect === undefined) return null;
  const actual = before === null ? null : contentHash(before);
  const matches = expect === "absent"
    ? actual === null
    : actual === expect.toLowerCase();
  if (matches) return null;
  return {
    path: config.relativeToRoot(path).replaceAll("\\", "/"),
    expected: expect,
    actual,
  };
}

/**
 * Apply one op to a file's staged text.
 *
 * `set` and `patch` re-run `wiki fmt` on their result only when the page was
 * already fmt-clean, so an edit to an unformatted page does not smuggle an
 * unrelated reformat into its diff. A typed create is always formatted: it is
 * new text, and it should arrive the way `fmt` would leave it.
 */
async function stage(
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

function formatIfMarkdown(config: Config, path: string, text: string): string {
  if (extname(path).toLowerCase() !== ".md") return text;
  return formatMarkdown(text, path, config);
}

function unchanged(plan: FilePlan): boolean {
  if (plan.before === null || plan.after === null) {
    return plan.before === null && plan.after === null;
  }
  return sameBytes(new TextEncoder().encode(plan.after), plan.before);
}

function fileChange(config: Config, plan: FilePlan): EditFileChange {
  return {
    path: config.relativeToRoot(plan.path).replaceAll("\\", "/"),
    action: plan.before === null
      ? "create"
      : plan.after === null
      ? "delete"
      : "modify",
    before: plan.before === null ? null : contentHash(plan.before),
    after: plan.after === null ? null : contentHash(plan.after),
  };
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

async function scopedAudit(
  config: Config,
  touched: readonly string[],
  lintRoutes: ReadonlySet<string>,
): Promise<{ report: AuditReport; documents: string[] }> {
  const existing = new Set(iterDocumentFiles(config).map(overlayKey));
  const documents = touched.filter((path) => existing.has(overlayKey(path)));

  let report = AuditReport.empty();
  // An empty batch means "the whole wiki" to DocumentBatch, so skip instead.
  if (documents.length > 0) {
    const batch = new DocumentBatch(config, documents);
    report = report.merge(
      await runCheck(config, {
        fileFilter: batch.routeFilter(),
        filePaths: batch.documentPaths(),
      }),
    );
  }

  if (lintRoutes.size > 0) {
    report = report.merge(await runLint(config, new Set(lintRoutes)));
  }

  const safety = validateRouteSafety(config);
  if (safety.length > 0) {
    report = report.merge(
      new AuditReport({
        ok: false,
        errors: severityIssues("route_safety", safety, "error"),
      }),
    );
  } else {
    const baseUrl = config.site.base_url;
    const outputDir = baseUrl === ""
      ? "_site"
      : join("_site", baseUrl.replace(/^\/+|\/+$/g, ""));
    const collisions = detectOutputCollisions(
      buildPageManifest(config, outputDir, baseUrl, config.site.url_style),
    );
    if (collisions.length > 0) {
      report = report.merge(
        new AuditReport({
          ok: false,
          errors: severityIssues("output_collision", collisions, "error"),
        }),
      );
    }
  }
  return { report, documents };
}

function safeRoute(config: Config, path: string): string | null {
  try {
    return routeForDocumentFile(config, path);
  } catch {
    return null;
  }
}

/** {@link remapIssue} over a whole report. */
function remapReport(
  report: AuditReport,
  moves: readonly StagedMove[],
): AuditReport {
  if (moves.length === 0) return report;
  return new AuditReport({
    ok: report.ok,
    errors: report.errors.map((issue) => remapIssue(issue, moves)),
    warnings: report.warnings.map((issue) => remapIssue(issue, moves)),
  });
}

/** A pre-move finding, re-anchored to where the moved page now lives. */
function remapIssue(issue: Issue, moves: readonly StagedMove[]): Issue {
  for (const move of moves) {
    const onRoute = move.oldRoute !== null && issue.route === move.oldRoute;
    const onPath = typeof issue.path === "string" &&
      overlayKey(issue.path) === overlayKey(move.fromPath);
    // Lint findings often carry no route or path, only a message that opens
    // with the page's route or file name (`In Beta:`, `In Beta.md:3:`).
    const prefixes: Array<readonly [string, string]> = [
      [`In ${basename(move.fromPath)}:`, `In ${basename(move.toPath)}:`],
    ];
    if (move.oldRoute !== null && move.newRoute !== null) {
      prefixes.push([`In ${move.oldRoute}:`, `In ${move.newRoute}:`]);
    }
    const prefixed = prefixes.find(([old]) => issue.message.startsWith(old));
    if (!onRoute && !onPath && prefixed === undefined) continue;
    let message = issue.message;
    if (prefixed !== undefined) {
      message = prefixed[1] + message.slice(prefixed[0].length);
    }
    if (onRoute || onPath) {
      message = message.replaceAll(
        basename(move.fromPath),
        basename(move.toPath),
      );
    }
    const remapIri = (value: string | null | undefined) => {
      if (!value || move.oldIri === null || move.newIri === null) return value;
      const rest = value.slice(move.oldIri.length);
      return value.startsWith(move.oldIri) && /^(?:$|[.#])/.test(rest)
        ? move.newIri + rest
        : value;
    };
    return {
      ...issue,
      message,
      ...(onRoute ? { route: move.newRoute } : {}),
      ...(onPath ? { path: move.toPath } : {}),
      ...(issue.results === undefined ? {} : {
        results: issue.results.map((result) => ({
          ...result,
          focusNode: remapIri(result.focusNode) ?? null,
        })),
      }),
    };
  }
  return issue;
}

/**
 * Identity of a finding for the before/after comparison.
 *
 * Structured SHACL and JSON Schema results are compared by what failed (field,
 * constraint, shape, schema keyword), not by message text, which embeds
 * values that change with any edit. One issue can carry several results, so it
 * yields one key per result.
 */
function issueKeys(issue: Issue): string[] {
  const anchor = issue.route ?? (issue.path ? overlayKey(issue.path) : "");
  const results = issue.results ?? [];
  if (results.length === 0) {
    // A wikilink quoted in a message (`link_style`) is the link's text, which
    // a move rewrites; the finding (a wikilink on that line) is the same one.
    const message = issue.message.replace(/\[\[[^\]]*\]\]/g, "[[]]");
    return [[issue.code, anchor, message].join("\0")];
  }
  return results.map((result) =>
    [
      issue.code,
      anchor,
      result.check,
      result.focusNode ?? "",
      result.resultPath ?? "",
      result.sourceConstraintComponent ?? "",
      (result.sourceShapes ?? []).map((shape) => shape.iri).join(","),
      result.schema ?? "",
      result.keyword ?? "",
      JSON.stringify(result.instancePath ?? []),
    ].join("\0")
  );
}

/** Issues in `after` whose keys outnumber their occurrences in `before`. */
function newIssues(before: AuditReport, after: AuditReport): Issue[] {
  const counts = new Map<string, number>();
  for (const issue of [...before.errors, ...before.warnings]) {
    for (const key of issueKeys(issue)) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const introduced: Issue[] = [];
  for (const issue of [...after.errors, ...after.warnings]) {
    let fresh = false;
    for (const key of issueKeys(issue)) {
      const remaining = counts.get(key) ?? 0;
      if (remaining > 0) counts.set(key, remaining - 1);
      else fresh = true;
    }
    if (fresh) introduced.push(issue);
  }
  return introduced;
}

function checkIssue(config: Config, issue: Issue): CheckIssue {
  return {
    code: issue.code,
    severity: issue.severity ?? "error",
    message: issue.message,
    path: issue.path
      ? config.relativeToRoot(issue.path).replaceAll("\\", "/")
      : null,
    route: issue.route ?? null,
  };
}

/** The filesystem calls a commit makes; injectable so tests can fail one. */
export interface CommitIo {
  writeFile(path: string, data: Uint8Array): void;
  rename(from: string, to: string): void;
  remove(path: string): void;
  mkdir(path: string): void;
}

const DENO_IO: CommitIo = {
  writeFile: (path, data) => Deno.writeFileSync(path, data),
  rename: (from, to) => Deno.renameSync(from, to),
  remove: (path) => Deno.removeSync(path),
  mkdir: (path) => Deno.mkdirSync(path, { recursive: true }),
};

/**
 * Write every staged file, or none of them.
 *
 * All new contents go to sibling temp files first, so the commit itself is
 * only renames (atomic per file on POSIX and, via `MoveFileExW` with
 * `REPLACE_EXISTING`, on Windows). Deletes go last because they are the one
 * step a rename cannot stage. If any step fails, what was done is undone in
 * reverse from the byte-exact pre-images, and the original error is rethrown.
 */
export function commitFiles(
  plans: readonly FilePlan[],
  io: CommitIo = DENO_IO,
): void {
  const token = crypto.randomUUID().slice(0, 8);
  const temps = new Map<FilePlan, string>();
  const done: FilePlan[] = [];
  // Directories this commit creates, so a rollback can take them away again.
  const createdDirs: string[] = [];
  try {
    for (const plan of plans) {
      if (plan.after === null) continue;
      for (const dir of missingAncestors(dirname(plan.path))) {
        if (!createdDirs.includes(dir)) createdDirs.push(dir);
      }
      io.mkdir(dirname(plan.path));
      const temp = join(
        dirname(plan.path),
        `.${basename(plan.path)}.${token}.wiki-edit.tmp`,
      );
      io.writeFile(temp, new TextEncoder().encode(plan.after));
      temps.set(plan, temp);
    }
    for (const [plan, temp] of temps) {
      io.rename(temp, plan.path);
      temps.delete(plan);
      done.push(plan);
    }
    for (const plan of plans) {
      if (plan.after !== null) continue;
      io.remove(plan.path);
      done.push(plan);
    }
  } catch (error) {
    for (const temp of temps.values()) {
      try {
        Deno.removeSync(temp);
      } catch {
        // A temp that was never written has nothing to clean up.
      }
    }
    for (const plan of done.reverse()) restore(plan);
    removeEmptyDirs(createdDirs);
    throw error;
  }
}

/** `dir` and its ancestors that do not exist yet, outermost first. */
function missingAncestors(dir: string): string[] {
  const missing: string[] = [];
  let cursor = resolve(dir);
  while (true) {
    try {
      Deno.statSync(cursor);
      break;
    } catch {
      missing.unshift(cursor);
    }
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return missing;
}

/**
 * Remove directories a failed commit created, deepest first, but only while
 * empty: anything another process put there in the meantime is not ours.
 */
function removeEmptyDirs(dirs: readonly string[]): void {
  const deepestFirst = [...dirs].sort((a, b) => b.length - a.length);
  for (const dir of deepestFirst) {
    try {
      Deno.removeSync(dir);
    } catch {
      // Not empty, or already gone: either way it is not ours to remove.
    }
  }
}

/** Put one file back exactly as it was before the edit. */
function restore(plan: FilePlan): void {
  if (plan.before === null) {
    Deno.removeSync(plan.path);
    return;
  }
  const temp = `${plan.path}.wiki-edit-restore.tmp`;
  Deno.writeFileSync(temp, plan.before);
  Deno.renameSync(temp, plan.path);
}

export type { FilePlan };
