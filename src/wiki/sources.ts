/**
 * Locked external sources: the resolution half of `sources.py`.
 *
 * `sources.py` is 752 lines and does three jobs — install a source (clone, pin,
 * lock), update or remove one, and *resolve* the locked ones to local paths.
 * Only the third is ported here, because `Wiki.load` calls it to extend
 * `wiki.input`, and a `Wiki` that quietly ignored locked sources would load a
 * smaller corpus than the oracle without saying so. The install/update/remove
 * half fetches, rewrites `wiki.lock`, and edits `wiki.yml` in place; it lands
 * with the rest of the source commands, and until it does the CLI's
 * `install`/`update`/`remove` are not ported at all rather than half-ported.
 *
 * `resolve` is the one function that reads a lockfile and contacts no network:
 * for every pinned source whose cache directory exists, the path it contributes
 * to the wiki. Two failure modes are warnings rather than exceptions, and both
 * are the Python behaviour:
 *
 * - **A source that was never fetched.** The lockfile can name a source whose
 *   cache is missing — a fresh clone of a wiki whose `.wiki/sources/` is
 *   gitignored. The message tells the user to run `wiki install`.
 * - **A source whose `path` does not exist inside the checkout.** A source can
 *   declare which subdirectory it contributes, and a missing one is not fatal:
 *   the rest of the corpus still loads.
 */

import type { Config } from "./config.ts";
import type { Path } from "./fspath.ts";
import { getLogger } from "./logging.ts";
import { pyRepr } from "./pyrepr.ts";
import { loadLockfile, LOCKFILE_FILENAME } from "./schemas/sources.ts";

const logger = getLogger("wiki.sources");

/** `wiki.lock` beside the config. */
function lockfilePath(config: Config): Path {
  return config.config_root.joinpath(LOCKFILE_FILENAME);
}

/** `.wiki/sources/<name>/`, where a fetched source is cached. */
function sourceCacheDir(config: Config, sourceName: string): Path {
  return config.config_root.joinpath(".wiki", "sources", sourceName);
}

/**
 * The path a source contributes, or a `RuntimeError` when its `path` is absent.
 *
 * Python raises `RuntimeError` and `resolve` catches it into a warning; the
 * port throws the same and catches at the same place, so the two failure modes
 * keep their different words.
 */
function sourceResolvedPath(
  source: { readonly name: string; readonly path?: string | null },
  repoDir: Path,
): Path {
  const base = source.path ? repoDir.joinpath(source.path) : repoDir;
  if (!base.exists()) {
    throw new RuntimeError(
      `Source ${pyRepr(source.name)}: path ${
        pyRepr(source.path ?? null)
      } does not exist`,
    );
  }
  return base.resolve();
}

/**
 * `RuntimeError`, so the catch below can tell it from a real crash.
 *
 * `errors.ts` carries the domain hierarchy (`WikiError` and friends) and this is
 * not one of them: the Python original raises the builtin, catches the builtin,
 * and turns it into a warning, so a subclass would be a *stronger* contract
 * than the oracle offers.
 */
class RuntimeError extends Error {
  override readonly name = "RuntimeError";
}

/**
 * Resolve every locked source to a local path, transitive dependencies
 * included.
 *
 * Order follows the lockfile, which is how the file was written: the Python
 * original iterates `lockfile.sources.items()`, and `wiki.input` therefore
 * gains sources in lock order rather than sorted order.
 */
export function resolve(config: Config): Path[] {
  const lockfile = loadLockfile(lockfilePath(config));
  if (lockfile.sources.size === 0) return [];

  const resolved: Path[] = [];

  for (const [name, locked] of lockfile.sources) {
    const repoDir = sourceCacheDir(config, name).joinpath("repo");
    if (!repoDir.exists()) {
      logger.warning(
        `Source '${name}' is not cached. Run 'wiki install' first.`,
      );
      continue;
    }

    try {
      resolved.push(
        sourceResolvedPath({
          name,
          path: locked.path,
        }, repoDir),
      );
    } catch (error) {
      if (!(error instanceof RuntimeError)) throw error;
      logger.warning(`Source '${name}': ${error.message}`);
    }
  }

  return resolved;
}
