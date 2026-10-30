import { isDirectory, pathExists } from "../fspath.ts";
import { join, resolve } from "@std/path";
import type { Config } from "../config.ts";
import { getLogger } from "../logging.ts";
import { describeValue } from "../describe.ts";
import {
  type GraphDescriptor,
  loadLockfile,
  type SourceConfig,
} from "../schemas/sources.ts";
import { quote } from "../urlquote.ts";

export const logger = getLogger("wiki.graph");

/** `true` when a SPARQL query uses an explicit `GRAPH` clause. */
export function usesNamedGraphs(sparqlQuery: string): boolean {
  // The lookbehind is the point: `?graph`, `$graph`, `ex:GRAPH` and
  // `schema:GRAPHx` are all variable or IRI fragments, not the keyword.
  return /(?<![?$A-Za-z0-9_:-])GRAPH\s+/i.test(sparqlQuery);
}

/** The base every graph URI is derived from. */
function graphBase(config: Config): string {
  const wiki = config.context.namespaces.get("wiki");
  return (wiki || config.base_iri).replace(/\/+$/, "");
}

/** Stable named graph URI for the root wiki corpus. */
export function rootGraphUri(config: Config): string {
  return `${graphBase(config)}/graphs/root`;
}

/** Stable named graph URI for an installed source. */
export function sourceGraphUri(config: Config, sourceName: string): string {
  // `quote(..., safe="")` escapes the `/` in a nested source name too, so a
  // source called `a/b` cannot forge a deeper graph path.
  return `${graphBase(config)}/graphs/source/${quote(sourceName, "")}`;
}

/**
 * Where an installed source's cache lives.
 *
 * Mirrors the path convention in `sources.ts`. The graph loader keeps this
 * small read-only helper local so describing graphs does not depend on the
 * source-management operations.
 */
function sourceCacheDir(config: Config, sourceName: string): string {
  return join(config.config_root, ".wiki", "sources", sourceName);
}

/**
 * A source's checked-out path, or a failure when it is missing.
 *
 * Ported from `sources.py::_source_resolved_path`, including the `RuntimeError`
 * that `graph_descriptors` swallows to skip a source whose cache is incomplete.
 */
function sourceResolvedPath(source: SourceConfig, repoDir: string): string {
  const base = source.path ? join(repoDir, source.path) : repoDir;
  if (!pathExists(base)) {
    throw new Error(
      `Source ${describeValue(source.name)}: path ${
        describeValue(source.path)
      } does not exist`,
    );
  }
  return resolve(base);
}

/** Describe root and installed source graphs without mutating source state. */
export function graphDescriptors(config: Config): GraphDescriptor[] {
  const lockfile = loadLockfile(join(config.config_root, "wiki.lock"));
  const cacheRoot = join(config.config_root, ".wiki", "sources");
  if (
    lockfile.sources.size === 0 && isDirectory(cacheRoot) &&
    [...Deno.readDirSync(cacheRoot)].length > 0
  ) {
    logger.warning(
      `Source cache exists under ${cacheRoot} but wiki.lock has no sources; ` +
        `source graph provenance is unavailable.`,
    );
  }

  const sourcePaths = new Map<string, GraphDescriptor>();
  const directSourceNames = new Set(config.sources.map((item) => item.name));

  for (const [name, locked] of lockfile.sources) {
    let requiredBy = [...locked.required_by];
    if (requiredBy.length === 0 && directSourceNames.has(name)) {
      requiredBy = ["root"];
    }
    const repoDir = join(sourceCacheDir(config, name), "repo");
    if (!pathExists(repoDir)) continue;
    const source: SourceConfig = {
      name,
      type: "git",
      url: locked.url,
      ref: locked.ref,
      path: locked.path,
    };
    let localPath: string;
    try {
      localPath = sourceResolvedPath(source, repoDir);
    } catch {
      continue;
    }
    sourcePaths.set(resolve(localPath), {
      name,
      uri: sourceGraphUri(config, name),
      kind: "source",
      source_name: name,
      source_type: "git",
      url: locked.url,
      ref: locked.ref,
      resolved_ref: locked.resolved_ref,
      path: locked.path,
      local_path: localPath,
      required_by: requiredBy,
    });
  }

  const rootInputs: string[] = [];
  const sourceDescriptors: GraphDescriptor[] = [];
  for (const inputDir of config.wiki.input) {
    const descriptor = sourcePaths.get(resolve(inputDir));
    if (descriptor === undefined) {
      rootInputs.push(inputDir);
    } else if (!sourceDescriptors.some((item) => item.uri === descriptor.uri)) {
      sourceDescriptors.push(descriptor);
    }
  }

  const root: GraphDescriptor = {
    name: "root",
    uri: rootGraphUri(config),
    kind: "root",
    source_name: null,
    source_type: null,
    url: null,
    ref: null,
    resolved_ref: null,
    local_path: config.config_root,
    path: rootInputs.map((path) => config.relativeToRoot(path)).join(", ") ||
      null,
    required_by: [],
  };
  return [root, ...sourceDescriptors];
}
