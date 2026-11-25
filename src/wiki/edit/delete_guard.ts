import type { CheckIssue } from "../check_report.ts";
import type { Config } from "../config.ts";
import { withOverlay } from "../fspath.ts";
import { pruneLinksTo } from "../link_fix.ts";
import { iterDocumentFiles } from "../paths.ts";
import { LinkIndex } from "../wiki_links.ts";
import {
  type FilePlan,
  isMarkdown,
  overlayOf,
  relativePath,
  safeRoute,
} from "./plan_support.ts";

/**
 * The pages (route, path) whose body links to `route` in the staged tree, not
 * counting the page itself.
 */
export function backlinkers(
  config: Config,
  plans: ReadonlyMap<string, FilePlan>,
  route: string,
): Array<readonly [string, string]> {
  return withOverlay(overlayOf(plans), () => {
    const sources = new Set(
      LinkIndex.fromConfig(config).backlinksTo(route).filter((source) =>
        source !== route
      ),
    );
    const found: Array<readonly [string, string]> = [];
    for (const path of iterDocumentFiles(config)) {
      const source = safeRoute(config, path);
      if (source !== null && sources.has(source)) found.push([source, path]);
    }
    return found;
  });
}

/**
 * The dangling links a delete would leave, as `dangling_links` errors (one per
 * linking page), or none when `prune` rewrites those links to plain text.
 */
export function guardDelete(
  config: Config,
  plans: Map<string, FilePlan>,
  planFor: (path: string) => FilePlan,
  plan: FilePlan,
  prune: boolean,
): CheckIssue[] {
  const route = safeRoute(config, plan.path);
  if (route === null) return [];
  const linkers = backlinkers(config, plans, route).filter(([, path]) =>
    isMarkdown(path)
  );
  if (prune) {
    for (const [source, path] of linkers) {
      const linker = planFor(path);
      if (linker.after === null) continue;
      linker.after = pruneLinksTo(linker.after, source, new Set([route]));
    }
    return [];
  }
  return linkers.map(([source, path]) => ({
    code: "dangling_links",
    severity: "error",
    message: `${source} links to ${route}, which this edit deletes; remove ` +
      `the links first, or prune them (pruneLinks, wiki rm --prune-links).`,
    path: relativePath(config, path),
    route: source,
  }));
}
