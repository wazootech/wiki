import type { ChildProcess } from "node:child_process";

export type UrlStyle = "dir" | "file";
export type LinkStyle = "standard" | "wikilink";
export type QueryFormat = "table" | "json" | "csv" | "tsv" | "turtle" | "n3" | "markdown";
export type ExportFormat = "dict" | "json-ld" | "turtle" | "xml" | "n3" | "nt" | "trig" | "nquads";
export type ExportMode = "expanded" | "compacted";

export interface WikiLoadOptions {
  config?: string;
  wikiInputs?: readonly string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export interface RunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdin?: string;
  timeoutMs?: number;
  throwOnError?: boolean;
  signal?: AbortSignal;
}

export interface WikiCommandResult {
  ok: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  command: readonly string[];
}

export interface FilesOption {
  files?: readonly string[];
}

export interface StrictOption extends FilesOption {
  strict?: boolean;
  verbose?: boolean;
}

export type CheckOptions = StrictOption;
export type LintOptions = StrictOption;

export interface PreflightOptions {
  strict?: boolean;
  verbose?: boolean;
}

export interface BuildOptions {
  outputDir?: string;
  baseUrl?: string;
  urlStyle?: UrlStyle;
  render?: boolean;
  reload?: boolean;
  cache?: boolean;
  noCheck?: boolean;
  verbose?: boolean;
}

export interface FmtOptions extends FilesOption {
  check?: boolean;
  verbose?: boolean;
}

export interface RenderOptions extends FilesOption {
  check?: boolean;
  reload?: boolean;
  cache?: boolean;
  noInference?: boolean;
  verbose?: boolean;
}

export interface ExportOptions extends FilesOption {
  output?: string;
  format?: ExportFormat;
  mode?: ExportMode;
  parseJson?: boolean;
}

export interface ExportResult<T = unknown> extends WikiCommandResult {
  data?: T;
}

export interface LinkOptions extends FilesOption {
  apply?: boolean;
  fixBroken?: boolean;
  dryRun?: boolean;
  check?: boolean;
  verbose?: boolean;
}

export interface QueryOptions {
  query: string;
  format?: QueryFormat;
  output?: string;
  noInference?: boolean;
  reload?: boolean;
  cache?: boolean;
  jq?: string;
  pretty?: boolean;
  verbose?: boolean;
  parseJson?: boolean;
}

export interface ServeOptions {
  host?: string;
  port?: number;
  baseUrl?: string;
  urlStyle?: UrlStyle;
  watch?: boolean;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export interface RuntimeOptions {
  baseUrl?: string;
  urlStyle?: UrlStyle;
}

export interface InitOptions {
  git?: boolean;
  repo?: string;
  graphContextWiki?: string;
  siteBaseUrl?: string;
  siteUrlStyle?: UrlStyle;
  graphContentPredicate?: string;
  linkStyle?: LinkStyle;
  wikiInputs?: readonly string[];
  graphBaseIri?: string;
  graphImplicitTypes?: readonly string[];
  graphImplicitTypesPolicy?: "fallback" | "append";
  graphIncludeFileExtension?: boolean;
}

export interface UpgradeOptions {
  check?: boolean;
  yes?: boolean;
  verbose?: boolean;
}

export interface PreflightResult {
  lint: WikiCommandResult;
  check: WikiCommandResult;
}

export type ServeProcess = ChildProcess;
