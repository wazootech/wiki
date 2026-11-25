import { pageUrl } from "../../paths.ts";
import type { VirtualPage, WikiSite } from "../types.ts";
import {
  escapeHtml,
  METADATA_TAB_HTML,
  METADATA_TOOL_HTML,
  safeJson,
} from "./defaults.ts";
import {
  buildBacklinksHtml,
  buildCategoriesHtml,
  buildTocHtml,
  pageCategories,
} from "./page_sections.ts";
import { buildInfoboxHtml } from "./metadata_render.ts";

function typeLabel(page: VirtualPage): string {
  const rawTypes = page.frontmatter["@type"] || page.frontmatter.type;
  if (!rawTypes) return "";
  for (const value of Array.isArray(rawTypes) ? rawTypes : [rawTypes]) {
    if (typeof value === "string" && value.trim() !== "") {
      const clean = value.includes(":")
        ? value.slice(value.indexOf(":") + 1)
        : value;
      return `<div class="layout-label">${escapeHtml(clean.trim())}</div>`;
    }
  }
  return "";
}

function layoutLabel(page: VirtualPage): string {
  if (page.layout_stem === "default") return "";
  const label = page.layout_stem.replaceAll("_", " ").replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  return `<div class="layout-label">${escapeHtml(label)}</div>`;
}

function buildIndexBodyHtml(
  site: WikiSite,
  baseUrl: string,
  urlStyle: string,
): string {
  const seen = new Set<string>();
  const links: string[] = [];
  for (const page of site.pages) {
    if (page.frontmatter.redirect_to) continue;
    if (seen.has(page.file_slug)) continue;
    seen.add(page.file_slug);
    const categories = escapeHtml(pageCategories(page).join(","));
    links.push(
      `<li data-categories="${categories}"><a href="${
        escapeHtml(pageUrl(baseUrl, page.file_slug, urlStyle))
      }">${escapeHtml(page.title)}</a></li>`,
    );
  }
  return `<ul class="pages-list">\n${links.join("\n")}${
    links.length === 0 ? "" : "\n"
  }</ul>`;
}

/**
 * The `%wiki.*%` values every layout of this family expects.
 *
 * `page` is `null` for the site index.
 */
export function shellTokens(
  page: VirtualPage | null,
  site: WikiSite,
  baseUrl: string,
  urlStyle: string,
  pagesJson: string,
  options: {
    titleSuffix: string;
    hiddenFields: ReadonlySet<string>;
    metadataPane: string;
  },
): Map<string, string> {
  const title = page?.title ?? "All Pages";
  const hasMetadata = page !== null &&
    Object.keys(page.frontmatter).length > 0;
  return new Map([
    ["%wiki.base_url%", baseUrl],
    ["%wiki.url_style%", urlStyle],
    ["%wiki.pages%", pagesJson],
    ["%wiki.title%", escapeHtml(title)],
    ["%wiki.slug%", safeJson(page === null ? "__index__" : page.file_slug)],
    ["%wiki.source%", escapeHtml(page?.markdown ?? "")],
    [
      "%wiki.layout_stem%",
      escapeHtml(
        page === null ? "index" : page.layout_stem,
      ),
    ],
    ["%wiki.page_kind%", escapeHtml(page === null ? "index" : "article")],
    [
      "%wiki.body%",
      page === null ? buildIndexBodyHtml(site, baseUrl, urlStyle) : page.html,
    ],
    ["%wiki.toc%", page === null ? "" : buildTocHtml(page, baseUrl, urlStyle)],
    [
      "%wiki.backlinks%",
      page === null ? "" : buildBacklinksHtml(page, site, baseUrl, urlStyle),
    ],
    [
      "%wiki.infobox%",
      page === null ? "" : buildInfoboxHtml(
        page,
        site,
        baseUrl,
        urlStyle,
        options.hiddenFields,
      ),
    ],
    [
      "%wiki.categories%",
      page === null ? "" : buildCategoriesHtml(page, baseUrl),
    ],
    ["%wiki.metadata_pane%", hasMetadata ? options.metadataPane : ""],
    ["%wiki.metadata_tool%", hasMetadata ? METADATA_TOOL_HTML : ""],
    ["%wiki.metadata_tab%", hasMetadata ? METADATA_TAB_HTML : ""],
    ["%wiki.type_label%", page === null ? "" : typeLabel(page)],
    ["%wiki.layout_label%", page === null ? "" : layoutLabel(page)],
    [
      "%wiki.head%",
      `<title>${escapeHtml(title)}${options.titleSuffix}</title>`,
    ],
  ]);
}
