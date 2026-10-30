import { isExternalLink, resolvePageRoute } from "../../links.ts";
import { pageUrl } from "../../paths.ts";
import type { VirtualPage, WikiSite } from "../types.ts";
import { escapeHtml } from "./defaults.ts";

function expandKnownCurie(value: string, site: WikiSite): string {
  if (
    !value.includes(":") || isExternalLink(value) ||
    value.toLowerCase().startsWith("urn:")
  ) return value;
  const separator = value.indexOf(":");
  const namespace = site.config.context.namespaces.get(
    value.slice(0, separator),
  );
  return namespace === undefined
    ? value
    : `${namespace}${value.slice(separator + 1)}`;
}

function metadataLinkCandidates(target: string, site: WikiSite): string[] {
  const candidate = target.trim();
  if (candidate === "") return [];
  const keys = [candidate];
  const expanded = expandKnownCurie(candidate, site);
  if (!keys.includes(expanded)) keys.push(expanded);
  if (candidate.includes(":") && !isExternalLink(candidate)) {
    const [prefix, local] = candidate.split(":", 2);
    if (prefix === "wiki" && local && !keys.includes(local)) keys.push(local);
  }
  return keys;
}

function metadataValueHref(
  target: string,
  page: VirtualPage,
  site: WikiSite,
  baseUrl: string,
  urlStyle: string,
): [string | null, boolean, VirtualPage | undefined] {
  const candidate = target.trim();
  if (candidate === "") return [null, false, undefined];
  if (isExternalLink(candidate)) return [candidate, true, undefined];
  for (const key of metadataLinkCandidates(candidate, site)) {
    const route = site.routes_by_wiki_id.get(key);
    if (route !== undefined) {
      return [
        pageUrl(baseUrl, route, urlStyle),
        false,
        site.pages_by_route.get(route),
      ];
    }
  }
  const siteRoot = pageUrl(baseUrl, "", urlStyle).replace(/\/$/, "");
  if (candidate.startsWith(siteRoot)) return [candidate, false, undefined];
  for (const key of metadataLinkCandidates(candidate, site)) {
    if (key.startsWith(page.file_slug)) {
      const targetPage = site.pages_by_route.get(key);
      if (targetPage !== undefined) {
        return [pageUrl(baseUrl, key, urlStyle), false, targetPage];
      }
    }
    const route = resolvePageRoute(page.file_slug, key);
    if (route !== null && site.pages_by_route.has(route)) {
      const targetPage = site.pages_by_route.get(route);
      return [pageUrl(baseUrl, key, urlStyle), false, targetPage];
    }
    if (site.pages_by_route.has(key)) {
      return [
        pageUrl(baseUrl, key, urlStyle),
        false,
        site.pages_by_route.get(key),
      ];
    }
  }
  return [null, false, undefined];
}

function displayLabelForTarget(
  label: string,
  target: string,
  targetPage: VirtualPage | undefined,
): string {
  if (targetPage === undefined) return label;
  const normalizedLabel = label.trim();
  const normalizedTarget = target.trim();
  return normalizedLabel === normalizedTarget ||
      targetPage.wiki_ids.includes(normalizedLabel) ||
      normalizedLabel === targetPage.file_slug
    ? targetPage.title
    : label;
}

export function renderLinkLike(
  label: string,
  target: string,
  page: VirtualPage,
  site: WikiSite,
  baseUrl: string,
  urlStyle: string,
): [string, string] {
  const [href, external, targetPage] = metadataValueHref(
    target,
    page,
    site,
    baseUrl,
    urlStyle,
  );
  const displayLabel = displayLabelForTarget(label, target, targetPage);
  const escapedLabel = escapeHtml(displayLabel);
  if (href === null) return [displayLabel, escapedLabel];
  return [
    displayLabel,
    `<a${external ? "" : ' class="wikilink"'} href="${
      escapeHtml(href)
    }">${escapedLabel}</a>`,
  ];
}
