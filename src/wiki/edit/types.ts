import type { CheckEnvelope, CheckIssue } from "../check_report.ts";
import { ValueError } from "../errors.ts";

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

export type FileOp = Exclude<EditOp, { op: "move" }>;
export type MoveOp = Extract<EditOp, { op: "move" }>;
