import type { Config } from "../config.ts";
import type { RdfDataset, RdfGraph } from "../rdf.ts";
import { wikiFingerprint } from "./manifest.ts";

/** In-process graphs, keyed by fingerprint and infer mode. */
const processGraphs = new Map<string, RdfGraph>();
/** In-process datasets, keyed the same way. */
const processDatasets = new Map<string, RdfDataset>();

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

/** Drop the in-process graph entry for the current wiki fingerprint. */
export function clearProcessGraph(config: Config, infer: boolean): void {
  processGraphs.delete(processKey(config, infer));
}

/** Drop the in-process dataset entry for the current wiki fingerprint. */
export function clearProcessDataset(config: Config, infer: boolean): void {
  processDatasets.delete(processKey(config, infer));
}

/** Clear the entire in-process cache (tests and watch reload). */
export function clearAllProcessGraphs(): void {
  processGraphs.clear();
  processDatasets.clear();
}
