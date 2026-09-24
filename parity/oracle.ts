/**
 * Python oracle resolution for the differential harness (issue #273, Phase 2).
 *
 * The Python CLI stays the source of truth for every behaviour until the parity
 * gate passes, so the harness refuses to run against an oracle it cannot
 * identify. Two environment variables configure it, and neither has a default:
 * the pinned Python checkout is a sibling worktree on one machine and a
 * separate clone in CI, and guessing would silently compare the wrong engine.
 *
 * - `WIKI_ORACLE_ROOT` — the pinned Python checkout. The harness reads its
 *   `git` revision to confirm the pin, then runs `.venv/Scripts/wiki.exe`
 *   (Windows) or `.venv/bin/wiki` (POSIX).
 * - `WIKI_ORACLE` — overrides the executable only, for a checkout whose venv
 *   lives somewhere else or is reached through `uv run`.
 */

import { join } from "@std/path";

/**
 * Commit the oracle is pinned at: the `fmt-bom-tolerance` tip (#312), one
 * commit ahead of `main`. See `docs/adr/0001-deno-rewrite.md` — the rewrite is
 * compared against this build, not against whatever `main` becomes.
 */
export const ORACLE_PIN = "1bfb422";

/** Human-readable description of the pin, for error messages and reports. */
export const ORACLE_PIN_SUBJECT = "fmt-bom-tolerance (#312)";

/** Thrown when the harness cannot locate a usable Python oracle. */
export class OracleNotConfiguredError extends Error {
  constructor() {
    super(
      [
        "No Python oracle configured, so there is nothing to compare against.",
        "",
        `Set WIKI_ORACLE_ROOT to the pinned Python checkout (${ORACLE_PIN},`,
        `${ORACLE_PIN_SUBJECT}). The harness expects the CLI at`,
        "`.venv/Scripts/wiki.exe` on Windows or `.venv/bin/wiki` elsewhere.",
        "",
        "Set WIKI_ORACLE instead to point at the executable directly, for example",
        "`uv run wiki` from the oracle checkout.",
      ].join("\n"),
    );
    this.name = "OracleNotConfiguredError";
  }
}

/** Reads an environment variable, or returns `undefined` when unset. */
export type EnvLookup = (name: string) => string | undefined;

export interface OracleCommand {
  /** Executable to invoke. */
  readonly bin: string;
  /** Pinned checkout, when known; used for the pin guard. */
  readonly root: string | undefined;
}

function present(value: string | undefined): string | undefined {
  return value === undefined || value === "" ? undefined : value;
}

/** The venv console script for a checkout, following platform layout. */
export function venvWikiBin(root: string): string {
  return Deno.build.os === "windows"
    ? join(root, ".venv", "Scripts", "wiki.exe")
    : join(root, ".venv", "bin", "wiki");
}

/** Resolve the oracle from the environment, or explain how to configure it. */
export function resolveOracle(readEnv: EnvLookup): OracleCommand {
  const explicit = present(readEnv("WIKI_ORACLE"));
  const root = present(readEnv("WIKI_ORACLE_ROOT"));

  if (explicit !== undefined) {
    return { bin: explicit, root };
  }
  if (root !== undefined) {
    return { bin: venvWikiBin(root), root };
  }
  throw new OracleNotConfiguredError();
}

const DECODER = new TextDecoder();

/** Read the checked-out revision of the oracle. */
export async function readRevision(root: string): Promise<string> {
  const { code, stdout, stderr } = await new Deno.Command("git", {
    args: ["-C", root, "rev-parse", "HEAD"],
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (code !== 0) {
    throw new Error(
      `Could not read the git revision of ${root}: ` +
        (DECODER.decode(stderr).trim() || `git exited ${code}`),
    );
  }
  return DECODER.decode(stdout).trim();
}

/** Whether a resolved revision is the pinned one. */
export function revisionMatchesPin(
  revision: string,
  pin: string = ORACLE_PIN,
): boolean {
  return revision.startsWith(pin);
}
