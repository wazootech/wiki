import type { ChildProcess } from "node:child_process";

import type {
  ExportOptions as GeneratedExportOptions,
  McpOptions as GeneratedMcpOptions,
  QueryOptions as GeneratedQueryOptions,
  ServeOptions as GeneratedServeOptions,
  UrlStyle,
} from "./types.generated";

/** Options for loading a Wiki instance. */
export interface WikiLoadOptions {
  /** Path to ``wiki.yml`` (or directory containing it). */
  config?: string;
  /** Override ``wiki.input`` from the config file. */
  input?: readonly string[];
  /** Working directory for the wiki CLI subprocess. */
  cwd?: string;
  /** Environment variables for the wiki CLI subprocess. */
  env?: NodeJS.ProcessEnv;
}

/** Low-level options for ``Wiki.run()``. */
export interface RunOptions {
  /** Working directory for the subprocess. */
  cwd?: string;
  /** Extra environment variables. */
  env?: NodeJS.ProcessEnv;
  /** String to pipe to stdin. */
  stdin?: string;
  /** Kill the command after this many milliseconds. */
  timeoutMs?: number;
  /** Whether to throw on non-zero exit (default ``true``). */
  throwOnError?: boolean;
  /** AbortSignal for cancellation. */
  signal?: AbortSignal;
}

/** Result returned by ``Wiki.run()`` and most command methods. */
export interface WikiCommandResult {
  /** ``true`` when the CLI exited with code 0. */
  ok: boolean;
  /** The numeric exit code. */
  exitCode: number;
  /** Stdout content. */
  stdout: string;
  /** Stderr content. */
  stderr: string;
  /** The full argv array passed to the CLI. */
  command: readonly string[];
}

// ── Generated CLI option bags and choice unions ────────────────────────────
// these stable option bags and choice unions mirror the packaged Wiki CLI contract; SDK-only fields extend them below.
export type {
  BuildOptions,
  CheckOptions,
  ExportFormat,
  ExportMode,
  FmtOptions,
  InitOptions,
  InstallOptions,
  LinkOptions,
  LinkStyle,
  LintOptions,
  McpMode,
  QueryFormat,
  RenderOptions,
  RemoveOptions,
  UpdateOptions,
  UpgradeOptions,
  UrlStyle,
} from "./types.generated";

/** Mixin for methods that accept a ``files`` filter. */
export interface FilesOption {
  /** Subset of wiki files to operate on. Omit for whole-wiki mode. */
  files?: readonly string[];
}

/**
 * Shared options for check and lint.
 *
 * Retained as a standalone type for API stability; the generated
 * ``CheckOptions``/``LintOptions`` bags carry the same members.
 */
export interface StrictOption extends FilesOption {
  /** Elevate all warnings to errors. */
  strict?: boolean;
  /** Print detailed audit output. */
  verbose?: boolean;
}

/** Options for ``Wiki.preflight()``. */
export interface PreflightOptions {
  /** Elevate all warnings to errors. */
  strict?: boolean;
  /** Print detailed audit output. */
  verbose?: boolean;
}

/** Options for ``Wiki.export()``. */
export interface ExportOptions extends GeneratedExportOptions {
  /** Automatically parse JSON output into ``data`` field. */
  parseJson?: boolean;
}

/** Options for ``Wiki.query()``. */
export interface QueryOptions extends GeneratedQueryOptions {
  /** Automatically parse JSON output. */
  parseJson?: boolean;
}

/** Options for ``Wiki.serve()``. */
export interface ServeOptions extends GeneratedServeOptions {
  /** Working directory for the subprocess. */
  cwd?: string;
  /** Extra environment variables. */
  env?: NodeJS.ProcessEnv;
}

/** Options for ``Wiki.mcp()``. */
export interface McpOptions extends GeneratedMcpOptions {
  /** Working directory for the subprocess. */
  cwd?: string;
  /** Extra environment variables. */
  env?: NodeJS.ProcessEnv;
}

/** Extended result from ``Wiki.export()`` with parsed JSON data. */
export interface ExportResult<T = unknown> extends WikiCommandResult {
  /** Parsed output data when ``parseJson`` is enabled. */
  data?: T;
}

/** Runtime overrides applied to a Wiki session (immutable config copy). */
export interface RuntimeOptions {
  /** Override ``site.base_url`` for this session. */
  baseUrl?: string;
  /** Override ``site.url_style`` (``"file"`` or ``"dir"``). */
  urlStyle?: UrlStyle;
}

/** Result of ``Wiki.preflight()`` — lint and check reports. */
export interface PreflightResult {
  /** Lint audit result. */
  lint: WikiCommandResult;
  /** Check audit result. */
  check: WikiCommandResult;
}

/** The child process returned by ``Wiki.serve()``. */
export type ServeProcess = ChildProcess;
/** The child process returned by ``Wiki.mcp()``. */
export type McpProcess = ChildProcess;
