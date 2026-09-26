import { BuildError } from "../errors.ts";
import { dirname, join, resolve } from "@std/path";
import { isFile, pathExists, relativeWithin } from "../fspath.ts";
import type { Wiki } from "../wiki.ts";

import { buildAssetManifest, iterAssetFiles } from "../assets.ts";
import {
  buildPageManifest,
  detectOutputCollisions,
  pageOutputPath,
} from "../paths.ts";
import {
  AuditReport,
  type BuildOptions,
  type BuildResult,
} from "../schemas/reports.ts";
import { buildIndexHtml, buildPageHtml } from "./html.ts";
import { buildSite } from "./build.ts";

function pathIsSameOrAncestor(ancestor: string, descendant: string): boolean {
  const root = resolve(ancestor);
  const candidate = resolve(descendant);
  if (root === candidate) return true;
  try {
    relativeWithin(candidate, root);
    return true;
  } catch {
    return false;
  }
}

function validateOutputDir(pageOutputDir: string, wiki: Wiki): void {
  const protectedPaths: [string, string][] = [
    ["config root", wiki.config.config_root],
    ...wiki.config.wiki.input.map((path) =>
      ["wiki input", path] as [string, string]
    ),
    ...wiki.config.wiki.assets.map((path) =>
      ["wiki asset", path] as [string, string]
    ),
  ];
  const layout = wiki.config.site.layout;
  if (layout !== null && isFile(layout)) {
    protectedPaths.push(["page layout", dirname(layout)]);
  }
  for (const [label, path] of protectedPaths) {
    if (!pathIsSameOrAncestor(pageOutputDir, path)) continue;
    throw new BuildError(
      `refusing to clean build output path ${
        resolve(pageOutputDir)
      } because it overlaps ${label} at ${
        resolve(path)
      }. Choose a separate output directory such as _site.`,
    );
  }
}

function outputSubdirectory(outputDir: string, baseUrl: string): string {
  const relative = baseUrl.replace(/^\/+|\/+$/g, "");
  const parts = relative.split("/").filter((part) => part !== "");
  if (parts.some((part) => part === "." || part === "..")) {
    throw new BuildError(`invalid site.base_url path: ${baseUrl}`);
  }
  return parts.length === 0 ? outputDir : join(outputDir, ...parts);
}

function relativeOutputPath(path: string, outputDir: string): string {
  return relativeWithin(resolve(path), resolve(outputDir));
}

export async function buildStaticSite(
  wiki: Wiki,
  options: BuildOptions,
): Promise<BuildResult> {
  const config = wiki.config;
  if (options.render_first) {
    const renderOptions = {
      ...(options.reload_graph ? { reload: true } : {}),
      ...(options.disk_cache ? { cache: true } : {}),
    };
    await wiki.render(null, renderOptions);
  }

  if (!config.wiki.input.some((path) => pathExists(path))) {
    const directories = config.wiki.input.join(", ");
    return {
      ok: false,
      page_count: 0,
      asset_count: 0,
      written_paths: [],
      error_message: `none of the input directories exist (${directories})`,
    };
  }

  if (!options.skip_preflight) {
    const preflight = await wiki.preflight();
    if (preflight.errors.length > 0 || !preflight.ok) {
      return {
        ok: false,
        page_count: 0,
        asset_count: 0,
        written_paths: [],
        preflight,
      };
    }
  }

  const baseUrl = options.base_url ?? config.site.base_url;
  const urlStyle = options.url_style ?? config.site.url_style;
  const site = buildSite(config, baseUrl, urlStyle);
  const outputDir = resolve(options.output_dir);
  const pageOutputDir = resolve(outputSubdirectory(outputDir, baseUrl));
  const manifest = [
    ...buildPageManifest(config, pageOutputDir, baseUrl, urlStyle),
    ...buildAssetManifest(config, pageOutputDir, baseUrl),
  ];
  const collisions = detectOutputCollisions(manifest);
  if (collisions.length > 0) {
    return {
      ok: false,
      page_count: 0,
      asset_count: 0,
      written_paths: [],
      preflight: new AuditReport({
        ok: false,
        errors: collisions.map((message) => ({
          code: "output_collision",
          message,
          severity: "error" as const,
        })),
      }),
    };
  }

  validateOutputDir(pageOutputDir, wiki);
  if (pathExists(pageOutputDir)) {
    Deno.removeSync(pageOutputDir, { recursive: true });
  }
  Deno.mkdirSync(pageOutputDir, { recursive: true });

  const defaultLayout =
    config.site.layout !== null && isFile(config.site.layout)
      ? config.site.layout
      : null;
  const writtenPaths: string[] = [];
  if (!site.pages.some((page) => page.file_slug === "")) {
    const indexPath = join(pageOutputDir, "index.html");
    Deno.writeTextFileSync(
      indexPath,
      buildIndexHtml(site, baseUrl, urlStyle, defaultLayout),
    );
    writtenPaths.push(relativeOutputPath(indexPath, outputDir));
  }

  for (const page of site.pages) {
    const outputPath = pageOutputPath(pageOutputDir, page.file_slug, urlStyle);
    Deno.mkdirSync(dirname(outputPath), { recursive: true });
    Deno.writeTextFileSync(
      outputPath,
      buildPageHtml(page, baseUrl, defaultLayout),
    );
    writtenPaths.push(relativeOutputPath(outputPath, outputDir));
  }

  const assetEntries = buildAssetManifest(config, pageOutputDir, baseUrl);
  for (const entry of assetEntries) {
    Deno.mkdirSync(dirname(entry.output_path), { recursive: true });
    if (entry.source !== null) {
      Deno.copyFileSync(entry.source, entry.output_path);
    }
    writtenPaths.push(relativeOutputPath(entry.output_path, outputDir));
  }

  return {
    ok: true,
    page_count: site.pages.length,
    asset_count: iterAssetFiles(config).length,
    written_paths: writtenPaths,
  };
}
