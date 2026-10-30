import { dirname, join, resolve } from "@std/path";
import type { Config } from "../../config.ts";
import { relativeWithin } from "../../fspath.ts";
import type { WikiSite } from "../types.ts";

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

export function validateOutputDir(
  outputDir: string,
  config: Config,
  site: WikiSite,
  themeLayoutPaths: readonly string[],
): void {
  const protectedPaths = [
    config.config_root,
    ...config.wiki.input,
    ...config.wiki.assets,
    ...themeLayoutPaths.map((path) => dirname(path)),
    ...(config.site.layout === null ? [] : [dirname(config.site.layout)]),
    ...site.pages.flatMap((page) =>
      page.layout_path === null ? [] : [dirname(page.layout_path)]
    ),
  ];
  for (const path of protectedPaths) {
    if (pathIsSameOrAncestor(outputDir, path)) {
      throw new Error(
        `Refusing to clean output directory ${
          resolve(outputDir)
        } because it overlaps source or layout path ${resolve(path)}.`,
      );
    }
  }
}

export function outputSubdirectory(outputDir: string, baseUrl: string): string {
  const relativePath = baseUrl.replace(/^\/+|\/+$/g, "");
  const parts = relativePath.split("/").filter(Boolean);
  if (parts.some((part) => part === "." || part === "..")) {
    throw new Error(`Invalid site.base_url path: ${baseUrl}`);
  }
  return parts.length === 0 ? outputDir : join(outputDir, ...parts);
}

export function readTemplate(path: string): string {
  return Deno.readTextFileSync(path).replace(/^\uFEFF/, "");
}
