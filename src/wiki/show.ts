/**
 * Read verbs for the write interface: `wiki show` and `wiki refs`.
 *
 * An agent about to edit a page needs three things before it writes: what the
 * page says (frontmatter, its graph view, its outline), what links to it, and
 * the content hash it must pass back as `expect` (wiki#355). Reading the raw
 * file gives the first only after the agent re-derives the YAML↔RDF mapping
 * and heading structure the engine already computes; these reports hand over
 * the engine's own view instead.
 *
 * Reads are not writes, so the containment here is looser than `edit.ts`'s:
 * any wiki document resolves, including pages from installed sources under
 * `.wiki/`, which an agent may read and link to but never edit.
 */

import { extname, resolve } from "@std/path";
import type { Config } from "./config.ts";
import { splitFrontmatterText } from "./document.ts";
import { contentHash, EditUsageError } from "./edit.ts";
import { documentJsonLd } from "./export.ts";
import { overlayKey, readText } from "./fspath.ts";
import { parseHeadings } from "./headings.ts";
import { type DataRecord, documentDataFromPath } from "./parser.ts";
import { iterDocumentFiles, routeForDocumentFile } from "./paths.ts";
import { LinkIndex, outboundPageRoutes } from "./wiki_links.ts";

/** Version of the `show`/`refs` JSON contract; bumped on a breaking change. */
export const SHOW_REPORT_VERSION = 1;

/** One heading in a page's outline. */
export interface ShowHeading {
  readonly level: number;
  readonly text: string;
  /** The anchor id a `#fragment` link uses. */
  readonly slug: string;
  /** 1-based line in the file, counting the frontmatter. */
  readonly line: number;
}

/** A page at the other end of a link. */
export interface PageRef {
  readonly route: string;
  /** Path relative to the config root, or `null` when no document has the route. */
  readonly path: string | null;
}

/** `wiki show`: one page as the engine sees it. */
export interface ShowReport {
  readonly version: typeof SHOW_REPORT_VERSION;
  /** Path relative to the config root, `/`-separated. */
  readonly path: string;
  readonly route: string;
  /** SHA-256 of the file's raw bytes: pass it as an edit op's `expect`. */
  readonly hash: string;
  /** Parsed frontmatter (or data-document body), or `null` when there is none. */
  readonly frontmatter: DataRecord | null;
  /** The frontmatter as compacted JSON-LD, as `wiki export -f json-ld -m compacted` writes it. */
  readonly jsonld: unknown;
  readonly headings: readonly ShowHeading[];
  /** Pages this one links to, in first-link order. */
  readonly links: readonly PageRef[];
}

/** `wiki refs`: a page's place in the link graph. */
export interface RefsReport {
  readonly version: typeof SHOW_REPORT_VERSION;
  readonly path: string;
  readonly route: string;
  /** Pages that link here, in document order. */
  readonly inbound: readonly PageRef[];
  /** Pages this one links to, in first-link order. */
  readonly outbound: readonly PageRef[];
}

/**
 * Resolve a caller's path to a wiki document, the way `wiki edit` resolves it:
 * relative to the config root, not the working directory, so a path read from
 * `show` can be pasted into an edit unchanged.
 */
export function resolveDocumentPath(config: Config, raw: string): string {
  const path = resolve(config.config_root, raw);
  const key = overlayKey(path);
  const document = iterDocumentFiles(config).find((candidate) =>
    overlayKey(candidate) === key
  );
  if (document === undefined) {
    throw new EditUsageError(`${raw}: not a wiki document.`);
  }
  return document;
}

/** Describe one page: frontmatter, graph view, outline, links, and hash. */
export async function showDocument(
  config: Config,
  raw: string,
): Promise<ShowReport> {
  const path = resolveDocumentPath(config, raw);
  const route = routeForDocumentFile(config, path);
  const frontmatter = documentDataFromPath(
    path,
    config.graph.content_predicate ?? undefined,
  );
  const jsonld = frontmatter === null
    ? null
    : await documentJsonLd(config, path, frontmatter);

  let headings: ShowHeading[] = [];
  let links: PageRef[] = [];
  if (extname(path).toLowerCase() === ".md") {
    const content = readText(path);
    const split = splitFrontmatterText(content);
    // Headings are parsed on the body (a frontmatter `---` would otherwise read
    // as a setext underline); shift their lines back to file lines.
    const offset = split.prefix.split("\n").length - 1;
    headings = parseHeadings(split.body).map((heading) => ({
      level: heading.level,
      text: heading.text,
      slug: heading.slug,
      line: heading.line_no === 0 ? 0 : heading.line_no + offset,
    }));
    links = pageRefs(config, outboundPageRoutes(route, content));
  }

  return {
    version: SHOW_REPORT_VERSION,
    path: relativePath(config, path),
    route,
    hash: contentHash(Deno.readFileSync(path)),
    frontmatter,
    jsonld,
    headings,
    links,
  };
}

/** List the pages linking to and from one page. */
export function documentRefs(config: Config, raw: string): RefsReport {
  const path = resolveDocumentPath(config, raw);
  const route = routeForDocumentFile(config, path);
  const index = LinkIndex.fromConfig(config);
  const outbound = extname(path).toLowerCase() === ".md"
    ? outboundPageRoutes(route, readText(path))
    : [];
  return {
    version: SHOW_REPORT_VERSION,
    path: relativePath(config, path),
    route,
    inbound: pageRefs(config, index.backlinksTo(route)),
    outbound: pageRefs(config, outbound),
  };
}

function relativePath(config: Config, path: string): string {
  return config.relativeToRoot(path).replaceAll("\\", "/");
}

/** Pair routes with the documents that serve them. */
function pageRefs(config: Config, routes: readonly string[]): PageRef[] {
  if (routes.length === 0) return [];
  const pathByRoute = new Map<string, string>();
  for (const filePath of iterDocumentFiles(config)) {
    const route = routeForDocumentFile(config, filePath);
    if (!pathByRoute.has(route)) {
      pathByRoute.set(route, relativePath(config, filePath));
    }
  }
  return routes.map((route) => ({
    route,
    path: pathByRoute.get(route) ?? null,
  }));
}
