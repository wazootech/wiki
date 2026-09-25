/**
 * Document selection for commands that take an optional `FILE...` argument.
 *
 * Port of `batch.py`, minus `format`. The class exists so that `check`, `lint`,
 * `link`, `render`, `export`, and `fmt` all answer "which files did the user
 * mean?" the same way, and the two answers they need are different:
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
 * `format` is not here yet: it is the only method that needs the markdown
 * formatter, which lands in phase 7 with `fmt_util` and the `deno fmt` probe.
 * Everything it would call (`markdownPaths` and the `FmtReport` shape) already
 * exists.
 */

import type { Config } from "./config.ts";
import type { Path } from "./fspath.ts";
import {
  iterMarkdownFiles,
  routesFromMarkdownFiles,
  selectDocumentPaths,
  selectMarkdownPaths,
} from "./paths.ts";

/** A set of files the user named on the command line, or none of them. */
export class DocumentBatch {
  readonly #config: Config;
  readonly #rawFiles: readonly Path[] | null;

  constructor(config: Config, files?: readonly Path[] | null) {
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
  documentPaths(): Path[] | null {
    if (this.#rawFiles === null) return null;
    return selectDocumentPaths(this.#config, this.#rawFiles);
  }

  /** The markdown paths to process, filtered or not. Never `null`. */
  markdownPaths(): Path[] {
    if (this.#rawFiles !== null) {
      return selectMarkdownPaths(this.#config, this.#rawFiles);
    }
    return iterMarkdownFiles(this.#config);
  }
}
