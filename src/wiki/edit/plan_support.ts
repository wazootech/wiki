import { extname } from "@std/path";
import type { Config } from "../config.ts";
import { formatMarkdown } from "../fmt_util.ts";
import { type FileOverlay, overlayKey, relativeWithin } from "../fspath.ts";
import { routeForDocumentFile } from "../paths.ts";
import { sha256Hex } from "../sha256.ts";

/** The SHA-256 a caller passes as `expect`: over the file's raw bytes. */
export function contentHash(bytes: Uint8Array | string): string {
  return sha256Hex(
    typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes,
  );
}

/** One file's resolved state across the edit. */
export interface FilePlan {
  readonly path: string;
  /** On-disk bytes before the edit, or `null` when absent. Kept for rollback. */
  readonly before: Uint8Array | null;
  /** Staged text, or `null` for a delete. */
  after: string | null;
}

/** A move as staged, kept so validation can match findings across it. */
export interface StagedMove {
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
export function overlayOf(plans: ReadonlyMap<string, FilePlan>): FileOverlay {
  return {
    id: crypto.randomUUID(),
    files: new Map(
      [...plans.values()].map((plan) => [overlayKey(plan.path), plan.after]),
    ),
  };
}

export function isMarkdown(path: string): boolean {
  return extname(path).toLowerCase() === ".md";
}

export function relativePath(config: Config, path: string): string {
  return config.relativeToRoot(path).replaceAll("\\", "/");
}

/** An `@id` or `id` the page sets itself: its IRI then survives a move. */
export function hasExplicitId(data: Record<string, unknown> | null): boolean {
  if (data === null) return false;
  return [data["@id"], data["id"]].some((value) =>
    value !== undefined && value !== null && value !== ""
  );
}

export function within(path: string, base: string): boolean {
  try {
    relativeWithin(path, base);
    return true;
  } catch {
    return false;
  }
}

export function readBytes(path: string): Uint8Array | null {
  try {
    return Deno.readFileSync(path);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return null;
    throw error;
  }
}

export function decode(bytes: Uint8Array): string {
  const text = new TextDecoder().decode(bytes);
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function sameBytes(a: Uint8Array | null, b: Uint8Array | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.byteLength !== b.byteLength) return false;
  return a.every((byte, index) => byte === b[index]);
}

export function formatIfMarkdown(
  config: Config,
  path: string,
  text: string,
): string {
  if (extname(path).toLowerCase() !== ".md") return text;
  return formatMarkdown(text, path, config);
}

export function unchanged(plan: FilePlan): boolean {
  if (plan.before === null || plan.after === null) {
    return plan.before === null && plan.after === null;
  }
  return sameBytes(new TextEncoder().encode(plan.after), plan.before);
}

export function safeRoute(config: Config, path: string): string | null {
  try {
    return routeForDocumentFile(config, path);
  } catch {
    return null;
  }
}
