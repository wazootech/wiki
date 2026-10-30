import { activeOverlay, fileStat, overlayKey } from "../fspath.ts";
import {
  type DateSource,
  type DerivedMetadata,
  documentHeadline,
  rfc3339Utc,
} from "./types.ts";
import { type HeadLookup, historyDates } from "./git.ts";

/** The mtime fallback, as both dates. A staged (unwritten) file is "now". */
function mtimeDates(filePath: string): { created: string; modified: string } {
  const staged = activeOverlay()?.files.get(overlayKey(filePath));
  const ms = typeof staged === "string"
    ? Date.now()
    : fileStat(filePath).mtimeMs;
  const stamp = rfc3339Utc(Math.floor(ms / 1000));
  return { created: stamp, modified: stamp };
}

/** Derive one document's metadata. Never writes, never throws for a readable file. */
export function deriveMetadata(filePath: string): Promise<DerivedMetadata> {
  return deriveWith(filePath, new Map());
}

async function deriveWith(
  filePath: string,
  heads: HeadLookup,
): Promise<DerivedMetadata> {
  const headline = documentHeadline(filePath);
  const git = await historyDates(filePath, heads);
  let dates: { created: string; modified: string } | null = git;
  let dateSource: DateSource | null = git === null ? null : "git";
  if (dates === null) {
    try {
      dates = mtimeDates(filePath);
      dateSource = "mtime";
    } catch {
      dates = null;
    }
  }
  return {
    headline,
    dateCreated: dates?.created ?? null,
    dateModified: dates?.modified ?? null,
    dateSource,
  };
}

/**
 * How many `git log` processes a graph build runs at once. Spawning, not the
 * log itself, is most of the cost (tens of milliseconds a process on
 * Windows), so this scales with the machine.
 */
const GIT_CONCURRENCY = Math.min(
  16,
  Math.max(4, navigator.hardwareConcurrency ?? 4),
);

/**
 * {@link deriveMetadata} for many documents, keyed by the path as given.
 *
 * Each directory's `HEAD` is read once for the whole pass, and the per-page
 * `git log` calls run {@link GIT_CONCURRENCY} at a time.
 */
export async function deriveMetadataAll(
  filePaths: readonly string[],
): Promise<Map<string, DerivedMetadata>> {
  const results = new Map<string, DerivedMetadata>();
  const heads: HeadLookup = new Map();
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < filePaths.length) {
      const filePath = filePaths[next++]!;
      results.set(filePath, await deriveWith(filePath, heads));
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(GIT_CONCURRENCY, filePaths.length) },
      worker,
    ),
  );
  return results;
}
