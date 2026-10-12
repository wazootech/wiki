/**
 * Frontmatter that only repeats a derived value (#318): the `lint` finding and
 * the `wiki fix` rewrite share one definition of "redundant".
 */

import type { Config } from "./config.ts";
import {
  type DerivedMetadata,
  deriveMetadata,
  markdownBody,
  type RedundantField,
  redundantFields,
  removeFrontmatterKeys,
} from "./derived.ts";
import { resolvePredicate, schemaNamespace } from "./graph.ts";
import { documentDataFromPath, readTextTolerant } from "./parser.ts";
import { iterMarkdownFiles, selectMarkdownPaths } from "./paths.ts";

/** What `wiki fix` did, or would do in preview, for one file. */
export interface FixedFile {
  readonly path: string;
  readonly removed: readonly RedundantField[];
}

export interface FixReport {
  /** `true` when files were rewritten; `false` for a preview. */
  readonly applied: boolean;
  readonly files: readonly FixedFile[];
}

/** The redundant entries of one markdown file, with the derived values read. */
export function redundantForFile(
  config: Config,
  filePath: string,
  content: string = readTextTolerant(filePath),
): RedundantField[] {
  const data = documentDataFromPath(filePath);
  if (data === null) return [];
  const derived: DerivedMetadata = deriveMetadata(
    filePath,
    markdownBody(content),
  );
  return redundantFields(
    data,
    derived,
    (key) => resolvePredicate(key, config.context)?.value ?? null,
    schemaNamespace(config.context),
  );
}

/**
 * Remove the frontmatter entries that repeat a derived value.
 *
 * Preview by default: `apply: false` reads and reports but leaves every file
 * byte-identical. A differing explicit value is never touched.
 */
export function fixRedundantFrontmatter(
  config: Config,
  files: readonly string[] | null,
  options: { readonly apply: boolean },
): FixReport {
  const paths = files !== null && files.length > 0
    ? selectMarkdownPaths(config, files)
    : iterMarkdownFiles(config);
  const fixed: FixedFile[] = [];
  for (const path of paths) {
    const content = readTextTolerant(path);
    const removed = redundantForFile(config, path, content);
    if (removed.length === 0) continue;
    const rewritten = removeFrontmatterKeys(
      content,
      new Set(removed.map((entry) => entry.key)),
    );
    if (rewritten === content) continue;
    if (options.apply) Deno.writeTextFileSync(path, rewritten);
    fixed.push({ path, removed });
  }
  return { applied: options.apply, files: fixed };
}
