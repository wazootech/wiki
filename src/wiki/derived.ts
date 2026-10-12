/**
 * Document metadata derived from the Markdown body and Git history (#318).
 *
 * Three values are derived per page, as the schema.org properties wikis
 * already use for them:
 *
 * | Property            | Derived from                                        |
 * | ------------------- | --------------------------------------------------- |
 * | `schema:headline`   | the first ATX `# H1` outside fenced code            |
 * | `schema:dateCreated`  | the oldest commit reaching the file (`--follow`)  |
 * | `schema:dateModified` | the newest commit reaching the file               |
 *
 * Dates are the Git **committer** time in UTC, RFC 3339, whole seconds
 * (`2026-10-11T23:27:18Z`). Only the history the checkout holds is consulted:
 * nothing is fetched, so a shallow clone reports the commits it has. A file
 * with no reachable commit (untracked, a new repository, no Git) falls back to
 * its modification time for both dates. Uncommitted edits do not move
 * `dateModified` while the file has history.
 *
 * Derivation never touches the source file: an explicit frontmatter value for
 * the same property always wins, and `wiki fix` is the only writer.
 */

import { basename, dirname, resolve } from "@std/path";
import { isMap, isScalar, parseDocument } from "yaml";
import { parseHeadings } from "./headings.ts";
import { splitFrontmatterText } from "./document.ts";

/** The properties derivation can fill, keyed by their frontmatter spelling. */
export const DERIVED_FIELDS = [
  { key: "headline", property: "headline" },
  { key: "dateCreated", property: "dateCreated" },
  { key: "dateModified", property: "dateModified" },
] as const;

export type DerivedKey = typeof DERIVED_FIELDS[number]["key"];

/** The values derivation found; a key is absent when nothing was derivable. */
export type DerivedMetadata = Partial<Record<DerivedKey, string>>;

/** The default `schema:` namespace, used when a context does not bind one. */
export const SCHEMA_NAMESPACE = "https://schema.org/";

/** The first level-1 heading of a markdown body, or `null`. */
export function firstH1(body: string): string | null {
  for (const heading of parseHeadings(body)) {
    if (heading.level === 1) {
      const text = heading.text.trim();
      return text === "" ? null : text;
    }
  }
  return null;
}

const gitRootCache = new Map<string, string | null>();

/** The nearest ancestor holding a `.git` entry, or `null`. Cached per directory. */
function findGitRoot(directory: string): string | null {
  const cached = gitRootCache.get(directory);
  if (cached !== undefined) return cached;
  let found: string | null = null;
  try {
    Deno.statSync(resolve(directory, ".git"));
    found = directory;
  } catch {
    const parent = dirname(directory);
    if (parent !== directory) found = findGitRoot(parent);
  }
  gitRootCache.set(directory, found);
  return found;
}

/** An RFC 3339 instant as UTC with whole seconds, or `null` if unparseable. */
export function toUtcSeconds(value: string | Date): string | null {
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * Oldest and newest committer time reaching `filePath`, following renames, or
 * `null` when Git is absent or the file has no commit.
 */
export function gitFileDates(
  filePath: string,
): { created: string; updated: string } | null {
  const absolute = resolve(filePath);
  const directory = dirname(absolute);
  if (findGitRoot(directory) === null) return null;
  let stdout: string;
  try {
    const result = new Deno.Command("git", {
      args: ["log", "--follow", "--format=%cI", "--", basename(absolute)],
      cwd: directory,
      stdout: "piped",
      stderr: "null",
    }).outputSync();
    if (!result.success) return null;
    stdout = new TextDecoder().decode(result.stdout);
  } catch {
    return null;
  }
  const instants = stdout.split(/\r?\n/).map((line) => line.trim()).filter(
    (line) => line !== "",
  ).map(toUtcSeconds).filter((value): value is string => value !== null);
  if (instants.length === 0) return null;
  // `git log` lists newest first.
  return { updated: instants[0]!, created: instants[instants.length - 1]! };
}

/** Derive a page's metadata from its Markdown body and its history. */
export function deriveMetadata(
  filePath: string,
  body: string | null,
): DerivedMetadata {
  const derived: { -readonly [K in DerivedKey]?: string } = {};
  const headline = body === null ? null : firstH1(body);
  if (headline !== null) derived.headline = headline;
  let dates = gitFileDates(filePath);
  if (dates === null) {
    try {
      const mtime = Deno.statSync(filePath).mtime;
      const iso = mtime === null ? null : toUtcSeconds(mtime);
      if (iso !== null) dates = { created: iso, updated: iso };
    } catch {
      // No file, no dates.
    }
  }
  if (dates !== null) {
    derived.dateCreated = dates.created;
    derived.dateModified = dates.updated;
  }
  return derived;
}

/** The body of a markdown document, or `null` when it cannot be split. */
export function markdownBody(content: string): string | null {
  try {
    return splitFrontmatterText(content).body;
  } catch {
    return null;
  }
}

/** Whether `value` repeats the derived value for `key` exactly. */
function repeats(key: DerivedKey, value: unknown, derived: string): boolean {
  if (key === "headline") {
    return typeof value === "string" && value.trim() === derived;
  }
  // A date-only value is a coarser claim than the derived instant, so it is an
  // explicit value, not a repeat.
  if (value instanceof Date) {
    if ("dateOnly" in value && (value as { dateOnly: boolean }).dateOnly) {
      return false;
    }
    return toUtcSeconds(value) === derived;
  }
  if (typeof value === "string" && value.includes("T")) {
    return toUtcSeconds(value) === derived;
  }
  return false;
}

/**
 * Frontmatter keys that resolve to a derived property.
 *
 * `resolve` maps a key to its predicate IRI (the graph's own resolution, so
 * `headline`, `schema:headline`, and a custom prefix all agree).
 */
export function keysForProperty(
  record: Record<string, unknown>,
  resolvePredicateIri: (key: string) => string | null,
  schemaNamespace: string,
): Map<DerivedKey, string[]> {
  const out = new Map<DerivedKey, string[]>();
  for (const field of DERIVED_FIELDS) {
    const iri = `${schemaNamespace}${field.property}`;
    const keys = Object.keys(record).filter((key) =>
      !key.startsWith("@") && resolvePredicateIri(key) === iri
    );
    if (keys.length > 0) out.set(field.key, keys);
  }
  return out;
}

/** One frontmatter entry that only repeats a derived value. */
export interface RedundantField {
  readonly key: string;
  readonly field: DerivedKey;
  readonly value: string;
}

/** The entries of `record` that repeat the derived value exactly. */
export function redundantFields(
  record: Record<string, unknown>,
  derived: DerivedMetadata,
  resolvePredicateIri: (key: string) => string | null,
  schemaNamespace: string,
): RedundantField[] {
  const found: RedundantField[] = [];
  for (
    const [field, keys] of keysForProperty(
      record,
      resolvePredicateIri,
      schemaNamespace,
    )
  ) {
    const derivedValue = derived[field];
    if (derivedValue === undefined) continue;
    for (const key of keys) {
      if (repeats(field, record[key], derivedValue)) {
        found.push({ key, field, value: derivedValue });
      }
    }
  }
  return found;
}

/**
 * Remove top-level frontmatter keys without re-serializing the document.
 *
 * Each removed entry's own lines go, and nothing else: other keys, comments,
 * ordering, quoting, delimiters, line endings, and the body stay byte for
 * byte. A page whose frontmatter is flow-style or does not parse is returned
 * unchanged.
 */
export function removeFrontmatterKeys(
  content: string,
  keys: ReadonlySet<string>,
): string {
  const split = splitFrontmatterText(content);
  if (split.prefix === "" || keys.size === 0) return content;
  const firstNewline = split.prefix.indexOf("\n");
  if (firstNewline === -1) return content;
  const yamlStart = firstNewline + 1;
  const yamlEnd = split.prefix.length - 3;
  if (yamlEnd < yamlStart) return content;
  const yaml = split.prefix.slice(yamlStart, yamlEnd);

  const doc = parseDocument(yaml);
  if (doc.errors.length > 0 || !isMap(doc.contents) || doc.contents.flow) {
    return content;
  }

  const ranges: Array<[number, number]> = [];
  for (const pair of doc.contents.items) {
    if (!isScalar(pair.key) || !keys.has(String(pair.key.value))) continue;
    const keyStart = pair.key.range?.[0];
    const valueNode = pair.value as { range?: [number, number, number] } | null;
    const lastOffset = valueNode?.range?.[1] ?? pair.key.range?.[1];
    if (keyStart === undefined || lastOffset === undefined) continue;
    const lineStart = yaml.lastIndexOf("\n", keyStart - 1) + 1;
    const newline = yaml.indexOf("\n", lastOffset);
    ranges.push([lineStart, newline === -1 ? yaml.length : newline + 1]);
  }
  if (ranges.length === 0) return content;

  let rewritten = "";
  let cursor = 0;
  for (const [start, end] of ranges.sort((a, b) => a[0] - b[0])) {
    rewritten += yaml.slice(cursor, start);
    cursor = end;
  }
  rewritten += yaml.slice(cursor);
  return split.prefix.slice(0, yamlStart) + rewritten +
    split.prefix.slice(yamlEnd) + split.body;
}
