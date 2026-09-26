import type { Wiki } from "../wiki.ts";
import { BuildError } from "../errors.ts";
import type { Path } from "../fspath.ts";
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

function pathIsSameOrAncestor(ancestor: Path, descendant: Path): boolean {
  const root = ancestor.resolve();
  const candidate = descendant.resolve();
  if (root.toString() === candidate.toString()) return true;
  try {
    candidate.relativeTo(root);
    return true;
  } catch {
    return false;
  }
}

function validateOutputDir(pageOutputDir: Path, wiki: Wiki): void {
  const protectedPaths: [string, Path][] = [
    ["config root", wiki.config.config_root],
    ...wiki.config.wiki.input.map((path) =>
      ["wiki input", path] as [string, Path]
    ),
    ...wiki.config.wiki.assets.map((path) =>
      ["wiki asset", path] as [string, Path]
    ),
  ];
  const layout = wiki.config.site.layout;
  if (layout !== null && layout.isFile()) {
    protectedPaths.push(["page layout", layout.parent]);
  }
  for (const [label, path] of protectedPaths) {
    if (!pathIsSameOrAncestor(pageOutputDir, path)) continue;
    throw new BuildError(
      `refusing to clean build output path ${pageOutputDir.resolve()} because it overlaps ${label} at ${path.resolve()}. Choose a separate output directory such as _site.`,
    );
  }
}

function outputSubdirectory(outputDir: Path, baseUrl: string): Path {
  const relative = baseUrl.replace(/^\/+|\/+$/g, "");
  const parts = relative.split("/").filter((part) => part !== "");
  if (parts.some((part) => part === "." || part === "..")) {
    throw new BuildError(`invalid site.base_url path: ${baseUrl}`);
  }
  return parts.length === 0 ? outputDir : outputDir.joinpath(...parts);
}

function relativeOutputPath(path: Path, outputDir: Path): Path {
  return path.resolve().relativeTo(outputDir.resolve());
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

  if (!config.wiki.input.some((path) => path.exists())) {
    const directories = config.wiki.input.map(String).join(", ");
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
  const outputDir = options.output_dir.resolve();
  const pageOutputDir = outputSubdirectory(outputDir, baseUrl).resolve();
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
  if (pageOutputDir.exists()) {
    Deno.removeSync(pageOutputDir.toString(), { recursive: true });
  }
  Deno.mkdirSync(pageOutputDir.toString(), { recursive: true });

  const defaultLayout = config.site.layout?.isFile()
    ? config.site.layout
    : null;
  const writtenPaths: Path[] = [];
  if (!site.pages.some((page) => page.file_slug === "")) {
    const indexPath = pageOutputDir.joinpath("index.html");
    Deno.writeTextFileSync(
      indexPath.toString(),
      buildIndexHtml(site, baseUrl, urlStyle, defaultLayout),
    );
    writtenPaths.push(relativeOutputPath(indexPath, outputDir));
  }

  for (const page of site.pages) {
    const outputPath = pageOutputPath(pageOutputDir, page.file_slug, urlStyle);
    Deno.mkdirSync(outputPath.parent.toString(), { recursive: true });
    Deno.writeTextFileSync(
      outputPath.toString(),
      buildPageHtml(page, baseUrl, defaultLayout),
    );
    writtenPaths.push(relativeOutputPath(outputPath, outputDir));
  }

  const assetEntries = buildAssetManifest(config, pageOutputDir, baseUrl);
  for (const entry of assetEntries) {
    Deno.mkdirSync(entry.output_path.parent.toString(), { recursive: true });
    if (entry.source !== null) {
      Deno.copyFileSync(entry.source.toString(), entry.output_path.toString());
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
