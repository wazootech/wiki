/**
 * Source declarations, graph descriptors, and the lockfile.
 *
 * Port of `src/wiki/schemas/sources.py`. The lockfile is machine-authored and
 * committed, so its serialization is contract: two-space indent, no trailing
 * newline, UTF-8 without a BOM, and field order as declared.
 */

import type { Path } from "../fspath.ts";
import { readTextTolerant } from "../parser.ts";
import { type ModelSpec, validateModel } from "./model.ts";
import type { ValidationIssue } from "./validation.ts";

/** `wiki.lock` schema version this build writes and reads. */
export const LOCKFILE_VERSION = 2;

/** Committed lockfile name. */
export const LOCKFILE_FILENAME = "wiki.lock";

/** A single external source declared in `wiki.yml`. */
export interface SourceConfig {
  readonly name: string;
  readonly type: "git";
  readonly url: string;
  readonly ref: string | null | undefined;
  readonly path: string | null | undefined;
}

/** Read-only description of a graph participating in a composed wiki. */
export interface GraphDescriptor {
  readonly name: string;
  readonly uri: string;
  readonly kind: "root" | "source";
  readonly source_name: string | null;
  readonly source_type: "git" | null;
  readonly url: string | null;
  readonly ref: string | null;
  readonly resolved_ref: string | null;
  readonly path: string | null;
  readonly local_path: Path | null;
  readonly required_by: readonly string[];
}

/**
 * A pinned source entry in `wiki.lock`.
 *
 * `required_by` lists the names of sources — or `"root"` for top-level entries
 * declared directly in the root `wiki.yml` — that depend on this source. An
 * empty list means the source is a top-level root entry.
 */
export interface LockedSource {
  readonly url: string;
  readonly resolved_ref: string;
  readonly ref: string | null;
  readonly path: string | null;
  readonly fetched_at: string;
  readonly required_by: readonly string[];
}

/** Machine-authored lockfile recording pinned source state. */
export interface Lockfile {
  readonly version: number;
  readonly sources: ReadonlyMap<string, LockedSource>;
}

export const sourceConfigSpec: ModelSpec = {
  label: "SourceConfig",
  forbidExtra: true,
  fields: [
    ["name", { required: true }],
    ["type", { required: true, literal: ["git"] }],
    ["url", { required: true }],
    ["ref", { defaultValue: null }],
    ["path", { defaultValue: null }],
  ],
};

export const graphDescriptorSpec: ModelSpec = {
  label: "GraphDescriptor",
  forbidExtra: true,
  fields: [
    ["name", { required: true }],
    ["uri", { required: true }],
    ["kind", { required: true, literal: ["root", "source"] }],
    ["source_name", { defaultValue: null }],
    ["source_type", { defaultValue: null, literal: ["git"] }],
    ["url", { defaultValue: null }],
    ["ref", { defaultValue: null }],
    ["resolved_ref", { defaultValue: null }],
    ["path", { defaultValue: null }],
    ["local_path", { defaultValue: null }],
    ["required_by", { factory: () => [] }],
  ],
};

const lockedSourceSpec: ModelSpec = {
  label: "LockedSource",
  forbidExtra: true,
  fields: [
    ["url", { required: true }],
    ["resolved_ref", { defaultValue: "" }],
    ["ref", { defaultValue: null }],
    ["path", { defaultValue: null }],
    ["fetched_at", { defaultValue: "" }],
    ["required_by", { factory: () => [] }],
  ],
};

/** Validate a `SourceConfig` from raw config input. */
export function coerceSourceConfig(
  raw: unknown,
  loc: readonly (string | number)[] = [],
  issues: ValidationIssue[] = [],
): SourceConfig {
  return validateModel(
    sourceConfigSpec,
    raw,
    loc,
    issues,
  ) as unknown as SourceConfig;
}

/** Validate a `GraphDescriptor` from raw input. */
export function coerceGraphDescriptor(
  raw: unknown,
  loc: readonly (string | number)[] = [],
  issues: ValidationIssue[] = [],
): GraphDescriptor {
  return validateModel(
    graphDescriptorSpec,
    raw,
    loc,
    issues,
  ) as unknown as GraphDescriptor;
}

/** An empty lockfile, as `Lockfile()` produces. */
export function emptyLockfile(): Lockfile {
  return { version: LOCKFILE_VERSION, sources: new Map() };
}

/**
 * Read a lockfile, treating anything unreadable as an empty one.
 *
 * A corrupt or partial `wiki.lock` must never block a command: the Python
 * original swallows the failure and lets the next `sources` operation rebuild
 * it, and a hard failure here would strand a user whose lockfile was truncated
 * by an interrupted checkout.
 */
export function loadLockfile(path: Path): Lockfile {
  if (!path.exists()) return emptyLockfile();
  try {
    const data: unknown = JSON.parse(readTextTolerant(path));
    const issues: ValidationIssue[] = [];
    const values = validateModel(lockfileSpec, data, [], issues);
    if (issues.length > 0) return emptyLockfile();
    return {
      version: values["version"] as number,
      sources: values["sources"] as Map<string, LockedSource>,
    };
  } catch {
    return emptyLockfile();
  }
}

/** Write a lockfile the way `Lockfile.save` does: 2-space indent, no BOM. */
export function saveLockfile(lockfile: Lockfile, path: Path): void {
  const sources: Record<string, unknown> = {};
  for (const [name, entry] of lockfile.sources) sources[name] = entry;
  const payload = { version: lockfile.version, sources };
  path.writeText(`${JSON.stringify(payload, null, 2)}`);
}

/**
 * The current instant as Python's `datetime.now(UTC).isoformat()` spells it.
 *
 * `Date.prototype.toISOString` rounds to milliseconds and writes `Z`, which
 * would make a freshly written lockfile differ from the oracle's on every run.
 */
export function lockfileTimestamp(now: Date = new Date()): string {
  const pad = (value: number, width = 2) => String(value).padStart(width, "0");
  const micros = `${pad(now.getUTCMilliseconds(), 3)}000`;
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${
    pad(now.getUTCDate())
  }` +
    `T${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${
      pad(now.getUTCSeconds())
    }` +
    `.${micros}+00:00`;
}

/** The `Lockfile` model, with its `dict[str, LockedSource]` field. */
const lockfileSpec: ModelSpec = {
  label: "Lockfile",
  forbidExtra: true,
  fields: [
    ["version", { defaultValue: LOCKFILE_VERSION }],
    ["sources", {
      factory: () => new Map(),
      after: (value) => {
        if (typeof value !== "object" || value === null) {
          throw new TypeError("sources must be a mapping");
        }
        const entries = new Map<string, LockedSource>();
        for (
          const [name, entry] of Object.entries(
            value as Record<string, unknown>,
          )
        ) {
          entries.set(
            name,
            validateModel(
              lockedSourceSpec,
              entry,
              [],
              [],
            ) as unknown as LockedSource,
          );
        }
        return entries;
      },
    }],
  ],
};
