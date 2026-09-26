/**
 * Wiki fingerprinting and graph caches.
 *
 * Port of `src/wiki/graph_cache.py`. Build the wiki graph once per process and
 * reuse it for every SPARQL query and render in that process, so OWL-RL
 * expansion and wiki parsing happen once rather than per block; optionally
 * persist it to disk so a one-shot CLI invocation can warm-start.
 *
 * The **fingerprint** is the load-bearing idea: a SHA-256 over a manifest of
 * every contributing file (path, size, mtime) plus the parts of the
 * configuration that change how the graph is built. Cache entries are keyed by
 * it, so a cache lookup is automatically invalidated by editing a page or the
 * config — no invalidation protocol to get wrong.
 *
 * Two fidelity notes:
 *
 * - **`mtime_ns` is milliseconds here.** Python's `st_mtime_ns` is nanosecond
 *   resolution; `Deno.statSync` exposes a `Date`. A file edited twice within
 *   the same millisecond therefore keeps its fingerprint, where the oracle
 *   would change it. Everything else about the digest *is* verified against the
 *   oracle: with file mtimes pinned to whole seconds, the canonical manifest,
 *   the SHA-256 digest, and the resulting `graph-asserted-<digest>.nt` filename
 *   are byte-identical (checked on a fixture with a nested directory and a
 *   non-ASCII filename, which is what exercises the escaping below).
 * - **The manifest is canonicalised the way Python's `json.dumps` does it**:
 *   sorted keys, no separator whitespace, and non-ASCII escaped as `\uXXXX`.
 *   JavaScript's `JSON.stringify` leaves those characters raw, which would
 *   change the digest for any wiki with an accented path — see
 *   {@link canonicalJson}.
 */

import {
  isFile,
  pathExists,
  readText,
  relativeWithin,
  sortedTreePaths,
} from "./fspath.ts";
import { join, resolve } from "@std/path";
import { VERSION } from "./version.ts";
import type { Config } from "./config.ts";

import {
  parseRdf,
  RdfDataset,
  RdfGraph,
  serializeNquadsDataset,
  serializeNt,
} from "./rdf.ts";
import { sha256Hex } from "./sha256.ts";

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

/** In-process graphs, keyed by fingerprint and infer mode. */
const processGraphs = new Map<string, RdfGraph>();
/** In-process datasets, keyed the same way. */
const processDatasets = new Map<string, RdfDataset>();

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
    const stat = Deno.statSync(filePath);
    files.push({
      path: config.relativeToRoot(filePath),
      size: stat.size,
      mtime_ns: stat.mtime === null ? 0 : stat.mtime.getTime() * 1_000_000,
    });
  }
  return { version: VERSION, config: configFingerprint(config), files };
}

/**
 * Render a value the way Python's `json.dumps(value, sort_keys=True,
 * separators=(",", ":"))` renders it.
 *
 * The non-ASCII escaping is the part that matters: `ensure_ascii` is on by
 * default in Python, so a path containing `é` becomes `\u00e9` in the digest
 * input. `JSON.stringify` would leave it raw and produce a different
 * fingerprint for the same wiki.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return encodeJsonString(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${
    entries.map(([key, item]) =>
      `${encodeJsonString(key)}:${canonicalJson(item)}`
    ).join(",")
  }}`;
}

/** Python's ASCII-safe string encoding, as used by `json.dumps`. */
function encodeJsonString(value: string): string {
  let out = '"';
  for (const char of value) {
    const code = char.codePointAt(0)!;
    switch (char) {
      case '"':
        out += '\\"';
        continue;
      case "\\":
        out += "\\\\";
        continue;
      case "\n":
        out += "\\n";
        continue;
      case "\r":
        out += "\\r";
        continue;
      case "\t":
        out += "\\t";
        continue;
      case "\b":
        out += "\\b";
        continue;
      case "\f":
        out += "\\f";
        continue;
      default:
        break;
    }
    // Printable ASCII survives; everything else (including U+007F and every
    // non-ASCII code point) is escaped, astral characters as a surrogate pair.
    if (code >= 0x20 && code <= 0x7e) {
      out += char;
    } else if (code <= 0xffff) {
      out += `\\u${code.toString(16).padStart(4, "0")}`;
    } else {
      const offset = code - 0x10000;
      const high = 0xd800 + (offset >> 10);
      const low = 0xdc00 + (offset & 0x3ff);
      out += `\\u${high.toString(16).padStart(4, "0")}\\u${
        low.toString(16).padStart(4, "0")
      }`;
    }
  }
  return `${out}"`;
}

/** SHA-256 hex digest of the wiki manifest. */
export function wikiFingerprint(config: Config): string {
  return sha256Hex(canonicalJson(wikiManifest(config)));
}

/** The prefix shared by every cache file for one graph kind and infer mode. */
function diskCachePrefix(
  infer: boolean,
  kind: "graph" | "dataset" = "graph",
): string {
  const prefix = kind === "dataset" ? "dataset" : "graph";
  return infer ? `${prefix}-infer` : `${prefix}-asserted`;
}

/** Path to the persisted graph for the current wiki fingerprint. */
export function diskCachePath(config: Config, infer: boolean): string {
  return join(
    cacheDir(config),
    `${diskCachePrefix(infer)}-${wikiFingerprint(config)}.nt`,
  );
}

/** Path to the persisted named-graph dataset for the current wiki fingerprint. */
export function datasetCachePath(config: Config, infer: boolean): string {
  return join(
    cacheDir(config),
    `${diskCachePrefix(infer, "dataset")}-${wikiFingerprint(config)}.nq`,
  );
}

/** The in-process cache key for one fingerprint and infer mode. */
function processKey(config: Config, infer: boolean): string {
  return `${wikiFingerprint(config)}|${infer}`;
}

/** Return the in-memory graph for this fingerprint and infer mode, if loaded. */
export function getProcessGraph(
  config: Config,
  infer: boolean,
): RdfGraph | null {
  return processGraphs.get(processKey(config, infer)) ?? null;
}

/** Return the in-memory dataset for this fingerprint and infer mode, if loaded. */
export function getProcessDataset(
  config: Config,
  infer: boolean,
): RdfDataset | null {
  return processDatasets.get(processKey(config, infer)) ?? null;
}

/** Return a persisted graph for this fingerprint and infer mode, if present. */
export async function getDiskGraph(
  config: Config,
  infer: boolean,
): Promise<RdfGraph | null> {
  const cachePath = diskCachePath(config, infer);
  if (!pathExists(cachePath)) return null;
  try {
    const quads = await parseRdf(readText(cachePath), "nt");
    const graph = new RdfGraph();
    graph.addAll(quads);
    return graph;
  } catch {
    // A corrupt or partial cache must never block a command: drop it and let
    // the caller rebuild.
    try {
      Deno.removeSync(cachePath);
    } catch {
      // Already gone, or not ours to remove.
    }
    return null;
  }
}

/** Return a persisted named-graph dataset for this fingerprint, if present. */
export async function getDiskDataset(
  config: Config,
  infer: boolean,
): Promise<RdfDataset | null> {
  const cachePath = datasetCachePath(config, infer);
  if (!pathExists(cachePath)) return null;
  try {
    const quads = await parseRdf(readText(cachePath), "nquads");
    const dataset = new RdfDataset({ defaultUnion: true });
    for (const item of quads) dataset.addQuad(item);
    return dataset;
  } catch {
    try {
      Deno.removeSync(cachePath);
    } catch {
      // Already gone, or not ours to remove.
    }
    return null;
  }
}

/** Store a graph in the in-process cache, dropping stale entries for its mode. */
export function setProcessGraph(
  config: Config,
  infer: boolean,
  graph: RdfGraph,
): void {
  const current = processKey(config, infer);
  dropStale(processGraphs, current, infer);
  processGraphs.set(current, graph);
}

/** Store a dataset in the in-process cache, dropping stale entries for its mode. */
export function setProcessDataset(
  config: Config,
  infer: boolean,
  dataset: RdfDataset,
): void {
  const current = processKey(config, infer);
  dropStale(processDatasets, current, infer);
  processDatasets.set(current, dataset);
}

/** Drop cached entries that share an infer mode but not the current fingerprint. */
function dropStale<T>(
  cache: Map<string, T>,
  current: string,
  infer: boolean,
): void {
  const mode = `|${infer}`;
  for (const key of [...cache.keys()]) {
    if (key !== current && key.endsWith(mode)) cache.delete(key);
  }
}

/** Persist a graph for reuse across one-shot CLI invocations. */
export function setDiskGraph(
  config: Config,
  infer: boolean,
  graph: RdfGraph,
): void {
  const root = cacheDir(config);
  Deno.mkdirSync(root, { recursive: true });
  const cachePath = diskCachePath(config, infer);
  removeStaleCacheFiles(root, `${diskCachePrefix(infer)}-`, ".nt", cachePath);
  Deno.writeTextFileSync(cachePath, serializeNt(graph.toArray()));
}

/** Persist a named-graph dataset for reuse across one-shot CLI invocations. */
export function setDiskDataset(
  config: Config,
  infer: boolean,
  dataset: RdfDataset,
): void {
  const root = cacheDir(config);
  Deno.mkdirSync(root, { recursive: true });
  const cachePath = datasetCachePath(config, infer);
  removeStaleCacheFiles(
    root,
    `${diskCachePrefix(infer, "dataset")}-`,
    ".nq",
    cachePath,
  );
  Deno.writeTextFileSync(cachePath, serializeNquadsDataset([...dataset]));
}

/** Delete cache files for the same kind and mode but a different fingerprint. */
function removeStaleCacheFiles(
  root: string,
  prefix: string,
  suffix: string,
  keep: string,
): void {
  let names: string[];
  try {
    names = [...Deno.readDirSync(root)].map((entry) => entry.name);
  } catch {
    return;
  }
  for (const name of names) {
    if (!name.startsWith(prefix) || !name.endsWith(suffix)) continue;
    const candidate = join(root, name);
    if (candidate === keep) continue;
    try {
      Deno.removeSync(candidate);
    } catch {
      // A stale file we cannot remove is not worth failing a build over.
    }
  }
}

/** Drop the in-process graph entry for the current wiki fingerprint. */
export function clearProcessGraph(config: Config, infer: boolean): void {
  processGraphs.delete(processKey(config, infer));
}

/** Drop the in-process dataset entry for the current wiki fingerprint. */
export function clearProcessDataset(config: Config, infer: boolean): void {
  processDatasets.delete(processKey(config, infer));
}

/** Drop the persisted graph entry for the current wiki fingerprint. */
export function clearDiskGraph(config: Config, infer: boolean): void {
  try {
    Deno.removeSync(diskCachePath(config, infer));
  } catch {
    // Nothing cached under this fingerprint.
  }
}

/** Drop the persisted dataset entry for the current wiki fingerprint. */
export function clearDiskDataset(config: Config, infer: boolean): void {
  try {
    Deno.removeSync(datasetCachePath(config, infer));
  } catch {
    // Nothing cached under this fingerprint.
  }
}

/** Clear the entire in-process cache (tests and watch reload). */
export function clearAllProcessGraphs(): void {
  processGraphs.clear();
  processDatasets.clear();
}
