import { pathExists, readText } from "../fspath.ts";
import { join } from "@std/path";
import type { Config } from "../config.ts";
import {
  parseRdf,
  RdfDataset,
  RdfGraph,
  serializeNquadsDataset,
  serializeNt,
} from "../rdf.ts";
import { cacheDir, diskFingerprint } from "./manifest.ts";

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
    `${diskCachePrefix(infer)}-${diskFingerprint(config)}.nt`,
  );
}

/** Path to the persisted named-graph dataset for the current wiki fingerprint. */
export function datasetCachePath(config: Config, infer: boolean): string {
  return join(
    cacheDir(config),
    `${diskCachePrefix(infer, "dataset")}-${diskFingerprint(config)}.nq`,
  );
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
