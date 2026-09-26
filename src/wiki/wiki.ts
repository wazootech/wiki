/**
 * The `Wiki` session: config, graph lifecycle, and the operations built on them.
 *
 * Port of `wiki.py`, through `query`. The session owns config and graph
 * lifecycle; command methods are added as their dependencies land.
 *
 * Still absent: `build`, `export`, `link`, `serve`, and `init`.
 *
 * Two port decisions are worth stating because they are visible from outside:
 *
 * - **`preflight()` is `async`, and `check()` with it.** `check_shacl_all` reads
 *   the graph through `fetch`-capable loaders, so the sync/async split moves one
 *   level up from `audit.ts`. `lint()` stays synchronous, which is what keeps
 *   the common path — `wiki lint` over a corpus — free of await plumbing.
 *   {@link Wiki.format} is synchronous too, since the formatter stopped being a
 *   subprocess; only `check()` and `preflight()` remain asynchronous.
 * - **Runtime overrides rebuild the config rather than mutating a copy of it.**
 *   Python's `model_copy(deep=True)` is pydantic machinery; {@link copyConfig}
 *   states what the copy actually has to guarantee (a new `site` and `wiki`
 *   block, everything else shared) instead of deep-cloning class instances that
 *   carry a `Path` and a `Logger` with them.
 *
 * `Wiki.load` resolves locked sources before it returns, so a wiki with a
 * `wiki.lock` loads the same corpus the oracle would. A source whose cache is
 * missing warns and is skipped; see `sources.ts`.
 */

import { mergeResults, runCheck, runLint } from "./audit.ts";
import { DocumentBatch } from "./batch.ts";
import { Config, findConfigPath } from "./config.ts";
import { Path } from "./fspath.ts";
import {
  graphDescriptors,
  loadDataset,
  loadGraph,
  loadQueryGraph,
} from "./graph.ts";
import { renderMarkdownFiles } from "./render.ts";
import { type QueryFormat, runQuery } from "./format.ts";
import { resolvePath } from "./jqfilter.ts";
import { pyStr } from "./pyrepr.ts";
import type { RdfDataset, RdfGraph } from "./rdf.ts";
import { resolve as resolveSources } from "./sources.ts";
import { pageRoutes, selectMarkdownPaths } from "./paths.ts";
import type { GraphDescriptor } from "./schemas/sources.ts";
import type {
  AuditReport,
  FmtReport,
  RenderReport,
} from "./schemas/reports.ts";

export { usesNamedGraphs } from "./graph.ts";

/** Options shared by the graph accessors. */
export interface GraphOptions {
  readonly infer?: boolean;
  readonly reload?: boolean;
  readonly diskCache?: boolean;
}

export interface QueryOptions {
  readonly format?: QueryFormat;
  readonly noInference?: boolean;
  readonly reload?: boolean;
  readonly cache?: boolean;
  readonly jq?: string | null;
  readonly pretty?: boolean;
}

export interface RenderOptions {
  readonly check?: boolean;
  readonly reload?: boolean;
  readonly cache?: boolean;
  readonly noInference?: boolean;
}

/** The two `site:` values a session can override at run time. */
export interface RuntimeOverrides {
  readonly baseUrl?: string | null;
  readonly urlStyle?: string | null;
}

/**
 * A copy of `config` with one or more top-level blocks replaced.
 *
 * The copy is made with `Object.create` so that the class's methods survive —
 * `Config.isExcluded` is called on every document scan — and shares every block
 * it is not asked to replace. Sharing is safe for the blocks that are already
 * immutable in practice (`graph`, `link`, `check`, `lint`) and is *not* safe for
 * `wiki.input`, which is why `Wiki.load` builds that list before copying rather
 * than appending to a shared one.
 */
function copyConfig(
  config: Config,
  blocks: { readonly wiki?: Config["wiki"]; readonly site?: Config["site"] },
): Config {
  const copy = Object.create(Config.prototype) as Config;
  Object.assign(
    copy,
    config,
    blocks.wiki === undefined ? {} : { wiki: blocks.wiki },
    blocks.site === undefined ? {} : { site: blocks.site },
  );
  return copy;
}

/**
 * Apply the runtime `site:` overrides `_resolve_runtime_config` applies.
 *
 * `base_url` is right-stripped of `/` because every URL builder appends its own
 * separator; `url_style` is taken as given, since it is validated where the
 * config is loaded.
 */
export function resolveRuntimeConfig(
  config: Config,
  overrides: RuntimeOverrides = {},
): Config {
  const site = { ...config.site };
  let changed = false;
  if (overrides.baseUrl !== undefined && overrides.baseUrl !== null) {
    site.base_url = overrides.baseUrl.replace(/\/+$/, "");
    changed = true;
  }
  if (overrides.urlStyle !== undefined && overrides.urlStyle !== null) {
    site.url_style = overrides.urlStyle;
    changed = true;
  }
  return changed ? copyConfig(config, { site }) : config;
}

/** Loaded wiki configuration and graph session for library operations. */
export class Wiki {
  readonly config: Config;
  readonly config_path: Path | null;

  constructor(config: Config, configPath: Path | null = null) {
    this.config = config;
    this.config_path = configPath;
  }

  /**
   * Load a wiki from a config file or a directory holding one.
   *
   * `wikiInputs` overrides `wiki.input`, and relative entries resolve against
   * the config root the way a config file's own entries do. Locked sources are
   * then appended, since a source contributes documents to the same corpus.
   */
  static load(
    configPath: string | Path,
    options: { readonly wikiInputs?: readonly string[] | null } = {},
  ): Wiki {
    const path = configPath instanceof Path ? configPath : new Path(configPath);
    const resolvedConfigPath = findConfigPath(path);
    const config = Config.load(path);

    const inputs: Path[] = [...config.wiki.input];
    const wikiInputs = options.wikiInputs ?? null;
    if (wikiInputs !== null && wikiInputs.length > 0) {
      inputs.length = 0;
      for (const entry of wikiInputs) {
        const candidate = new Path(entry);
        inputs.push(
          candidate.isAbsolute()
            ? candidate
            : config.config_root.joinpath(candidate),
        );
      }
    }

    let current = inputs.length === config.wiki.input.length &&
        inputs.every((path, index) => path === config.wiki.input[index])
      ? config
      : copyConfig(config, { wiki: { ...config.wiki, input: inputs } });

    // A resolved path that is already an input is not added twice: a config can
    // name the same directory as a source and as `wiki.input` after a hand edit.
    // Comparison is on the path string, which is what Python's `set` of paths
    // does for two paths spelled the same way.
    const existing = new Set(current.wiki.input.map((path) => path.toString()));
    const fromSources: Path[] = [];
    for (const resolved of resolveSources(current)) {
      const key = resolved.toString();
      if (existing.has(key)) continue;
      existing.add(key);
      fromSources.push(resolved);
    }
    if (fromSources.length > 0) {
      current = copyConfig(current, {
        wiki: {
          ...current.wiki,
          input: [...current.wiki.input, ...fromSources],
        },
      });
    }

    return new Wiki(current, resolvedConfigPath);
  }

  /** A copy of this session with runtime `site:` overrides applied. */
  withRuntime(overrides: RuntimeOverrides = {}): Wiki {
    return new Wiki(
      resolveRuntimeConfig(this.config, overrides),
      this.config_path,
    );
  }

  /** The wiki's RDF graph, inferred by default. */
  graph(options: GraphOptions = {}): Promise<RdfGraph> {
    return loadGraph(this.config, {
      infer: options.infer ?? true,
      reload: options.reload ?? false,
      diskCache: options.diskCache ?? false,
    });
  }

  /** A read-only dataset with stable named graphs. */
  dataset(options: GraphOptions = {}): Promise<RdfDataset> {
    return loadDataset(this.config, {
      infer: options.infer ?? true,
      reload: options.reload ?? false,
      diskCache: options.diskCache ?? false,
    });
  }

  /** Named graph descriptors for the root corpus and installed sources. */
  graphs(): GraphDescriptor[] {
    return graphDescriptors(this.config);
  }

  /**
   * Run the integrity checks: SHACL, JSON Schema, routes, collisions, layout.
   *
   * With `files`, the pass is scoped to those documents and skips the whole-wiki
   * SHACL validation; without it, the wiki is validated as one graph. `strict`
   * promotes warnings to errors, which is what makes the exit code 1 rather than
   * 0 for a wiki whose only findings are advisory.
   */
  async check(
    files?: readonly Path[] | null,
    options: { readonly strict?: boolean } = {},
  ): Promise<AuditReport> {
    const batch = new DocumentBatch(this.config, files ?? null);
    const fileFilter = batch.routeFilter();
    const filePaths = batch.documentPaths();
    let report = filePaths !== null
      ? await runCheck(this.config, { fileFilter, filePaths })
      : await runCheck(this.config, { fileFilter });
    if (options.strict ?? false) report = report.applyStrict();
    return report;
  }

  /** Run the convention audits: links, filenames, headings, link style. */
  lint(
    files?: readonly Path[] | null,
    options: { readonly strict?: boolean } = {},
  ): AuditReport {
    const batch = new DocumentBatch(this.config, files ?? null);
    let report = runLint(this.config, batch.routeFilter());
    if (options.strict ?? false) report = report.applyStrict();
    return report;
  }

  /**
   * Format the wiki's markdown pages.
   *
   * `check` reports without writing; `verbose` names every file it touched or
   * found clean. The batch records both, so a `--check` run and a real one
   * produce the same file list.
   */
  format(
    files?: readonly Path[] | null,
    options: { readonly check?: boolean; readonly verbose?: boolean } = {},
  ): FmtReport {
    return new DocumentBatch(this.config, files ?? null).format(options);
  }

  async query(
    sparqlQuery: string,
    options: QueryOptions = {},
  ): Promise<string> {
    const graph = await loadQueryGraph(this.config, sparqlQuery, {
      infer: !(options.noInference ?? false),
      reload: options.reload ?? false,
      diskCache: options.cache ?? false,
    });
    const result = await runQuery(graph, sparqlQuery, {
      format: options.jq !== undefined && options.jq !== null
        ? "json"
        : options.format ?? "table",
      baseIri: this.config.base_iri,
      pretty: options.pretty ?? false,
    });
    if (options.jq === undefined || options.jq === null) return result;
    return resolvePath(JSON.parse(result), options.jq).map(pyStr).join("\n");
  }

  async render(
    files?: readonly Path[] | null,
    options: RenderOptions = {},
  ): Promise<RenderReport> {
    const explicitFiles = files && files.length > 0 ? files : [];
    if (explicitFiles.length > 0) {
      selectMarkdownPaths(this.config, explicitFiles);
    }
    let reloadNext = options.reload ?? false;
    const infer = !(options.noInference ?? false);
    const report = await renderMarkdownFiles(this.config, {
      dryRun: options.check ?? false,
      explicitFiles,
      baseIri: this.config.base_iri,
      knownSlugs: new Set(pageRoutes(this.config).map((page) => page.route)),
      queryGraph: async (query) => {
        const graph = await loadQueryGraph(this.config, query, {
          infer,
          reload: reloadNext,
          diskCache: options.cache ?? false,
        });
        reloadNext = false;
        return graph;
      },
    });
    if (options.cache && !options.check && report.updated_count > 0) {
      await this.graph({ infer, reload: true, diskCache: true });
      await this.dataset({ infer, reload: true, diskCache: true });
    }
    return report;
  }

  /**
   * Lint then check, merged — the order `build`'s preflight uses.
   *
   * `lint` first is not arbitrary: convention findings are cheaper to fix and
   * often *cause* the integrity findings a user would otherwise chase.
   */
  async preflight(): Promise<AuditReport> {
    return mergeResults(this.lint(), await this.check());
  }
}
