/**
 * Typed operation-result models for the library-first API.
 *
 * Port of `src/wiki/schemas/reports.py`. These are the values every command
 * returns and the CLI turns into output and an exit code, so their *field
 * names* are part of the API — `report.errors`, `result.written_paths` — and
 * keep Python's spelling.
 *
 * Where pydantic supplies behaviour rather than storage, the port spells it
 * out as a method, because the behaviour is what callers depend on:
 *
 * - `AuditReport.empty()` is the starting point of every audit pass, and
 *   `merge()` is how `check` and `lint` become one report.
 * - `apply_strict()` is `--strict`: warnings become errors, and the report
 *   stops being ok. Note that it does not return a copy when there is nothing
 *   to promote — callers compare identity nowhere, but the shortcut is the
 *   Python behaviour and costs nothing to keep.
 */

import type { Path } from "../fspath.ts";
import type { OutputEntry } from "./domain.ts";

/** The two severities an issue can carry. */
export type IssueSeverity = "error" | "warning";

/** One audit finding. */
export interface Issue {
  readonly code: string;
  readonly message: string;
  readonly path?: Path | null;
  readonly severity?: IssueSeverity;
}

/** The result of an audit pass: whether it passed, and why not. */
export class AuditReport {
  readonly ok: boolean;
  readonly errors: readonly Issue[];
  readonly warnings: readonly Issue[];

  constructor(
    options: {
      readonly ok?: boolean;
      readonly errors?: readonly Issue[];
      readonly warnings?: readonly Issue[];
    } = {},
  ) {
    this.ok = options.ok ?? true;
    this.errors = options.errors ?? [];
    this.warnings = options.warnings ?? [];
  }

  /** A passing report with no issues. */
  static empty(): AuditReport {
    return new AuditReport();
  }

  /** Combine two passes into one report, in the order they ran. */
  merge(other: AuditReport): AuditReport {
    return new AuditReport({
      ok: this.ok && other.ok,
      errors: [...this.errors, ...other.errors],
      warnings: [...this.warnings, ...other.warnings],
    });
  }

  /** Promote every warning to an error, as `--strict` does. */
  applyStrict(): AuditReport {
    if (this.warnings.length === 0) return this;
    return new AuditReport({
      ok: false,
      errors: [...this.errors, ...this.warnings],
      warnings: [],
    });
  }

  /** `[error messages, warning messages]`, which is what the CLI prints. */
  messages(): [string[], string[]] {
    return [
      this.errors.map((issue) => issue.message),
      this.warnings.map((issue) => issue.message),
    ];
  }
}

/** An issue list plus the severity a rule assigned it. */
export function severityIssues(
  code: string,
  messages: readonly string[],
  severity: IssueSeverity,
): Issue[] {
  return messages.map((message) => ({ code, message, severity }));
}

/** What `link fix` did. */
export interface LinkReport {
  readonly ok: boolean;
  readonly opportunities: number;
  readonly fixes: number;
  readonly changed_paths: readonly Path[];
  readonly remaining_broken: number;
  readonly lines: readonly string[];
}

/** What `render` did. */
export interface RenderReport {
  readonly ok: boolean;
  readonly updated_count: number;
  readonly error_count: number;
  readonly stale_files: readonly string[];
  readonly render_errors: readonly string[];
}

/** Options for `build`. */
export interface BuildOptions {
  readonly output_dir: Path;
  readonly render_first?: boolean;
  readonly reload_graph?: boolean;
  readonly disk_cache?: boolean;
  readonly skip_preflight?: boolean;
  readonly verbose?: boolean;
}

/** What `build` did, including the preflight report when it ran one. */
export interface BuildResult {
  readonly ok: boolean;
  readonly page_count: number;
  readonly asset_count: number;
  readonly written_paths: readonly Path[];
  readonly preflight?: AuditReport | null;
  readonly error_message?: string | null;
}

/** What `export` produced. */
export interface ExportResult {
  readonly ok: boolean;
  readonly output: string;
  readonly error_message?: string | null;
}

/** What `fmt` did. */
export interface FmtReport {
  readonly ok: boolean;
  readonly stale_files: readonly Path[];
  readonly formatted_count: number;
  readonly error_message?: string | null;
  readonly verbose_lines: readonly string[];
}

/** What `init` wrote. */
export interface ScaffoldResult {
  readonly ok: boolean;
  readonly config_path?: Path | null;
  readonly written_paths: readonly Path[];
  readonly message: string;
  readonly error_message?: string | null;
}

/** An output entry list plus the entries a collision check needs. */
export type Manifest = readonly OutputEntry[];
