/**
 * Shared domain DTOs for wiki paths, links, and audit issues.
 *
 * Port of `src/wiki/schemas/domain.py`. These are frozen pydantic models on the
 * Python side; in TypeScript they are plain readonly interfaces, since nothing
 * here needs runtime validation — every one is built by engine code, never
 * parsed from user input.
 */

import type { Path } from "../fspath.ts";

/** A wiki page: its source file and the route it is published at. */
export interface PageRoute {
  readonly source: Path;
  readonly route: string;
}

/** One entry in the output manifest a build produces. */
export interface OutputEntry {
  readonly source: Path | null;
  readonly output_path: Path;
  readonly public_url: string;
  readonly kind: string;
}

/** A link that does not resolve to a page, asset, or heading. */
export interface BrokenLink {
  readonly source_route: string;
  readonly source_path: Path;
  readonly link_kind: string;
  readonly raw_target: string;
  readonly issue_kind: string;
  readonly message: string;
  readonly match_start: number | null;
  readonly match_end: number | null;
  readonly full_match: string | null;
}

/** A proposed repair for a {@link BrokenLink}, produced by `link fix`. */
export interface BrokenLinkFix {
  readonly issue: BrokenLink;
  readonly replacement_target: string;
  readonly description: string;
}

/** A plain-text mention that could be turned into a wiki link. */
export interface LinkOpportunity {
  readonly source_route: string;
  readonly source_file: string;
  readonly line: number;
  readonly column: number;
  readonly matched_text: string;
  readonly target_route: string;
  readonly target_title: string;
}
