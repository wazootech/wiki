/**
 * Per-page HTML layout frontmatter helpers.
 *
 * Port of `src/wiki/layout.py`, which is itself a thin re-export of the two
 * predicates in `site/layout_template.py` plus the frontmatter parsing the
 * audit and the renderer both need.
 *
 * The port keeps the same three-part contract, because each part is used at a
 * different time and they must agree:
 *
 * - {@link resolveLayoutPath} turns the frontmatter value into an absolute path
 *   relative to the config root (`layouts/page.html` → `<root>/layouts/page.html`).
 * - {@link layoutFileIsValid} decides whether that path is usable — inside the
 *   root, a file, and `.html` — which is what `check.missing_layout_file`
 *   reports on.
 * - {@link layoutStem} derives the CSS-safe class name the renderer emits
 *   (`page.html` → `page`), so a page's body can be styled per layout.
 *
 * `resolveLayoutPath` is the same computation as the frontmatter schema's
 * local-path resolution, and `layoutFileIsValid` the same predicate as its
 * `.json` check; Python repeats both in three modules. The port keeps one copy
 * of each in `paths.ts` and uses it from all three, so a change to the
 * "inside the config root" rule cannot land in one call site and miss another.
 */

import { basename, extname } from "@std/path";
import { isFile } from "./fspath.ts";
import { pathWithinRoot, resolveConfigRelativePath } from "./paths.ts";

/** The frontmatter key naming a per-page layout file. */
export const LAYOUT_FRONTMATTER_KEY = "wazoo:layout";

/** The only layout file extension the renderer accepts. */
export const LAYOUT_SUFFIX = ".html";

/** Derive a CSS-safe layout slug from a layout file path. */
export function layoutStem(path: string): string {
  const name = basename(path);
  if (name.toLowerCase().endsWith(LAYOUT_SUFFIX)) {
    return name.slice(0, -LAYOUT_SUFFIX.length);
  }
  return basename(path, extname(path));
}

/** `true` when `path` is a readable `.html` page layout under `configRoot`. */
export function layoutFileIsValid(path: string, configRoot: string): boolean {
  if (!pathWithinRoot(path, configRoot)) return false;
  return isFile(path) && basename(path).toLowerCase().endsWith(LAYOUT_SUFFIX);
}

/** Resolve a `wazoo:layout` path relative to the wiki config root. */
export function resolveLayoutPath(raw: string, configRoot: string): string {
  return resolveConfigRelativePath(raw, configRoot);
}

/**
 * Read a layout out of frontmatter, with the CSS stem to go with it.
 *
 * An absent, non-string, or blank value means "no layout file": the renderer
 * falls back to its packaged minimal layout and the class stays `default`,
 * rather than reporting an issue for a key the author did not set.
 */
export function parseLayoutFromFrontmatter(
  frontmatter: Record<string, unknown>,
  configRoot: string,
): [string | null, string] {
  const raw = frontmatter[LAYOUT_FRONTMATTER_KEY];
  if (typeof raw !== "string" || raw.trim() === "") return [null, "default"];
  const path = resolveLayoutPath(raw, configRoot);
  return [path, layoutStem(path)];
}
