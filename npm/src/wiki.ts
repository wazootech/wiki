import type { ChildProcess } from "node:child_process";
import { runWiki, spawnWiki } from "./runner";
import type {
  BuildOptions,
  CheckOptions,
  ExportOptions,
  ExportResult,
  FmtOptions,
  InitOptions,
  LinkOptions,
  LintOptions,
  PreflightOptions,
  PreflightResult,
  QueryOptions,
  RenderOptions,
  RunOptions,
  RuntimeOptions,
  ServeOptions,
  UpgradeOptions,
  WikiCommandResult,
  WikiLoadOptions,
} from "./types";

type FlagValue = string | number | boolean | undefined;

function pushFlag(args: string[], flag: string, value: FlagValue): void {
  if (value === undefined) return;
  if (typeof value === "boolean") {
    if (value) args.push(flag);
    return;
  }
  args.push(flag, String(value));
}

function pushRepeated(args: string[], flag: string, values: readonly string[] | undefined): void {
  for (const value of values ?? []) {
    args.push(flag, value);
  }
}

function appendFiles(args: string[], files: readonly string[] | undefined): void {
  if (files?.length) args.push(...files);
}

function parseJsonOutput<T>(result: WikiCommandResult): ExportResult<T> {
  return { ...result, data: JSON.parse(result.stdout) as T };
}

export class Wiki {
  readonly config: string | undefined;
  readonly wikiInputs: readonly string[];
  readonly cwd: string | undefined;
  readonly env: NodeJS.ProcessEnv | undefined;
  readonly runtime: RuntimeOptions;

  constructor(options: WikiLoadOptions & { runtime?: RuntimeOptions } = {}) {
    this.config = options.config;
    this.wikiInputs = options.wikiInputs ?? [];
    this.cwd = options.cwd;
    this.env = options.env;
    this.runtime = options.runtime ?? {};
  }

  static load(options: WikiLoadOptions = {}): Wiki {
    return new Wiki(options);
  }

  withRuntime(options: RuntimeOptions): Wiki {
    const loadOptions: WikiLoadOptions & { runtime?: RuntimeOptions } = {
      wikiInputs: this.wikiInputs,
      runtime: { ...this.runtime, ...options },
    };
    if (this.config !== undefined) loadOptions.config = this.config;
    if (this.cwd !== undefined) loadOptions.cwd = this.cwd;
    if (this.env !== undefined) loadOptions.env = this.env;
    return new Wiki(loadOptions);
  }

  args(subcommand: string, subcommandArgs: readonly string[] = []): string[] {
    const args: string[] = [];
    pushRepeated(args, "--wiki-inputs", this.wikiInputs);
    pushFlag(args, "--config", this.config);
    args.push(subcommand, ...subcommandArgs);
    return args;
  }

  run(args: readonly string[], options: RunOptions = {}): Promise<WikiCommandResult> {
    const runOptions: RunOptions = { env: { ...this.env, ...options.env } };
    const cwd = options.cwd ?? this.cwd;
    if (cwd !== undefined) runOptions.cwd = cwd;
    if (options.stdin !== undefined) runOptions.stdin = options.stdin;
    if (options.timeoutMs !== undefined) runOptions.timeoutMs = options.timeoutMs;
    if (options.throwOnError !== undefined) runOptions.throwOnError = options.throwOnError;
    if (options.signal !== undefined) runOptions.signal = options.signal;
    return runWiki(args, runOptions);
  }

  check(options: CheckOptions = {}): Promise<WikiCommandResult> {
    const args: string[] = [];
    pushFlag(args, "--verbose", options.verbose);
    pushFlag(args, "--strict", options.strict);
    appendFiles(args, options.files);
    return this.run(this.args("check", args));
  }

  lint(options: LintOptions = {}): Promise<WikiCommandResult> {
    const args: string[] = [];
    pushFlag(args, "--verbose", options.verbose);
    pushFlag(args, "--strict", options.strict);
    appendFiles(args, options.files);
    return this.run(this.args("lint", args));
  }

  async preflight(options: PreflightOptions = {}): Promise<PreflightResult> {
    const lint = await this.lint(options);
    const check = await this.check(options);
    return { lint, check };
  }

  build(options: BuildOptions = {}): Promise<WikiCommandResult> {
    const args: string[] = [];
    pushFlag(args, "--output-dir", options.outputDir);
    pushFlag(args, "--site-base-url", options.baseUrl ?? this.runtime.baseUrl);
    pushFlag(args, "--site-url-style", options.urlStyle ?? this.runtime.urlStyle);
    pushFlag(args, "--render", options.render);
    pushFlag(args, "--reload", options.reload);
    pushFlag(args, "--cache", options.cache);
    pushFlag(args, "--no-check", options.noCheck);
    pushFlag(args, "--verbose", options.verbose);
    return this.run(this.args("build", args));
  }

  fmt(options: FmtOptions = {}): Promise<WikiCommandResult> {
    const args: string[] = [];
    pushFlag(args, "--check", options.check);
    pushFlag(args, "--verbose", options.verbose);
    appendFiles(args, options.files);
    return this.run(this.args("fmt", args));
  }

  format(options: FmtOptions = {}): Promise<WikiCommandResult> {
    return this.fmt(options);
  }

  render(options: RenderOptions = {}): Promise<WikiCommandResult> {
    const args: string[] = [];
    pushFlag(args, "--no-inference", options.noInference);
    pushFlag(args, "--reload", options.reload);
    pushFlag(args, "--cache", options.cache);
    pushFlag(args, "--check", options.check);
    pushFlag(args, "--verbose", options.verbose);
    appendFiles(args, options.files);
    return this.run(this.args("render", args));
  }

  async export<T = unknown>(options: ExportOptions = {}): Promise<ExportResult<T>> {
    const args: string[] = [];
    pushFlag(args, "--output", options.output);
    pushFlag(args, "--format", options.format);
    pushFlag(args, "--mode", options.mode);
    appendFiles(args, options.files);
    const result = await this.run(this.args("export", args));
    const shouldParseJson = options.parseJson ?? (options.format === undefined || options.format === "dict" || options.format === "json-ld");
    if (shouldParseJson) {
      return parseJsonOutput<T>(result);
    }
    return result;
  }

  link(options: LinkOptions = {}): Promise<WikiCommandResult> {
    const args: string[] = [];
    pushFlag(args, "--apply", options.apply);
    pushFlag(args, "--fix-broken", options.fixBroken);
    pushFlag(args, "--dry-run", options.dryRun);
    pushFlag(args, "--check", options.check);
    pushFlag(args, "--verbose", options.verbose);
    appendFiles(args, options.files);
    return this.run(this.args("link", args));
  }

  async query<T = unknown>(options: QueryOptions): Promise<string | T> {
    const args: string[] = [];
    pushFlag(args, "--format", options.format);
    pushFlag(args, "--output", options.output);
    pushFlag(args, "--no-inference", options.noInference);
    pushFlag(args, "--reload", options.reload);
    pushFlag(args, "--cache", options.cache);
    pushFlag(args, "--jq", options.jq);
    pushFlag(args, "--pretty", options.pretty);
    pushFlag(args, "--verbose", options.verbose);
    args.push(options.query);
    const result = await this.run(this.args("query", args));
    if (options.parseJson ?? options.format === "json") {
      return JSON.parse(result.stdout) as T;
    }
    return result.stdout;
  }

  serve(options: ServeOptions = {}): ChildProcess {
    const args: string[] = [];
    pushFlag(args, "--host", options.host);
    pushFlag(args, "--port", options.port);
    pushFlag(args, "--site-base-url", options.baseUrl ?? this.runtime.baseUrl);
    pushFlag(args, "--site-url-style", options.urlStyle ?? this.runtime.urlStyle);
    pushFlag(args, "--watch", options.watch);
    return spawnWiki(this.args("serve", args), {
      cwd: options.cwd ?? this.cwd,
      env: { ...this.env, ...options.env },
    });
  }

  init(options: InitOptions = {}): Promise<WikiCommandResult> {
    const args: string[] = [];
    pushFlag(args, "--git", options.git);
    pushFlag(args, "--repo", options.repo);
    pushFlag(args, "--graph-context-wiki", options.graphContextWiki);
    pushFlag(args, "--site-base-url", options.siteBaseUrl);
    pushFlag(args, "--site-url-style", options.siteUrlStyle);
    pushFlag(args, "--graph-content-predicate", options.graphContentPredicate);
    pushFlag(args, "--link-style", options.linkStyle);
    pushRepeated(args, "--wiki-inputs", options.wikiInputs);
    pushFlag(args, "--graph-base-iri", options.graphBaseIri);
    pushRepeated(args, "--graph-implicit-types", options.graphImplicitTypes);
    pushFlag(args, "--graph-implicit-types-policy", options.graphImplicitTypesPolicy);
    if (options.graphIncludeFileExtension !== undefined) {
      args.push(options.graphIncludeFileExtension ? "--graph-include-file-extension" : "--no-graph-include-file-extension");
    }
    return this.run(this.args("init", args));
  }

  upgrade(options: UpgradeOptions = {}): Promise<WikiCommandResult> {
    const args: string[] = [];
    pushFlag(args, "--check", options.check);
    pushFlag(args, "--yes", options.yes);
    pushFlag(args, "--verbose", options.verbose);
    return this.run(this.args("upgrade", args));
  }
}
