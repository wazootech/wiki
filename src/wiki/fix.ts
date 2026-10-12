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

import { isMap, isScalar, parseDocument } from "yaml";
import { extname } from "@std/path";
import type { Config } from "./config.ts";
import {
  deriveMetadataAll,
  type RedundantField,
  redundantFields,
} from "./derived.ts";
import { splitFrontmatterText } from "./document.ts";
import { applyEdit, contentHash, type EditReport } from "./edit.ts";
import { documentDataFromPath } from "./parser.ts";
import { iterMarkdownFiles, routeForDocumentFile } from "./paths.ts";

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

/**
 * Remove top-level frontmatter entries from a page's text, byte for byte.
 *
 * Each entry's lines are cut from the start of its key's line through the end
 * of its value's line, including that line's own terminator and any trailing
 * `# comment` on it. Nothing else changes; an entry that cannot be cut that
 * way is reported in `skipped` and left alone.
 */
export function removeFrontmatterKeys(
  content: string,
  keys: readonly string[],
): KeyRemoval {
  const skipAll = (reason: string): KeyRemoval => ({
    content,
    removed: [],
    skipped: keys.map((key) => ({ key, reason })),
  });
  const bom = content.startsWith("﻿") ? 1 : 0;
  const split = splitFrontmatterText(content.slice(bom));
  if (split.prefix === "") return skipAll("the page has no frontmatter");
  // The prefix is `---<yaml>---`: offsets below are into `<yaml>`, which
  // starts three characters after the BOM.
  const yaml = split.prefix.slice(3, -3);
  const offset = bom + 3;
  const doc = parseDocument(yaml);
  if (doc.errors.length > 0) return skipAll("the frontmatter does not parse");
  if (!isMap(doc.contents) || doc.contents.flow) {
    return skipAll("the frontmatter is not a block mapping");
  }
  const pairs = doc.contents.items;

  const cuts: Array<{ key: string; start: number; end: number }> = [];
  const skipped: SkippedKey[] = [];
  for (const key of keys) {
    const matches = pairs.filter((pair) =>
      isScalar(pair.key) && pair.key.value === key
    );
    if (matches.length !== 1) {
      skipped.push({
        key,
        reason: matches.length === 0
          ? "no top-level entry has that key"
          : "the key is written more than once",
      });
      continue;
    }
    const pair = matches[0]!;
    const keyNode = pair.key as { range?: [number, number, number] };
    const value = pair.value as
      | { range?: [number, number, number]; anchor?: string }
      | null;
    if (!keyNode.range || !value?.range) {
      skipped.push({ key, reason: "the entry has no value" });
      continue;
    }
    if (value.anchor) {
      skipped.push({
        key,
        reason: `the value carries anchor &${value.anchor}`,
      });
      continue;
    }
    const lineStart = yaml.lastIndexOf("\n", keyNode.range[0] - 1) + 1;
    if (yaml.slice(lineStart, keyNode.range[0]).trim() !== "") {
      skipped.push({ key, reason: "the key does not start its line" });
      continue;
    }
    let end = value.range[1];
    if (yaml[end - 1] !== "\n") {
      // A plain or quoted scalar stops before its line ends: keep going
      // through a trailing comment and the line terminator, and refuse when
      // anything else follows on that line.
      const newline = yaml.indexOf("\n", end);
      const tail = yaml.slice(end, newline < 0 ? yaml.length : newline);
      const rest = tail.trim();
      if (rest !== "" && !rest.startsWith("#")) {
        skipped.push({ key, reason: "another value shares its line" });
        continue;
      }
      end = newline < 0 ? yaml.length : newline + 1;
    }
    cuts.push({ key, start: lineStart, end });
  }

  cuts.sort((left, right) => right.start - left.start);
  let next = yaml;
  for (const cut of cuts) next = next.slice(0, cut.start) + next.slice(cut.end);
  return {
    content: content.slice(0, offset) + next +
      content.slice(offset + yaml.length),
    removed: keys.filter((key) => cuts.some((cut) => cut.key === key)),
    skipped,
  };
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
