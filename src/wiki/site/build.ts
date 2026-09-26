import { LinkIndex } from "../wiki_links.ts";
import type { Config } from "../config.ts";
import { isExternalLink } from "../links.ts";
import { parseLayoutFromFrontmatter } from "../layout.ts";
import { sortPaths } from "../fspath.ts";
import { splitDocumentBody } from "../parser.ts";
import { pyStr } from "../pyrepr.ts";
import { iterDocumentFiles, routeForDocumentFile } from "../paths.ts";
import {
  outlineForMarkdown,
  renderWikiMarkdown,
  stripLeadingTitle,
  titleFromMarkdown,
} from "./markdown.ts";
import type { VirtualPage, WikiSite } from "./types.ts";

function objectRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function expandKnownCurie(value: string, config: Config): string {
  if (
    !value.includes(":") || isExternalLink(value) ||
    value.toLowerCase().startsWith("urn:")
  ) {
    return value;
  }
  const separator = value.indexOf(":");
  const prefix = value.slice(0, separator);
  const local = value.slice(separator + 1);
  const namespace = config.context.namespaces.get(prefix);
  return namespace === undefined ? value : `${namespace}${local}`;
}

function pageWikiIds(
  config: Config,
  route: string,
  frontmatter: Record<string, unknown>,
): string[] {
  const values: string[] = [];
  for (const key of ["@id", "id"]) {
    const raw = frontmatter[key];
    if (typeof raw !== "string" || raw.trim() === "") continue;
    const id = raw.trim();
    values.push(id);
    const expanded = expandKnownCurie(id, config);
    if (expanded !== id) values.push(expanded);
  }
  const suffix = config.graph.include_file_extension ? ".md" : "";
  values.push(`${config.base_iri}${route}${suffix}`);
  return [...new Set(values)];
}

function chooseTitle(
  frontmatter: Record<string, unknown>,
  body: string,
  route: string,
): string {
  const candidate = frontmatter.headline || frontmatter.name;
  if (
    candidate !== undefined && candidate !== null && String(candidate) !== ""
  ) {
    return pyStr(candidate);
  }
  return titleFromMarkdown(body, route);
}

export function buildSite(
  config: Config,
  baseUrl = config.site.base_url,
  urlStyle = config.site.url_style,
): WikiSite {
  const linkIndex = LinkIndex.fromConfig(config);
  const pages: VirtualPage[] = [];
  for (const sourcePath of sortPaths(iterDocumentFiles(config))) {
    const [rawData, body] = splitDocumentBody(sourcePath);
    const frontmatter = objectRecord(rawData);
    const route = routeForDocumentFile(config, sourcePath);
    const title = chooseTitle(frontmatter, body, route);
    const layout = parseLayoutFromFrontmatter(frontmatter, config.config_root);
    const displayMarkdown = stripLeadingTitle(body, title);
    const page: VirtualPage = {
      file_slug: route,
      title,
      markdown: body,
      html: renderWikiMarkdown(displayMarkdown, baseUrl, urlStyle, route),
      frontmatter,
      source_path: sourcePath,
      layout_path: layout[0],
      layout_stem: layout[1],
      wiki_ids: pageWikiIds(config, route, frontmatter),
      outline: outlineForMarkdown(body),
      backlink_slugs: linkIndex.backlinksTo(route),
    };
    pages.push(page);
  }

  const pagesByRoute = new Map<string, VirtualPage>();
  const routesByWikiId = new Map<string, string>();
  for (const page of pages) {
    pagesByRoute.set(page.file_slug, page);
    for (const wikiId of page.wiki_ids) {
      routesByWikiId.set(wikiId, page.file_slug);
    }
  }
  return {
    pages,
    config,
    pages_by_route: pagesByRoute,
    routes_by_wiki_id: routesByWikiId,
  };
}
