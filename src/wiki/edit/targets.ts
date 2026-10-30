import { extname, join, resolve } from "@std/path";
import type { CheckEnvelope, CheckIssue } from "../check_report.ts";
import type { Config } from "../config.ts";
import { isSymlink } from "../fspath.ts";
import { DOCUMENT_EXTENSIONS } from "../parser.ts";
import {
  EDIT_REPORT_VERSION,
  type EditConflict,
  type EditFileChange,
  type EditReport,
  type EditStatus,
  EditUsageError,
} from "./types.ts";
import { contentHash, type FilePlan, within } from "./plan_support.ts";

export function report(
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

/**
 * Resolve an op's path and refuse anything outside the wiki's own documents.
 *
 * Installed sources are appended to `wiki.input` at load time but live under
 * `.wiki/`, so the `.wiki/` rule is what keeps them read-only.
 */
export function targetPath(config: Config, raw: string): string {
  const path = resolve(config.config_root, raw);
  const extension = extname(path).toLowerCase();
  if (!DOCUMENT_EXTENSIONS.has(extension)) {
    throw new EditUsageError(
      `${raw}: only wiki document files (${
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

export function checkExpect(
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

export function fileChange(config: Config, plan: FilePlan): EditFileChange {
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
