import { BuildError } from "../../errors.ts";
import { dirname, join, resolve } from "@std/path";
import { isFile, relativeWithin } from "../../fspath.ts";
import type { Wiki } from "../../wiki.ts";

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

export function validateOutputDir(pageOutputDir: string, wiki: Wiki): void {
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

export function outputSubdirectory(outputDir: string, baseUrl: string): string {
  const relative = baseUrl.replace(/^\/+|\/+$/g, "");
  const parts = relative.split("/").filter((part) => part !== "");
  if (parts.some((part) => part === "." || part === "..")) {
    throw new BuildError(`invalid site.base_url path: ${baseUrl}`);
  }
  return parts.length === 0 ? outputDir : join(outputDir, ...parts);
}

export function relativeOutputPath(path: string, outputDir: string): string {
  return relativeWithin(resolve(path), resolve(outputDir));
}
