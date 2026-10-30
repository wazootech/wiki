import { extname } from "@std/path";
import type { Config } from "../config.ts";
import {
  deriveMetadataAll,
  type RedundantField,
  redundantFields,
} from "../derived.ts";
import type { EditReport } from "../edit.ts";
import { documentDataFromPath } from "../parser.ts";
import { iterMarkdownFiles, routeForDocumentFile } from "../paths.ts";

/** One document's redundant entries. */
export interface RedundantDocument {
  /** The document path as the wiki walk produced it. */
  readonly path: string;
  readonly route: string;
  readonly fields: readonly RedundantField[];
}

/**
 * Every Markdown page whose frontmatter repeats a derived value, in walk
 * order. `paths` narrows the walk; `null` means the whole wiki.
 */
export async function findRedundantFrontmatter(
  config: Config,
  paths: readonly string[] | null = null,
): Promise<RedundantDocument[]> {
  const files = (paths ?? iterMarkdownFiles(config)).filter((path) =>
    extname(path).toLowerCase() === ".md"
  );
  const withData = files.flatMap((path) => {
    const data = documentDataFromPath(path);
    return data === null ? [] : [{ path, data }];
  });
  const derived = await deriveMetadataAll(withData.map((item) => item.path));
  const documents: RedundantDocument[] = [];
  for (const { path, data } of withData) {
    const fields = redundantFields(data, derived.get(path)!, config);
    if (fields.length === 0) continue;
    documents.push({ path, route: routeForDocumentFile(config, path), fields });
  }
  return documents;
}

/** An entry `removeFrontmatterKeys` left in place, and why. */
export interface SkippedKey {
  readonly key: string;
  readonly reason: string;
}

/** The result of cutting keys out of one page's text. */
export interface KeyRemoval {
  readonly content: string;
  readonly removed: readonly string[];
  readonly skipped: readonly SkippedKey[];
}

/** What `wiki fix` found, and did, for one page. */
export interface FixFile {
  /** Relative to the config root, `/`-separated. */
  readonly path: string;
  readonly route: string;
  /** The entries removed (or, in preview, that would be). */
  readonly removed: readonly RedundantField[];
  readonly skipped: readonly SkippedKey[];
}

/**
 * - `clean`: nothing redundant; nothing to do.
 * - `dry_run`: the fix validates and was not written (no `apply`).
 * - `applied`: written.
 * - `rejected` / `conflict`: as for `wiki edit`; nothing was written.
 */
export type FixStatus =
  | "clean"
  | "dry_run"
  | "applied"
  | "rejected"
  | "conflict";

export interface FixReport {
  readonly status: FixStatus;
  readonly ok: boolean;
  readonly files: readonly FixFile[];
  /** The underlying edit report; `null` when there was nothing to edit. */
  readonly edit: EditReport | null;
}

export interface FixOptions {
  /** Write the changes. Without it, `fix` previews and leaves files as they are. */
  readonly apply?: boolean;
}
