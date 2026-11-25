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

export { canonicalJson } from "./graph_cache/fingerprint_json.ts";
export {
  cacheDir,
  iterWikiFiles,
  wikiFingerprint,
  type WikiManifest,
  wikiManifest,
  type WikiManifestEntry,
} from "./graph_cache/manifest.ts";
export {
  clearAllProcessGraphs,
  clearProcessDataset,
  clearProcessGraph,
  getProcessDataset,
  getProcessGraph,
  setProcessDataset,
  setProcessGraph,
} from "./graph_cache/process_cache.ts";
export {
  clearDiskDataset,
  clearDiskGraph,
  datasetCachePath,
  diskCachePath,
  getDiskDataset,
  getDiskGraph,
  setDiskDataset,
  setDiskGraph,
} from "./graph_cache/disk_cache.ts";
