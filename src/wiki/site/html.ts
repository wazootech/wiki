import type { Path } from "../fspath.ts";
import { pageUrl } from "../paths.ts";
import type { VirtualPage, WikiSite } from "./types.ts";
import { renderLayout, renderPageLayout } from "./layout.ts";

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll(
      "'",
      "&#x27;",
    );
}

function pageCategories(page: VirtualPage): string[] {
  const categories: string[] = [];
  if (page.layout_stem !== "" && page.layout_stem !== "default") {
    categories.push(page.layout_stem);
  }
  const types = page.frontmatter["@type"] || page.frontmatter.type;
  const values = Array.isArray(types) ? types : [types];
  for (const value of values) {
    if (typeof value !== "string") continue;
    categories.push(
      value.includes(":") ? value.slice(value.lastIndexOf(":") + 1) : value,
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

export function buildIndexHtml(
  site: WikiSite,
  baseUrl: string,
  urlStyle: string,
  defaultLayout: Path | null,
): string {
  const links = site.pages.map((page) => {
    const categories = escapeHtml(pageCategories(page).join(","));
    const href = escapeHtml(pageUrl(baseUrl, page.file_slug, urlStyle));
    return `<li data-categories="${categories}"><a href="${href}">${
      escapeHtml(page.title)
    }</a></li>`;
  }).join("\n");
  return renderLayout(
    "All Pages",
    baseUrl,
    `<ul class="pages-list">\n${links}${links === "" ? "" : "\n"}</ul>`,
    defaultLayout,
  );
}

export function buildPageHtml(
  page: VirtualPage,
  baseUrl: string,
  defaultLayout: Path | null,
): string {
  return renderPageLayout(page, baseUrl, defaultLayout);
}
