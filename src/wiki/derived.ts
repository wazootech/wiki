/**
 * Document metadata the graph derives instead of asking authors to repeat it
 * (wiki#318, wiki#319).
 *
 * Three values, all schema.org, all optional:
 *
 * - `schema:headline` is the plain text of the first ATX `# H1` outside fenced
 *   code ({@link firstAtxH1}). A Markdown page without one derives none.
 * - `schema:dateCreated` and `schema:dateModified` come from the file's Git
 *   history: the oldest and newest committer time among the commits
 *   `git log --follow` reaches, so a rename does not reset the creation date.
 *   They are UTC, RFC 3339 to the whole second (`2026-10-11T09:30:00Z`), and
 *   typed `xsd:dateTime`. Only the history the checkout already has counts:
 *   nothing is fetched, so a shallow clone reports the commits it holds. With
 *   no usable history (no `git`, not a repository, an untracked or uncommitted
 *   file), both dates fall back to the file's modification time.
 *
 * An explicit frontmatter value for the same predicate always wins; derivation
 * only fills a gap ({@link frontmatterToGraph}'s `derived` option). That makes
 * an explicit value equal to the derived one redundant, which is what
 * {@link redundantFields} reports for `lint.redundant_frontmatter` and what
 * `wiki fix` removes. Nothing here writes to a source file.
 *
 * Cost: one `git rev-parse` per directory per pass, and one `git log` per
 * document per `HEAD`, run with bounded concurrency ({@link deriveMetadataAll})
 * and remembered for the life of the process. A wiki outside a repository, or
 * in one with no commits, pays only the per-directory spawn, and a missing
 * `git` binary or run permission is detected once and never retried.
 */

import { basename, dirname, extname, resolve } from "@std/path";
import type { Config } from "./config.ts";
import { type Context, SCHEMA } from "./context.ts";
import { markdownBody } from "./document.ts";
import { activeOverlay, fileStat, overlayKey, readText } from "./fspath.ts";
import { effectiveTypes, resolvePredicate } from "./graph.ts";
import { firstAtxH1 } from "./headings.ts";
import type { DataRecord } from "./parser.ts";
import { WikiTimestamp } from "./scalars.ts";

/** Where a document's derived dates came from. */
export type DateSource = "git" | "mtime";

/** The metadata derived for one document; `null` means "derives nothing". */
export interface DerivedMetadata {
  /** The first ATX H1's plain text (Markdown pages only). */
  readonly headline: string | null;
  /** RFC 3339 UTC, whole seconds. */
  readonly dateCreated: string | null;
  /** RFC 3339 UTC, whole seconds. */
  readonly dateModified: string | null;
  readonly dateSource: DateSource | null;
}

/** The schema.org local names derivation emits, in report order. */
export const DERIVED_PROPERTIES = [
  "headline",
  "dateCreated",
  "dateModified",
] as const;

export type DerivedProperty = typeof DERIVED_PROPERTIES[number];

/** Whether a derived property is a date (`xsd:dateTime`) or text. */
export function isDateProperty(property: DerivedProperty): boolean {
  return property !== "headline";
}

/**
 * The predicate IRI a derived property is emitted as.
 *
 * It follows the wiki's own `schema` prefix, so a wiki that binds `schema:` to
 * `http://schema.org/` gets derived values its own `schema:headline` keys
 * agree with.
 */
export function derivedPredicate(
  property: DerivedProperty,
  context: Context,
): string {
  return `${context.namespaces.get("schema") ?? SCHEMA}${property}`;
}

/** A Unix time in seconds as `YYYY-MM-DDTHH:MM:SSZ`. */
export function rfc3339Utc(seconds: number): string {
  return new Date(seconds * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** The derived headline of a document: Markdown only. */
export function documentHeadline(filePath: string): string | null {
  if (extname(filePath).toLowerCase() !== ".md") return null;
  try {
    return firstAtxH1(markdownBody(readText(filePath)));
  } catch {
    return null;
  }
}

interface GitOutput {
  readonly code: number;
  readonly stdout: string;
}

/** Set once `git` cannot be spawned at all, so no later call retries it. */
let gitUnavailable = false;

async function runGit(
  args: readonly string[],
  cwd: string,
): Promise<GitOutput | null> {
  if (gitUnavailable) return null;
  try {
    const result = await new Deno.Command("git", {
      args: [...args],
      cwd,
      stdin: "null",
      stdout: "piped",
      stderr: "null",
    }).output();
    return {
      code: result.code,
      stdout: new TextDecoder().decode(result.stdout),
    };
  } catch {
    // No `git` on PATH, or no `--allow-run`: both are "no history", for every
    // file, so stop asking.
    gitUnavailable = true;
    return null;
  }
}

/**
 * Per directory, for one derivation pass: the `HEAD` commit of the repository
 * it sits in, or `null` outside a work tree or before the first commit.
 * Promises, so concurrent lookups for one directory share a spawn.
 */
type HeadLookup = Map<string, Promise<string | null>>;

function repoHead(dir: string, heads: HeadLookup): Promise<string | null> {
  let head = heads.get(dir);
  if (head === undefined) {
    head = runGit(["rev-parse", "--is-inside-work-tree", "HEAD"], dir).then(
      (result) => {
        if (result === null || result.code !== 0) return null;
        const [inside, commit] = result.stdout.trim().split(/\r?\n/);
        return inside === "true" && commit !== undefined &&
            /^[0-9a-f]{40,64}$/.test(commit)
          ? commit
          : null;
      },
    );
    heads.set(dir, head);
  }
  return head;
}

type HistoryDates = { created: string; modified: string } | null;

/**
 * `git log --follow` results by `HEAD` and path. History reachable from a
 * commit never changes, so an entry stays right until `HEAD` moves, and then
 * it is simply never asked for again. This is what keeps `wiki build` (lint,
 * check, then the graph) and `wiki serve` rebuilds at one `git log` per page.
 */
const historyMemo = new Map<string, Promise<HistoryDates>>();
const HISTORY_MEMO_LIMIT = 50_000;

async function historyDates(
  filePath: string,
  heads: HeadLookup,
): Promise<HistoryDates> {
  const absolute = resolve(filePath);
  const dir = dirname(absolute);
  const head = await repoHead(dir, heads);
  if (head === null) return null;
  const key = `${head}\0${absolute}`;
  let dates = historyMemo.get(key);
  if (dates === undefined) {
    if (historyMemo.size >= HISTORY_MEMO_LIMIT) historyMemo.clear();
    dates = runGit(
      [
        "-c",
        "log.showSignature=false",
        "log",
        "--follow",
        "--format=%ct",
        "--",
        basename(absolute),
      ],
      dir,
    ).then((result) => {
      if (result === null || result.code !== 0) return null;
      const times = result.stdout.split("\n")
        .map((line) => line.trim())
        .filter((line) => /^\d+$/.test(line))
        .map(Number);
      if (times.length === 0) return null;
      return {
        created: rfc3339Utc(Math.min(...times)),
        modified: rfc3339Utc(Math.max(...times)),
      };
    });
    historyMemo.set(key, dates);
  }
  return await dates;
}

/**
 * Oldest and newest committer time for one file, following renames, or `null`
 * when the checkout has no commit for it.
 */
export function gitDates(filePath: string): Promise<HistoryDates> {
  return historyDates(filePath, new Map());
}

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

/** The derived value of one property, or `null`. */
export function derivedValue(
  derived: DerivedMetadata,
  property: DerivedProperty,
): string | null {
  return derived[property];
}

/** One frontmatter entry that repeats a derived value exactly. */
export interface RedundantField {
  /** The frontmatter key as written (`headline`, `schema:dateModified`, ...). */
  readonly key: string;
  readonly property: DerivedProperty;
  /** The predicate IRI the key and the derived value share. */
  readonly predicate: string;
  /** The derived value it repeats. */
  readonly value: string;
}

/**
 * Whether a frontmatter value is exactly the derived one.
 *
 * Text must match character for character. A date must be a YAML timestamp
 * with a time part (`xsd:dateTime`) at the same instant: a date-only
 * `2026-10-11` is a different, coarser claim than `2026-10-11T00:00:00Z`, and
 * a quoted string is `xsd:string`, so neither repeats the derived value.
 */
function repeatsDerived(
  value: unknown,
  property: DerivedProperty,
  derived: string,
): boolean {
  if (!isDateProperty(property)) return value === derived;
  return value instanceof WikiTimestamp && !value.dateOnly &&
    value.getTime() === Date.parse(derived);
}

/**
 * The frontmatter entries that repeat a derived value exactly.
 *
 * Keys count as the same property when they resolve to the same predicate IRI
 * (`headline` under a schema.org `@vocab` and `schema:headline` agree). A
 * property is redundant only when *every* key for it repeats the derived
 * value: if `headline: A` sits next to `schema:headline: B`, removing the
 * first would change the graph, so neither is reported. Nothing is reported
 * for a document the graph gives no subject (no type), or when removing the
 * entries would leave the frontmatter with no keys at all.
 */
export function redundantFields(
  data: DataRecord,
  derived: DerivedMetadata,
  config: Config,
): RedundantField[] {
  if (effectiveTypes(data, config).length === 0) return [];
  const context = config.context;
  const found: RedundantField[] = [];
  for (const property of DERIVED_PROPERTIES) {
    const value = derivedValue(derived, property);
    if (value === null) continue;
    const predicate = derivedPredicate(property, context);
    const keys = Object.keys(data).filter((key) =>
      !key.startsWith("@") && key !== "id" && key !== "type" &&
      data[key] !== null && data[key] !== undefined &&
      resolvePredicate(key, context)?.value === predicate
    );
    if (keys.length === 0) continue;
    if (!keys.every((key) => repeatsDerived(data[key], property, value))) {
      continue;
    }
    for (const key of keys) found.push({ key, property, predicate, value });
  }
  const removed = new Set(found.map((field) => field.key));
  const remaining = Object.keys(data).filter((key) =>
    key !== "@context" && !removed.has(key)
  );
  return remaining.length === 0 ? [] : found;
}
