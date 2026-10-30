import { basename, dirname, resolve } from "@std/path";
import { rfc3339Utc } from "./types.ts";

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
export type HeadLookup = Map<string, Promise<string | null>>;

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

export async function historyDates(
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
