/**
 * Static asset discovery, validation, and manifest helpers.
 *
 * Port of `src/wiki/assets.py`. Assets are the one part of a wiki that is
 * *copied* rather than rendered, so the questions this module answers are all
 * about what will and will not make it to the site:
 *
 * - which files a build copies ({@link iterAssetFiles}),
 * - which configured asset directories and symlinks it cannot copy
 *   ({@link auditAssets}),
 * - what URL each asset gets ({@link buildAssetManifest}), and
 * - whether a link that looks like an asset actually resolves to one
 *   ({@link assetReferenceIssue}) — the answer the link audit needs.
 *
 * Two Python details are load-bearing:
 *
 * - **Symlinks are skipped, not followed.** `iter_asset_files` drops a symlink
 *   and a symlinked directory, and `audit_assets` reports both, because
 *   following them can escape the config root or duplicate a tree.
 * - **Asset URLs are quoted with the wiki's own safe set** (`/()_-.$~`), the
 *   same one `paths.page_url` uses. `encodeURIComponent` would publish a
 *   different URL for a filename with parentheses, which is exactly the kind of
 *   filename an asset tends to have.
 *
 * `_PACKAGED_ASSET_FILENAMES` is an empty frozen set in the Python source, so
 * the branch that walks it never runs; the port omits it and the
 * `write_packaged_asset` raiser with it, rather than keeping unreachable code
 * that claims to do something.
 */

import {
  isDirectory,
  isFile,
  isSymlink,
  pathExists,
  relativeWithin,
  sortedTreePaths,
} from "./fspath.ts";
import { join, resolve } from "@std/path";
import type { Config } from "./config.ts";

import {
  isExternalLink,
  normalizePosixPath,
  posixDirname,
  pyUnquote,
  splitTarget,
} from "./links.ts";
import type { OutputEntry } from "./schemas/domain.ts";
import { quote } from "./urlquote.ts";

/** Every asset file a build would copy, in measured path-component order. */
export function iterAssetFiles(config: Config): string[] {
  const assets: string[] = [];
  for (const assetDir of config.wiki.assets) {
    if (!pathExists(assetDir) || isSymlink(assetDir)) continue;
    for (const path of sortedTreePaths(assetDir)) {
      if (config.isExcluded(path)) continue;
      if (isDirectory(path) || isSymlink(path)) continue;
      assets.push(path);
    }
  }
  return assets;
}

/**
 * Report the asset directories a build cannot copy from.
 *
 * This is a warning list rather than a single error because a wiki can have
 * several asset directories and one bad one should not hide the other three.
 */
export function auditAssets(config: Config): string[] {
  const warnings: string[] = [];
  for (const assetDir of config.wiki.assets) {
    if (config.isExcluded(assetDir)) continue;
    const usable = pathExists(assetDir) && isDirectory(assetDir) &&
      !isSymlink(assetDir);
    if (!pathExists(assetDir)) {
      warnings.push(`Asset directory does not exist: ${assetDir}`);
    } else if (isSymlink(assetDir)) {
      warnings.push(
        `Asset directory is a symlink and will not be copied: ${assetDir}`,
      );
    } else if (!isDirectory(assetDir)) {
      warnings.push(`Asset directory is not a directory: ${assetDir}`);
    }
    if (!usable) continue;
    for (const path of sortedTreePaths(assetDir)) {
      if (isSymlink(path) && !config.isExcluded(path)) {
        warnings.push(`Asset symlink will not be copied: ${path}`);
      }
    }
  }
  return warnings;
}

/**
 * The output entries for every asset, as a build writes them.
 *
 * The public URL is the asset's path relative to the config root, quoted with
 * the wiki's safe set and prefixed with the site's base URL — the same shape
 * `build_page_manifest` gives pages, so collision detection can compare them.
 */
export function buildAssetManifest(
  config: Config,
  ownedOutputDir: string,
  baseUrl: string,
): OutputEntry[] {
  const entries: OutputEntry[] = [];
  const base = baseUrl.replace(/\/+$/, "");
  for (const asset of iterAssetFiles(config)) {
    const rel = config.relativeToRoot(asset);
    const relParts = rel.split("/").filter((part) => part !== "");
    const outputPath = join(ownedOutputDir, ...relParts);
    const encoded = quote(rel, "/()_-.$~");
    const publicUrl = base === "" ? `/${encoded}` : `${base}/${encoded}`;
    entries.push({
      source: asset,
      output_path: outputPath,
      public_url: publicUrl,
      kind: "asset",
    });
  }
  return entries;
}

/**
 * The asset a markdown link points at, or `null` when it points at none.
 *
 * `null` is doing two jobs — "not inside an asset directory" and "escaped the
 * config root" — because the caller reports the same thing either way. A link
 * that climbs out with `../` is refused *before* resolution, so a wiki cannot
 * link into a neighbour's assets.
 */
export function resolveAssetPath(
  config: Config,
  currentFile: string,
  target: string,
): string | null {
  if (isExternalLink(target)) return null;
  const [pagePartRaw] = splitTarget(target);
  const pagePart = pyUnquote(pagePartRaw.split("?")[0] as string)
    .replaceAll("\\", "/")
    .trim();
  if (pagePart === "" || pagePart.startsWith("/")) return null;

  let currentRel: string;
  try {
    currentRel =
      (relativeWithin(resolve(currentFile), resolve(config.config_root)))
        .replaceAll("\\", "/");
  } catch {
    currentRel = currentFile.replaceAll("\\", "/");
  }
  const combined = normalizePosixPath(
    posixDirname(currentRel) === ""
      ? pagePart
      : `${posixDirname(currentRel)}/${pagePart}`,
  );
  if (combined.startsWith("../") || combined === "..") return null;

  const candidate = resolve(join(config.config_root, ...combined.split("/")));
  for (const assetDir of config.wiki.assets) {
    try {
      relativeWithin(candidate, resolve(assetDir));
      return candidate;
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Why a link to an asset is broken, or `null` when it is fine.
 *
 * The distinctions are the ones a user can act on: "outside configured assets"
 * means the asset directories are not configured for that path, "excluded"
 * means `wiki.exclude` covers it, and each has a different fix.
 */
export function assetReferenceIssue(
  config: Config,
  currentFile: string,
  target: string,
): string | null {
  const assetPath = resolveAssetPath(config, currentFile, target);
  if (assetPath === null) return `points outside configured assets: ${target}`;
  if (config.isExcluded(assetPath)) {
    return `points to excluded asset: ${target}`;
  }
  if (isSymlink(assetPath)) {
    return `points to symlink asset, which will not be copied: ${target}`;
  }
  if (!pathExists(assetPath) || !isFile(assetPath)) {
    return `points to missing asset: ${target}`;
  }
  return null;
}
