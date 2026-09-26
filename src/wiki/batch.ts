/**
 * Document selection and batch formatting for commands that take an optional
 * `FILE...` argument.
 *
 * Port of `batch.py`. The class exists so that `check`, `lint`, `link`,
 * `render`, `export`, and `fmt` all answer "which files did the user mean?" the
 * same way, and the two answers they need are different:
 *
 * - {@link DocumentBatch.routeFilter} is a set of *routes*, which is what the
 *   audit's rules filter on; and
 * - {@link DocumentBatch.documentPaths} is a list of *paths*, which is what the
 *   per-file SHACL and schema passes walk.
 *
 * Both are derived from the same positional arguments, so a command cannot
 * scope one pass and not the other — the bug the Python class was written to
 * prevent. `routeFilter` returns `null` for "no filter" where the audit's
 * parameters default to `None`, and `documentPaths` returns `null` for "whole
 * wiki" because `_run_check` distinguishes absent from empty.
 *
 * `format` is the one method that writes to disk. Its two guards are both
 * wiki#312 fixes and both matter more than they look:
 *
 * - **A page whose frontmatter cannot be parsed is refused, not reformatted.**
 *   Reformatting a page the engine cannot read is how a broken frontmatter
 *   block becomes a page with no frontmatter: the formatter sees prose where
 *   the metadata was. The batch stops at the first such page, leaves it
 *   untouched, and says which file to fix.
 * - **The original text is what decides staleness.** `--check` compares the
 *   formatter's output to the bytes on disk, so a page is "already formatted"
 *   only if a run would write nothing.
 */

import { basename } from "@std/path";
import { ValueError } from "./errors.ts";
import type { Config } from "./config.ts";

import { formatMarkdown } from "./fmt_util.ts";
import { frontmatterError, readTextTolerant } from "./parser.ts";
import type { FmtReport } from "./schemas/reports.ts";
import {
  iterMarkdownFiles,
  routesFromMarkdownFiles,
  selectDocumentPaths,
  selectMarkdownPaths,
} from "./paths.ts";

/** A set of files the user named on the command line, or none of them. */
export class DocumentBatch {
  readonly #config: Config;
  readonly #rawFiles: readonly string[] | null;

  constructor(config: Config, files?: readonly string[] | null) {
    this.#config = config;
    this.#rawFiles = files && files.length > 0 ? [...files] : null;
  }

  /** Whether this batch was scoped to specific files. */
  get isFiltered(): boolean {
    return this.#rawFiles !== null;
  }

  /**
   * The routes to filter on, or `null` for the whole wiki.
   *
   * Empty is not the same as absent: `wiki check` with no `FILE` means every
   * page, and an empty set would mean no pages at all.
   */
  routeFilter(): Set<string> | null {
    if (this.#rawFiles === null) return null;
    return routesFromMarkdownFiles(this.#config, this.#rawFiles);
  }

  /** The document paths to walk per-file, or `null` for the whole wiki. */
  documentPaths(): string[] | null {
    if (this.#rawFiles === null) return null;
    return selectDocumentPaths(this.#config, this.#rawFiles);
  }

  /** The markdown paths to process, filtered or not. Never `null`. */
  markdownPaths(): string[] {
    if (this.#rawFiles !== null) {
      return selectMarkdownPaths(this.#config, this.#rawFiles);
    }
    return iterMarkdownFiles(this.#config);
  }

  /**
   * Format the batch's markdown files and build an {@link FmtReport}.
   *
   * With `check`, nothing is written and `ok` means "nothing *would* change";
   * without it, each changed file is written and counted. Either way a stale
   * file is recorded, because `--check` and a real run report the same list.
   */
  format(
    options: { readonly check?: boolean; readonly verbose?: boolean } = {},
  ): FmtReport {
    const check = options.check ?? false;
    const verbose = options.verbose ?? false;
    const staleFiles: string[] = [];
    const verboseLines: string[] = [];
    let formattedCount = 0;

    for (const filePath of this.markdownPaths()) {
      try {
        const original = readTextTolerant(filePath);
        const blocked = frontmatterError(original);
        if (blocked !== null) {
          return {
            ok: false,
            stale_files: staleFiles,
            formatted_count: formattedCount,
            error_message:
              `Refusing to format ${
                basename(filePath)
              }: its frontmatter could not be ` +
              `parsed (${blocked}). The file is unchanged; fix the frontmatter ` +
              "block and run again.",
            verbose_lines: verboseLines,
          };
        }
        const formatted = formatMarkdown(original, filePath, this.#config);
        if (original !== formatted) {
          staleFiles.push(filePath);
          if (!check) {
            Deno.writeTextFileSync(filePath, formatted);
            formattedCount += 1;
            if (verbose) verboseLines.push(`Formatted ${basename(filePath)}`);
          }
        } else if (verbose) {
          verboseLines.push(`Already formatted ${basename(filePath)}`);
        }
      } catch (error) {
        return {
          ok: false,
          stale_files: staleFiles,
          formatted_count: formattedCount,
          error_message: `Error formatting ${basename(filePath)}: ${
            errorText(error)
          }`,
          verbose_lines: verboseLines,
        };
      }
    }

    return {
      ok: check ? staleFiles.length === 0 : true,
      stale_files: staleFiles,
      formatted_count: formattedCount,
      error_message: null,
      verbose_lines: verboseLines,
    };
  }
}

/** Python's `str(exception)` for the formatter's failure message. */
function errorText(error: unknown): string {
  if (error instanceof ValueError || error instanceof Error) {
    return error.message;
  }
  return String(error);
}
