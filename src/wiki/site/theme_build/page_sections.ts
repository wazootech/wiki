import { pageUrl } from "../../paths.ts";
import { renderOutlineTitle } from "../markdown.ts";
import type { VirtualPage, WikiSite } from "../types.ts";
import { escapeHtml } from "./defaults.ts";

export function buildTocHtml(
  page: VirtualPage,
  baseUrl: string,
  urlStyle: string,
): string {
  if (page.outline.length === 0) return "";
  const items = [
    '<li class="toclevel-0 l2"><a href="#firstHeading">(Top)</a></li>',
    ...page.outline.map((item) => {
      const title = renderOutlineTitle(
        item.title,
        baseUrl,
        urlStyle,
        page.file_slug,
      );
      return `<li class="toclevel-${item.level - 1} l${item.level}"><a href="#${
        escapeHtml(item.slug)
      }">${title}</a></li>`;
    }),
  ].join("\n");
  return `<div class="toc" id="toc">
<div class="toctitle">
<h2>Contents<span style="display:none">On this page</span></h2>
<span class="toctogglelink" id="toggleTocBtn" onclick="toggleToc()">[hide]</span>
</div>
<ul class="toc-list" id="toc-list">
${items}
</ul>
</div>`;
}

export function pageCategories(page: VirtualPage): string[] {
  const categories: string[] = [];
  if (page.layout_stem && page.layout_stem !== "default") {
    categories.push(page.layout_stem);
  }
  const rawTypes = page.frontmatter["@type"] || page.frontmatter.type;
  const values = Array.isArray(rawTypes) ? rawTypes : [rawTypes];
  for (const value of values) {
    if (typeof value !== "string") continue;
    categories.push(
      value.includes(":") ? value.slice(value.indexOf(":") + 1) : value,
    );
  }
  const seen = new Set<string>();
  return categories.map((value) => value.trim()).filter((value) => {
    const key = value.toLowerCase();
    if (key === "" || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildCategoriesHtml(
  page: VirtualPage,
  baseUrl: string,
): string {
  const categories = pageCategories(page);
  if (categories.length === 0) return "";
  const items = categories.map((category) =>
    `<li class="catlinks-item"><a href="${escapeHtml(baseUrl)}/?category=${
      encodeURIComponent(category)
    }">${escapeHtml(category)}</a></li>`
  ).join("");
  return `<div class="catlinks" id="catlinks">
<div class="catlinks-label">Categories:</div>
<ul class="catlinks-list">
${items}
</ul>
</div>`;
}

export function buildBacklinksHtml(
  page: VirtualPage,
  site: WikiSite,
  baseUrl: string,
  urlStyle: string,
): string {
  if (page.backlink_slugs.length === 0) return "";
  const items = page.backlink_slugs.map((slug) => {
    const target = site.pages_by_route.get(slug);
    const title = target?.title ??
      slug.replaceAll("-", " ").replace(
        /\b\w/g,
        (letter) => letter.toUpperCase(),
      );
    const route = target?.file_slug ?? slug;
    return `<li><a href="${escapeHtml(pageUrl(baseUrl, route, urlStyle))}">${
      escapeHtml(title)
    }</a></li>`;
  }).join("\n");
  return `<section class="page-meta">
<h2>Backlinks</h2>
<ul class="backlinks-list">
${items}
</ul>
</section>`;
}
