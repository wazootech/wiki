/**
 * The `Wiki` session: config, graph lifecycle, and the operations built on them.
 *
 * Deno/TypeScript implementation of the Python `Wiki` session API. The session
 * owns configuration and graph lifecycle; implementation-specific deferrals are
 * recorded in `docs/adr/0001-deno-rewrite.md`.
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
import { buildStaticSite } from "./site/publish.ts";
import { startStaticSiteServer } from "./site/server.ts";
import { Config, findConfigPath } from "./config.ts";
import { Path } from "./fspath.ts";
import {
  graphDescriptors,
  loadDataset,
  loadGraph,
  loadQueryGraph,
} from "./graph.ts";
import { renderMarkdownFiles } from "./render.ts";
import { exportFrontmatter, type ExportOptions } from "./export.ts";
import {
  applyBrokenLinkFixes,
  findBrokenLinkFixes,
  remainingBrokenLinks,
} from "./link_fix.ts";
import {
  applyLinkOpportunities,
  findLinkOpportunities,
} from "./link_suggest.ts";
import { formatInternalLink } from "./links.ts";
import { type QueryFormat, runQuery } from "./format.ts";
import { resolvePath } from "./jqfilter.ts";
import { pyStr } from "./pyrepr.ts";
import type { RdfDataset, RdfGraph } from "./rdf.ts";
import {
  install as installSources,
  remove as removeSource,
  resolve as resolveSources,
  update as updateSources,
  type UpdateResult,
} from "./sources.ts";
import {
  fetchTemplate,
  type ResolveInitOptions,
  resolveInitOptions,
  scaffoldWiki,
} from "./init_scaffold.ts";
import { createSparqlServiceHandler } from "./sparql_service.ts";
import {
  pageRoutes,
  routesFromMarkdownFiles,
  selectMarkdownPaths,
} from "./paths.ts";
import type { GraphDescriptor } from "./schemas/sources.ts";
import type {
  AuditReport,
  BuildResult,
  ExportResult,
  FmtReport,
  LinkReport,
  RenderReport,
  ScaffoldResult,
} from "./schemas/reports.ts";
import type { Lockfile } from "./schemas/sources.ts";

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
export interface LinkOptions {
  readonly apply?: boolean;
  readonly fixBroken?: boolean;
  readonly dryRun?: boolean;
  readonly check?: boolean;
  readonly verbose?: boolean;
}

/** The two `site:` values a session can override at run time. */
export interface RuntimeOverrides {
  readonly baseUrl?: string | null;
  readonly urlStyle?: string | null;
}

export interface BuildMethodOptions extends RuntimeOverrides {
  readonly render?: boolean;
  readonly reload?: boolean;
  readonly cache?: boolean;
  readonly noCheck?: boolean;
  readonly verbose?: boolean;
}

export interface ServeOptions extends RuntimeOverrides {
  readonly host?: string;
  readonly port?: number;
  readonly watch?: boolean;
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

export interface WikiInitOptions extends Omit<ResolveInitOptions, "cwd"> {
  readonly cwd?: string | Path;
  readonly template?: string | null;
}

/** Loaded wiki configuration and graph session for library operations. */
export class Wiki {
  readonly config: Config;
  readonly config_path: Path | null;

  constructor(config: Config, configPath: Path | null = null) {
    this.config = config;
    this.config_path = configPath;
  }

  static init(options: WikiInitOptions = {}): ScaffoldResult {
    const cwd = options.cwd ?? Deno.cwd();
    if (options.template !== undefined && options.template !== null) {
      return fetchTemplate(cwd, options.template);
    }
    const { cwd: _cwd, template: _template, ...initOptions } = options;
    const resolved = resolveInitOptions({ ...initOptions, cwd });
    return scaffoldWiki(
      cwd,
      resolved,
      options.init_git === undefined ? {} : { init_git: options.init_git },
    );
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

  install(url?: string | null): Lockfile {
    return installSources(this.config, url);
  }

  update(
    name?: string | null,
    options: { readonly dryRun?: boolean } = {},
  ): UpdateResult {
    return updateSources(
      this.config,
      name,
      options.dryRun === undefined ? {} : { dry_run: options.dryRun },
    );
  }

  remove(name: string): void {
    removeSource(this.config, name);
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

  async export(
    files?: readonly Path[] | null,
    options: ExportOptions = {},
  ): Promise<ExportResult> {
    return await exportFrontmatter(this.config, files ?? null, options);
  }

  async build(
    outputDir: Path | string = "_site",
    options: BuildMethodOptions = {},
  ): Promise<BuildResult> {
    const wiki = this.withRuntime({
      ...(options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl }),
      ...(options.urlStyle === undefined ? {} : { urlStyle: options.urlStyle }),
    });
    return await buildStaticSite(wiki, {
      output_dir: outputDir instanceof Path ? outputDir : new Path(outputDir),
      ...(options.baseUrl === undefined ? {} : { base_url: options.baseUrl }),
      ...(options.urlStyle === undefined
        ? {}
        : { url_style: options.urlStyle }),
      ...(options.render === undefined ? {} : { render_first: options.render }),
      ...(options.reload === undefined ? {} : { reload_graph: options.reload }),
      ...(options.cache === undefined ? {} : { disk_cache: options.cache }),
      ...(options.noCheck === undefined
        ? {}
        : { skip_preflight: options.noCheck }),
      ...(options.verbose === undefined ? {} : { verbose: options.verbose }),
    });
  }

  async serve(options: ServeOptions = {}): Promise<void> {
    const baseUrl = options.baseUrl ?? this.config.site.base_url;
    const urlStyle = (options.urlStyle ?? this.config.site.url_style) as
      | "dir"
      | "file";
    const tempDir = await Deno.makeTempDir({ prefix: "wiki-serve-" });
    const outputDir = new Path(tempDir);
    let server: ReturnType<typeof startStaticSiteServer> | null = null;
    let stopWatching: (() => void) | null = null;
    try {
      const result = await this.build(outputDir, {
        baseUrl,
        urlStyle,
        noCheck: true,
      });
      if (!result.ok) {
        throw new Error(
          result.error_message ?? "The wiki site could not be built.",
        );
      }
      const baseParts = baseUrl.split("/").filter(Boolean);
      const siteDir = baseParts.length > 0
        ? outputDir.joinpath(...baseParts)
        : outputDir;
      server = startStaticSiteServer({
        siteDir: siteDir.toString(),
        host: options.host ?? "127.0.0.1",
        port: options.port ?? 8080,
        baseUrl,
        urlStyle,
        watch: options.watch ?? false,
        requestHandler: createSparqlServiceHandler(this, {
          path: this.config.sparql_service.path,
          baseUrl,
        }),
      });
      const stop = new AbortController();
      if (options.watch) {
        let snapshot = this.watchSnapshot();
        const watchLoop = async () => {
          while (!stop.signal.aborted) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            if (stop.signal.aborted) break;
            const next = this.watchSnapshot();
            if (next === snapshot) continue;
            snapshot = next;
            try {
              await this.render(null, { reload: true });
              const rebuilt = await this.build(outputDir, {
                baseUrl,
                urlStyle,
                noCheck: true,
              });
              if (!rebuilt.ok) {
                console.error(
                  `Error: ${rebuilt.error_message ?? "Wiki rebuild failed."}`,
                );
              }
            } catch (error) {
              console.error(
                `Error: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              );
            }
            snapshot = this.watchSnapshot();
          }
        };
        void watchLoop();
        stopWatching = () => stop.abort();
      }
      console.log(`Wiki server ready at ${server.url}`);
      console.log(
        `Serving ${result.page_count} pages from ${
          this.config.wiki.input.join(", ")
        }`,
      );
      if (result.page_count === 0) {
        console.log(
          "Warning: no pages found. Ensure your wiki directory has .md, .yaml, .yml, or .json files.",
        );
      }
      console.log("Press Ctrl+C to stop.");
      const onInterrupt = () => {
        void server?.close();
      };
      Deno.addSignalListener("SIGINT", onInterrupt);
      try {
        await server.server.finished;
      } finally {
        Deno.removeSignalListener("SIGINT", onInterrupt);
      }
    } finally {
      stopWatching?.();
      await server?.close();
      await Deno.remove(tempDir, { recursive: true });
    }
  }

  private watchSnapshot(): string {
    const watchedExtensions = new Set([
      ".md",
      ".yaml",
      ".yml",
      ".json",
      ".ttl",
      ".trig",
      ".nt",
      ".nq",
      ".rdf",
      ".xml",
      ".jsonld",
      ".html",
      ".htm",
      ".png",
      ".jpg",
      ".jpeg",
      ".gif",
      ".svg",
      ".webp",
      ".css",
      ".js",
      ".woff2",
      ".woff",
      ".ttf",
    ]);
    const files = new Map<string, Path>();
    for (
      const root of [...this.config.wiki.input, ...this.config.wiki.assets]
    ) {
      if (!root.exists()) continue;
      const paths = root.isFile() ? [root] : root.rglob();
      for (const path of paths) {
        if (!path.isFile() || this.config.isExcluded(path)) continue;
        if (!watchedExtensions.has(path.suffix.toLowerCase())) continue;
        files.set(path.toString(), path);
      }
    }
    return [...files.values()].sort((a, b) =>
      a.toString().localeCompare(b.toString())
    )
      .map((path) => {
        const stat = Deno.statSync(path.toString());
        return `${path}:${stat.mtime?.getTime() ?? 0}:${stat.size}`;
      }).join("\n");
  }

  link(
    files?: readonly Path[] | null,
    options: LinkOptions = {},
  ): LinkReport {
    const fileFilter = files && files.length > 0
      ? routesFromMarkdownFiles(this.config, files)
      : null;
    const report = {
      ok: true,
      opportunities: 0,
      fixes: 0,
      changed_paths: [] as Path[],
      remaining_broken: 0,
      lines: [] as string[],
    };

    if (options.fixBroken) {
      const fixes = findBrokenLinkFixes(this.config, fileFilter);
      report.fixes = fixes.length;
      for (const fix of fixes) {
        report.lines.push(
          `${fix.issue.source_path.name}: ${fix.issue.link_kind} [` +
            `${fix.issue.raw_target}] -> ${fix.description}`,
        );
      }
      if (fixes.length > 0) {
        report.changed_paths.push(
          ...applyBrokenLinkFixes(fixes, options.dryRun ?? false),
        );
      }
      if (options.check) {
        const remaining = remainingBrokenLinks(
          this.config,
          fileFilter,
          options.dryRun ? fixes : null,
        );
        report.remaining_broken = remaining.length;
        report.ok = remaining.length === 0;
      }
      if (!options.apply) return report;
    }

    const opportunities = findLinkOpportunities(this.config, fileFilter);
    report.opportunities = opportunities.length;
    if (options.apply) {
      if (opportunities.length > 0) {
        report.changed_paths.push(
          ...applyLinkOpportunities(
            this.config,
            opportunities,
            options.dryRun ?? false,
          ),
        );
      }
      if (options.check) {
        report.ok = findLinkOpportunities(this.config, fileFilter).length === 0;
      }
      return report;
    }

    if (opportunities.length === 0) {
      report.ok = true;
      return report;
    }
    for (const item of opportunities) {
      const suggestion = formatInternalLink(
        item.target_route,
        item.matched_text,
        this.config.link.style,
      );
      const target = options.verbose
        ? `${item.target_route} (${item.target_title})`
        : suggestion;
      report.lines.push(
        `${item.source_file}:${item.line}:${item.column}: ` +
          `"${item.matched_text}" -> ${target}`,
      );
    }
    report.ok = !options.check;
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
