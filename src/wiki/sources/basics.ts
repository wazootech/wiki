import { join } from "@std/path";
import { pathExists } from "../fspath.ts";
import { type Config, CONFIG_FILENAMES } from "../config.ts";
import { getLogger } from "../logging.ts";
import { describeValue } from "../describe.ts";
import {
  type LockedSource,
  type Lockfile,
  LOCKFILE_FILENAME,
} from "../schemas/sources.ts";

export type MutableLockfile = Omit<Lockfile, "sources"> & {
  readonly sources: Map<string, LockedSource>;
};

export function mutableLockfile(lockfile: Lockfile): MutableLockfile {
  return { ...lockfile, sources: new Map(lockfile.sources) };
}

export const logger = getLogger("wiki.sources");
export const OWNER_REPO_SHORTHAND =
  /^([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+?)(?:\.git)?$/;
export const FULL_SHA = /^[0-9a-f]{40}$/;

export function lockfilePath(config: Config): string {
  return join(config.config_root, LOCKFILE_FILENAME);
}

export function setLockedSource(
  lockfile: MutableLockfile,
  name: string,
  source: LockedSource,
): void {
  lockfile.sources.set(name, source);
}

export function deleteLockedSource(
  lockfile: MutableLockfile,
  name: string,
): void {
  lockfile.sources.delete(name);
}

function sourceRoot(config: Config): string {
  return join(config.config_root, ".wiki", "sources");
}

export function assertSafeSourceName(name: string): void {
  if (!name || name === "." || name === ".." || /[\\/]/.test(name)) {
    throw new Error(`Unsafe source name ${describeValue(name)}`);
  }
}

export function sourceCacheDir(config: Config, sourceName: string): string {
  assertSafeSourceName(sourceName);
  return join(sourceRoot(config), sourceName);
}

export function configPath(config: Config): string {
  for (const name of CONFIG_FILENAMES) {
    const candidate = join(config.config_root, name);
    if (pathExists(candidate)) return candidate;
  }
  return join(config.config_root, "wiki.yml");
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
