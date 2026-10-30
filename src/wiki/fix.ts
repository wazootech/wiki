/**
 * Redundant derived frontmatter: find it, and remove it without disturbing
 * anything else (wiki#319).
 *
 * The graph derives `schema:headline` and the Git dates (see `derived.ts`), so
 * a frontmatter value that repeats the derived one exactly says nothing the
 * graph would not say anyway. `lint.redundant_frontmatter` reports those
 * entries and `wiki fix` removes them. A value that *differs* is an intentional
 * override and is never reported or touched.
 *
 * Removal edits text, not a YAML model: the `yaml` CST locates each entry, and
 * only the lines it occupies are cut. Every other byte (other keys, comments,
 * key order, quoting, line endings, the body) is kept as it was, which a
 * serializer round trip cannot promise. An entry that cannot be cut cleanly is
 * skipped and said so: one in a flow mapping (`{headline: X}`), one that
 * shares its line with another key, one carrying an anchor something else may
 * alias, or a key written more than once.
 *
 * Writing goes through `applyEdit` as a `replace` op guarded by the file's
 * content hash, so it is validated like any other edit (a JSON Schema that
 * requires the key rejects the fix) and written atomically.
 */

import type { Config } from "./config.ts";
import { applyEdit, contentHash } from "./edit.ts";
import {
  findRedundantFrontmatter,
  type FixFile,
  type FixOptions,
  type FixReport,
} from "./fix/types.ts";
import { removeFrontmatterKeys } from "./fix/remove.ts";

export {
  findRedundantFrontmatter,
  type FixFile,
  type FixOptions,
  type FixReport,
  type FixStatus,
  type KeyRemoval,
  type RedundantDocument,
  type SkippedKey,
} from "./fix/types.ts";
export { removeFrontmatterKeys } from "./fix/remove.ts";

/**
 * Remove redundant derived frontmatter from `paths` (or the whole wiki).
 *
 * Preview is the default and leaves every file byte-identical; `apply` writes
 * through `applyEdit`, all files or none.
 */
export async function fixRedundantFrontmatter(
  config: Config,
  paths: readonly string[] | null = null,
  options: FixOptions = {},
): Promise<FixReport> {
  const documents = await findRedundantFrontmatter(config, paths);
  const files: FixFile[] = [];
  const ops: Array<
    { op: "replace"; path: string; content: string; expect: string }
  > = [];
  for (const document of documents) {
    const raw = Deno.readFileSync(document.path);
    const before = new TextDecoder().decode(raw);
    const keys = [...new Set(document.fields.map((field) => field.key))];
    const removal = removeFrontmatterKeys(before, keys);
    const path = config.relativeToRoot(document.path).replaceAll("\\", "/");
    files.push({
      path,
      route: document.route,
      removed: document.fields.filter((field) =>
        removal.removed.includes(field.key)
      ),
      skipped: removal.skipped,
    });
    if (removal.removed.length > 0) {
      ops.push({
        op: "replace",
        path,
        content: removal.content,
        expect: contentHash(raw),
      });
    }
  }
  if (ops.length === 0) {
    return { status: "clean", ok: true, files, edit: null };
  }
  const edit = await applyEdit(config, { ops }, {
    apply: options.apply ?? false,
  });
  return { status: edit.status, ok: edit.ok, files, edit };
}
