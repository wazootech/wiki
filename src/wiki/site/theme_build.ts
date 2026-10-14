/**
 * Static-site assembly for a custom theme.
 *
 * The built-in `wiki build` renders the built-in layout (`./html.ts`). A theme
 * that ships its own layout needs the same surrounding flow: walk the site,
 * build a page shell (table of contents, infobox, backlinks, categories,
 * metadata panels), substitute `%wiki.*%` tokens, write the HTML tree, and copy
 * assets. `buildThemedSite` owns that flow; the theme owns its layout, its
 * assets, and the token values specific to its design (#409).
 *
 * The split follows #407: the engine renders and substitutes, the theme supplies
 * the vocabulary. The shell values below are the ones every layout of this
 * family uses, so the engine computes them and a theme adds or overrides the
 * rest through `tokens`.
 *
 * One decision is recorded here so themes do not each rediscover it: the `xml`
 * metadata view is excluded by default. RDF/XML *output* is deferred
 * (`../rdf.ts`), which is why `wiki build` and both themes drop the view, while
 * RDF/XML *input* remains supported. A theme that wants the panel back passes
 * `metadata.views` explicitly.
 */

import { dirname, join, resolve } from "@std/path";
import { buildAssetManifest } from "../assets.ts";
import type { Config } from "../config.ts";
import { exportFrontmatter } from "../export.ts";
import { isFile, pathExists, relativeWithin } from "../fspath.ts";
import { isExternalLink, resolvePageRoute } from "../links.ts";
import { pageOutputPath, pageUrl } from "../paths.ts";
import { METADATA_VIEWS, type MetadataView } from "../schemas/metadata.ts";
import { buildSite } from "./build.ts";
import { renderOutlineTitle } from "./markdown.ts";
import type { VirtualPage, WikiSite } from "./types.ts";

/** Appended to the built-in `%wiki.head%` title. */
const DEFAULT_TITLE_SUFFIX = " - Wiki";
/** Layout file, relative to the theme directory. */
const DEFAULT_LAYOUT = join("layouts", "wikipedia.html");
/** The metadata format shown before a reader picks another. */
const DEFAULT_SELECTED_VIEW = "json-ld-compacted";
/** Identifiers the infobox omits because the layout already shows them. */
const DEFAULT_HIDDEN_FIELDS: ReadonlySet<string> = new Set([
  "@context",
  "@id",
  "id",
  "@type",
  "type",
]);
/** Every view except `xml`, whose serialization is deferred (see module docs). */
const DEFAULT_VIEWS: readonly MetadataView[] = METADATA_VIEWS.filter((view) =>
  view.format !== "xml"
);
/** Page-menu item linking to the metadata tab, when a page has frontmatter. */
const METADATA_TOOL_HTML =
  '<li><a href="#view-metadata-content" onclick="switchTab(\'metadata\'); return false;">View metadata</a></li>';
/** Metadata tab item, shown under the same condition as the tool link. */
const METADATA_TAB_HTML =
  '<li id="ca-metadata"><a href="#view-metadata-content" onclick="switchTab(\'metadata\'); return false;">Metadata</a></li>';

/** Everything a theme's `tokens` callback sees for one page. */
export interface ThemePageContext {
  /** The page being rendered, or `null` for the site index. */
  readonly page: VirtualPage | null;
  readonly site: WikiSite;
  readonly baseUrl: string;
  readonly urlStyle: string;
  /** JSON array of `{slug, title}` for the layout's `%wiki.pages%` token. */
  readonly pagesJson: string;
}

/** Metadata-panel behaviour. */
export interface ThemeMetadataOptions {
  /** Panels to render, in tab order. Defaults to every view except `xml`. */
  readonly views?: readonly MetadataView[];
  /** View selected on load. Defaults to `json-ld-compacted`. */
  readonly selected_view?: string;
  /** Emit the "RDF/XML serialization is deferred." note. Defaults to `true`. */
  readonly note?: boolean;
  /**
   * Highlight one panel body. Return HTML: the result is inserted verbatim, so
   * escape the text first (`escapeHtml`) if the grammar highlights nothing. The
   * default escapes the whole body.
   */
  readonly highlight?: (text: string, view: MetadataView) => string;
}

/** What a theme supplies to `buildThemeSite`. */
export interface ThemeSiteOptions {
  /** Directory holding the theme's layouts and assets. */
  readonly dir: string;
  /** Layout file for ordinary pages. Defaults to `layouts/wikipedia.html`. */
  readonly layout?: string;
  /**
   * Layout file for pages whose frontmatter sets `redirect_to`. Omitted, such a
   * page renders with `layout`.
   */
  readonly redirect_layout?: string | null;
  /** Appended to the built-in `%wiki.head%` title. Defaults to ` - Wiki`. */
  readonly title_suffix?: string;
  /** Frontmatter keys omitted from the infobox. */
  readonly hidden_fields?: ReadonlySet<string>;
  readonly metadata?: ThemeMetadataOptions;
  /**
   * Extra `%wiki.*%` values merged over the shell tokens. Returning a shell key
   * overrides it (for example `%wiki.body%` for a custom index). An unfilled
   * token is left in the output verbatim, so the layout can be checked for
   * residue.
   */
  readonly tokens?: (context: ThemePageContext) => ReadonlyMap<string, string>;
}

interface InfoboxRow {
  label: string;
  text: string;
  html: string;
}

/** Escape text for insertion into HTML markup. */
export function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll(
      "'",
      "&#x27;",
    );
}

/** Serialize a value for embedding inside a `<script>` element. */
export function safeJson(value: unknown): string {
  return (JSON.stringify(value) ?? "null").replace(
    /[<>&\u2028\u2029]/g,
    (character) => {
      switch (character) {
        case "<":
          return "\\u003c";
        case ">":
          return "\\u003e";
        case "&":
          return "\\u0026";
        case "\u2028":
          return "\\u2028";
        default:
          return "\\u2029";
      }
    },
  );
}

/**
 * Replace every `%wiki.*%` token in a layout.
 *
 * A token absent from `tokens` is left verbatim rather than emptied, so a typo
 * shows up in the output instead of silently vanishing. Values are inserted
 * as-is: escape untrusted text before putting it in the map.
 */
export function substitute(
  template: string,
  tokens: ReadonlyMap<string, string>,
): string {
  return template.replace(
    /%wiki\.[a-z0-9_.]+%/gi,
    (token) => tokens.get(token) ?? token,
  );
}

function buildTocHtml(
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

function pageCategories(page: VirtualPage): string[] {
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

function buildCategoriesHtml(page: VirtualPage, baseUrl: string): string {
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

function buildBacklinksHtml(
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

function renderLinkLike(
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

function renderMetadataValue(
  value: unknown,
  page: VirtualPage,
  site: WikiSite,
  baseUrl: string,
  urlStyle: string,
): [string, string] {
  if (value === null || value === undefined) return ["", ""];
  if (Array.isArray(value)) {
    const rendered = value.map((item) =>
      renderMetadataValue(item, page, site, baseUrl, urlStyle)
    ).filter((item) => item[1] !== "");
    if (rendered.length === 0) return ["", ""];
    const html = rendered.map(([, itemHtml]) =>
      itemHtml.includes('class="infobox-dict"')
        ? `<li class="infobox-list-block">${itemHtml}</li>`
        : `<li><span class="infobox-chip">${itemHtml}</span></li>`
    ).join("");
    return [
      rendered.map(([text]) => text).filter(Boolean).join(", "),
      `<ul class="infobox-list">${html}</ul>`,
    ];
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const targetId = record["@id"] ?? record.id;
    const label = record.name ?? targetId;
    if (typeof targetId === "string" && label) {
      return renderLinkLike(
        String(label),
        targetId,
        page,
        site,
        baseUrl,
        urlStyle,
      );
    }
    const rows: string[] = [];
    const texts: string[] = [];
    for (const [key, nestedValue] of Object.entries(record)) {
      if (key.startsWith("@")) continue;
      const [text, html] = renderMetadataValue(
        nestedValue,
        page,
        site,
        baseUrl,
        urlStyle,
      );
      if (html === "") continue;
      rows.push(
        `<div class="infobox-dict-row"><span class="infobox-key">${
          escapeHtml(key)
        }</span><span>${html}</span></div>`,
      );
      if (text) texts.push(`${key}: ${text}`);
    }
    if (rows.length === 0) return ["", ""];
    return [
      texts.join("; "),
      `<div class="infobox-dict">${rows.join("")}</div>`,
    ];
  }
  if (typeof value === "boolean") {
    return [value ? "True" : "False", value ? "True" : "False"];
  }
  if (typeof value === "number") {
    return [String(value), escapeHtml(String(value))];
  }
  const text = String(value);
  if (isExternalLink(text) || text.includes(":")) {
    return renderLinkLike(text, text, page, site, baseUrl, urlStyle);
  }
  return [text, escapeHtml(text)];
}

function buildInfoboxRows(
  page: VirtualPage,
  site: WikiSite,
  baseUrl: string,
  urlStyle: string,
  hiddenFields: ReadonlySet<string>,
): InfoboxRow[] {
  const rows: InfoboxRow[] = [];
  for (const [key, value] of Object.entries(page.frontmatter)) {
    if (hiddenFields.has(key)) continue;
    const [text, html] = renderMetadataValue(
      value,
      page,
      site,
      baseUrl,
      urlStyle,
    );
    if (html !== "") rows.push({ label: key, text, html });
  }
  return rows;
}

function buildInfoboxHtml(
  page: VirtualPage,
  site: WikiSite,
  baseUrl: string,
  urlStyle: string,
  hiddenFields: ReadonlySet<string>,
): string {
  const rows = buildInfoboxRows(page, site, baseUrl, urlStyle, hiddenFields);
  if (rows.length === 0) return "";
  const details = rows.map((row) =>
    `<dt>${escapeHtml(row.label)}</dt><dd>${row.html}</dd>`
  ).join("\n");
  return `<section class="infobox page-meta">
<h2>Infobox</h2>
<dl>
${details}
</dl>
</section>`;
}

function metadataViewDomId(page: VirtualPage): string {
  const safeSlug =
    (page.file_slug || "index").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(
      /^-+|-+$/g,
      "",
    ) || "index";
  return `metadata-format-${safeSlug.toLowerCase()}`;
}

/**
 * Wrap metadata text in the copyable `<pre>` the layout styles.
 *
 * `codeHtml` is inserted verbatim, so pass highlighted or escaped HTML.
 */
function renderCopyablePre(
  rawText: string,
  codeHtml: string,
  preClass = "",
  codeClass = "",
): string {
  const preClassAttribute = preClass ? ` class="${escapeHtml(preClass)}"` : "";
  const codeClassAttribute = codeClass
    ? ` class="${escapeHtml(codeClass)}"`
    : "";
  return `<pre data-copy="${
    escapeHtml(rawText)
  }"${preClassAttribute}><code${codeClassAttribute}>${codeHtml}</code></pre>\n`;
}

async function metadataText(
  page: VirtualPage,
  config: Config,
  view: MetadataView,
): Promise<string> {
  if (page.source_path === null) return "";
  const result = await exportFrontmatter(config, [page.source_path], {
    format: view.format,
    mode: view.mode,
  });
  if (!result.ok) {
    throw new Error(
      result.error_message ??
        `Could not export ${view.label} metadata for ${page.file_slug}`,
    );
  }
  if (view.format !== "json-ld") return result.output;
  const payload = JSON.parse(result.output) as { rdf: unknown };
  return typeof payload.rdf === "string"
    ? payload.rdf
    : JSON.stringify(payload.rdf, null, 2);
}

async function buildMetadataPanelHtml(
  page: VirtualPage,
  config: Config,
  options:
    & Required<Pick<ThemeMetadataOptions, "views" | "selected_view">>
    & Pick<ThemeMetadataOptions, "note" | "highlight">,
): Promise<string> {
  if (Object.keys(page.frontmatter).length === 0) return "";
  const groupId = metadataViewDomId(page);
  const highlight = options.highlight ??
    ((text: string) => escapeHtml(text));
  const radios: string[] = [];
  const panels: string[] = [];
  for (const view of options.views) {
    const inputId = `${groupId}-${view.id}`;
    const checked = view.id === options.selected_view
      ? ' checked="checked"'
      : "";
    radios.push(
      `<input class="metadata-format-input" type="radio" name="${groupId}" id="${inputId}" value="${view.id}"${checked}><label class="metadata-format-label" for="${inputId}">${
        escapeHtml(view.label)
      }</label>`,
    );
    const text = await metadataText(page, config, view);
    panels.push(
      `<div class="metadata-format-panel metadata-format-panel-${view.id}">${
        renderCopyablePre(
          text,
          highlight(text, view),
          "highlight",
          `language-${view.lexer}`,
        )
      }</div>`,
    );
  }
  const note = options.note === false
    ? ""
    : `\n  <p class="metadata-format-note">RDF/XML serialization is deferred.</p>`;
  return `<section class="page-meta metadata-panel">
<div class="metadata-format-switch" role="group" aria-label="Metadata RDF format">
  <div class="metadata-format-toolbar">
    <span class="metadata-format-heading">Format</span>
    <div class="metadata-format-options">${radios.join("")}</div>
  </div>${note}
  <div class="metadata-format-panels">
    ${panels.join("\n    ")}
  </div>
</div>
</section>`;
}

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
function shellTokens(
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

function validateOutputDir(
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

function outputSubdirectory(outputDir: string, baseUrl: string): string {
  const relativePath = baseUrl.replace(/^\/+|\/+$/g, "");
  const parts = relativePath.split("/").filter(Boolean);
  if (parts.some((part) => part === "." || part === "..")) {
    throw new Error(`Invalid site.base_url path: ${baseUrl}`);
  }
  return parts.length === 0 ? outputDir : join(outputDir, ...parts);
}

function readTemplate(path: string): string {
  return Deno.readTextFileSync(path).replace(/^\uFEFF/, "");
}

/**
 * Build a wiki into a static site with a custom theme.
 *
 * The flow is the one the built-in `wiki build` uses, with the layout and the
 * token vocabulary owned by the theme: build the site, validate that the output
 * directory does not overlap the sources, write the index, then one HTML file
 * per page, and finally copy the asset manifest. Returns the page count.
 *
 * A page whose frontmatter sets `redirect_to` uses `redirect_layout` when the
 * theme supplies one. A page whose `layout_path` resolves to a real file uses
 * that file instead, so per-page layouts keep working under a custom theme.
 */
export async function buildThemedSite(
  config: Config,
  outputDir: string,
  theme: ThemeSiteOptions,
): Promise<number> {
  const themeDir = resolve(theme.dir);
  const resolvedOutputDir = resolve(outputDir);
  const baseUrl = config.site.base_url ?? "/wiki";
  const urlStyle = config.site.url_style || "dir";
  const wikiOutput = resolve(outputSubdirectory(resolvedOutputDir, baseUrl));
  const site = buildSite(config, baseUrl, urlStyle);
  const layoutPath = join(themeDir, theme.layout ?? DEFAULT_LAYOUT);
  const redirectLayoutPath = theme.redirect_layout === undefined ||
      theme.redirect_layout === null
    ? null
    : join(themeDir, theme.redirect_layout);
  validateOutputDir(
    resolvedOutputDir,
    config,
    site,
    redirectLayoutPath === null
      ? [layoutPath]
      : [layoutPath, redirectLayoutPath],
  );

  const defaultLayout = readTemplate(layoutPath);
  const redirectLayout = redirectLayoutPath === null
    ? null
    : readTemplate(redirectLayoutPath);
  const pagesJson = safeJson(
    site.pages.map((page) => ({ slug: page.file_slug, title: page.title })),
  );
  const hiddenFields = theme.hidden_fields ?? DEFAULT_HIDDEN_FIELDS;
  const views = theme.metadata?.views ?? DEFAULT_VIEWS;
  const selectedView = theme.metadata?.selected_view ?? DEFAULT_SELECTED_VIEW;
  const note = theme.metadata?.note;
  const highlight = theme.metadata?.highlight;

  if (pathExists(resolvedOutputDir)) {
    Deno.removeSync(resolvedOutputDir, { recursive: true });
  }
  Deno.mkdirSync(wikiOutput, { recursive: true });

  const pageContext = (page: VirtualPage | null): ThemePageContext => ({
    page,
    site,
    baseUrl,
    urlStyle,
    pagesJson,
  });
  const mergeTokens = (
    base: Map<string, string>,
    page: VirtualPage | null,
  ): Map<string, string> => {
    const extra = theme.tokens?.(pageContext(page));
    if (extra === undefined) return base;
    for (const [token, value] of extra) base.set(token, value);
    return base;
  };

  const indexTokens = mergeTokens(
    shellTokens(null, site, baseUrl, urlStyle, pagesJson, {
      titleSuffix: theme.title_suffix ?? DEFAULT_TITLE_SUFFIX,
      hiddenFields,
      metadataPane: "",
    }),
    null,
  );
  Deno.writeTextFileSync(
    join(wikiOutput, "index.html"),
    substitute(defaultLayout, indexTokens),
  );
  let written = 1;

  for (const page of site.pages) {
    const hasMetadata = Object.keys(page.frontmatter).length > 0;
    const metadataPane = hasMetadata
      ? await buildMetadataPanelHtml(page, config, {
        views,
        selected_view: selectedView,
        ...(note === undefined ? {} : { note }),
        ...(highlight === undefined ? {} : { highlight }),
      })
      : "";
    const redirectTo = typeof page.frontmatter.redirect_to === "string"
      ? page.frontmatter.redirect_to
      : "";
    const selectedLayout = page.layout_path !== null &&
        isFile(page.layout_path)
      ? readTemplate(page.layout_path)
      : redirectTo && redirectLayout !== null
      ? redirectLayout
      : defaultLayout;
    const tokens = mergeTokens(
      shellTokens(page, site, baseUrl, urlStyle, pagesJson, {
        titleSuffix: theme.title_suffix ?? DEFAULT_TITLE_SUFFIX,
        hiddenFields,
        metadataPane,
      }),
      page,
    );
    const outputPath = pageOutputPath(wikiOutput, page.file_slug, urlStyle);
    Deno.mkdirSync(dirname(outputPath), { recursive: true });
    Deno.writeTextFileSync(outputPath, substitute(selectedLayout, tokens));
    written += 1;
  }

  for (const entry of buildAssetManifest(config, wikiOutput, baseUrl)) {
    Deno.mkdirSync(dirname(entry.output_path), { recursive: true });
    if (entry.source !== null) {
      Deno.copyFileSync(entry.source, entry.output_path);
    }
  }
  console.log(`Built ${written} pages to ${resolvedOutputDir}`);
  return written;
}
