import {
  activeOverlay,
  fileStat,
  isFile,
  pathExists,
  relativeWithin,
  sortedTreePaths,
} from "../fspath.ts";
import { join, resolve } from "@std/path";
import { VERSION } from "../version.ts";
import type { Config } from "../config.ts";
import { sha256Hex } from "../sha256.ts";
import { canonicalJson } from "./fingerprint_json.ts";

/** One contributing file, as the manifest records it. */
export interface WikiManifestEntry {
  readonly path: string;
  readonly size: number;
  readonly mtime_ns: number;
}

/** The manifest a fingerprint is computed over. */
export interface WikiManifest {
  readonly version: string;
  readonly config: Readonly<Record<string, unknown>>;
  readonly files: readonly WikiManifestEntry[];
}

/** Directory for optional on-disk graph cache artifacts. */
export function cacheDir(config: Config): string {
  return join(config.config_root, ".wiki", "cache");
}

/** The parts of the configuration that change how a graph is built. */
function configFingerprint(config: Config): Record<string, unknown> {
  const namespaces: Record<string, string> = {};
  for (const prefix of [...config.namespaces.keys()].sort()) {
    namespaces[prefix] = config.namespaces.get(prefix)!;
  }
  return {
    base_iri: config.base_iri,
    graph_base_iri: config.graph.base_iri,
    context_wiki: config.graph.context?.["wiki"] ?? null,
    include_file_extension: config.graph.include_file_extension,
    content_predicate: config.graph.content_predicate,
    implicit_types: [...config.graph.implicit_types],
    implicit_types_policy: config.graph.implicit_types_policy,
    exclude: [...config.wiki.exclude].sort(),
    namespaces,
  };
}

/**
 * All non-excluded files under the inputs that contribute to the graph.
 *
 * The cache directory is skipped explicitly: it lives under the config root,
 * which is itself often an input directory, so a warm-started run would
 * otherwise fingerprint its own cache and invalidate itself on every write.
 *
 * Path order matters here — the manifest is a list, and the digest is over its
 * rendered JSON — so the walk is the oracle's flat `sortedTreePaths` (see
 * `sortedTreePaths`), not a directory-level walk.
 */
export function iterWikiFiles(config: Config): string[] {
  const files: string[] = [];
  const cacheRoot = resolve(cacheDir(config));
  for (const inputDir of config.wiki.input) {
    if (!pathExists(inputDir)) continue;
    for (const filePath of sortedTreePaths(inputDir)) {
      if (!isFile(filePath) || config.isExcluded(filePath)) continue;
      try {
        relativeWithin(resolve(filePath), cacheRoot);
        continue;
      } catch {
        // Not under the cache directory: this is the interesting case.
      }
      files.push(filePath);
    }
  }
  return files;
}

/** Build a stable manifest describing the wiki inputs. */
export function wikiManifest(config: Config): WikiManifest {
  const files: WikiManifestEntry[] = [];
  for (const filePath of iterWikiFiles(config)) {
    // Through `fileStat`, not `Deno.statSync`: under an edit overlay a staged
    // page has no file on disk yet, or a stale one.
    const stat = fileStat(filePath);
    files.push({
      path: config.relativeToRoot(filePath),
      size: stat.size,
      mtime_ns: stat.mtimeMs * 1_000_000,
    });
  }
  return { version: VERSION, config: configFingerprint(config), files };
}

/** SHA-256 hex digest of the wiki manifest. */
export function wikiFingerprint(config: Config): string {
  const digest = sha256Hex(canonicalJson(wikiManifest(config)));
  // A staged tree is a different wiki: key it apart so neither the in-process
  // nor the disk cache can hand the pre-edit graph to an edit's validation.
  const overlay = activeOverlay();
  return overlay === undefined ? digest : sha256Hex(`${digest}|${overlay.id}`);
}

/**
 * The commit `HEAD` names in the config root's repository, or `""` outside one.
 *
 * Derived `schema:dateCreated`/`dateModified` values come from Git history
 * (wiki#318), and a commit changes them without touching any file's size or
 * mtime. The disk cache outlives the process, so its key includes `HEAD`; the
 * in-process key does not, because it is computed on every lookup and a
 * process does not see commits land mid-run in any way it could act on.
 */
function gitHead(config: Config): string {
  try {
    const result = new Deno.Command("git", {
      args: ["rev-parse", "--verify", "--quiet", "HEAD"],
      cwd: config.config_root,
      stdin: "null",
      stdout: "piped",
      stderr: "null",
    }).outputSync();
    return result.code === 0
      ? new TextDecoder().decode(result.stdout).trim()
      : "";
  } catch {
    return "";
  }
}

/** {@link wikiFingerprint}, plus the Git `HEAD` when there is one. */
export function diskFingerprint(config: Config): string {
  const digest = wikiFingerprint(config);
  const head = gitHead(config);
  return head === "" ? digest : sha256Hex(`${digest}|git:${head}`);
}
