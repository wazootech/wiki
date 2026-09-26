import { dirname, fromFileUrl, join, resolve } from "@std/path";
import { buildAssetManifest } from "../src/wiki/assets.ts";
import { Config } from "../src/wiki/config.ts";
import { isFile, pathExists, relativeWithin } from "../src/wiki/fspath.ts";
import { isExternalLink, resolvePageRoute } from "../src/wiki/links.ts";
import { pageOutputPath, pageUrl } from "../src/wiki/paths.ts";
import { exportFrontmatter } from "../src/wiki/export.ts";
import {
  METADATA_VIEWS,
  type MetadataView,
} from "../src/wiki/schemas/metadata.ts";
import { buildSite } from "../src/wiki/site/build.ts";
import { renderOutlineTitle } from "../src/wiki/site/markdown.ts";
import type { VirtualPage, WikiSite } from "../src/wiki/site/types.ts";

const DOCS_DIR = dirname(fromFileUrl(import.meta.url));
const REPO_ROOT = dirname(DOCS_DIR);
const METADATA_HIDDEN_FIELDS = new Set([
  "@context",
  "@id",
  "id",
  "@type",
  "type",
]);
const DOCS_METADATA_VIEWS = METADATA_VIEWS.filter((view) =>
  view.format !== "xml"
);
const GITHUB_REPO = "wazootech/wiki";
const GITHUB_BRANCH = "main";

interface InfoboxRow {
  label: string;
  text: string;
  html: string;
}

export interface DocsBuildOptions {
  docsDir?: string;
  repoRoot?: string | null;
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll(
      "'",
      "&#x27;",
    );
}

function safeJson(value: unknown): string {
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

function substitute(
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
): InfoboxRow[] {
  const rows: InfoboxRow[] = [];
  for (const [key, value] of Object.entries(page.frontmatter)) {
    if (METADATA_HIDDEN_FIELDS.has(key)) continue;
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
): string {
  const rows = buildInfoboxRows(page, site, baseUrl, urlStyle);
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

async function metadataContent(
  page: VirtualPage,
  config: Config,
  view: MetadataView,
): Promise<[string, string]> {
  if (page.source_path === null) return ["", ""];
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
  if (view.format !== "json-ld") return [result.output, result.output];
  const payload = JSON.parse(result.output) as { rdf: unknown };
  const text = typeof payload.rdf === "string"
    ? payload.rdf
    : JSON.stringify(payload.rdf, null, 2);
  return [text, text];
}

function renderCopyablePre(
  rawText: string,
  codeText: string,
  preClass = "",
  codeClass = "",
): string {
  const preClassAttribute = preClass ? ` class="${escapeHtml(preClass)}"` : "";
  const codeClassAttribute = codeClass
    ? ` class="${escapeHtml(codeClass)}"`
    : "";
  return `<pre data-copy="${
    escapeHtml(rawText)
  }"${preClassAttribute}><code${codeClassAttribute}>${
    escapeHtml(codeText)
  }</code></pre>\n`;
}

async function buildMetadataPanelHtml(
  page: VirtualPage,
  config: Config,
  selectedView: string,
): Promise<string> {
  if (Object.keys(page.frontmatter).length === 0) return "";
  const groupId = metadataViewDomId(page);
  const radios: string[] = [];
  const panels: string[] = [];
  for (const view of DOCS_METADATA_VIEWS) {
    const inputId = `${groupId}-${view.id}`;
    const checked = view.id === selectedView ? ' checked="checked"' : "";
    radios.push(
      `<input class="metadata-format-input" type="radio" name="${groupId}" id="${inputId}" value="${view.id}"${checked}><label class="metadata-format-label" for="${inputId}">${
        escapeHtml(view.label)
      }</label>`,
    );
    const [text, code] = await metadataContent(page, config, view);
    panels.push(
      `<div class="metadata-format-panel metadata-format-panel-${view.id}">${
        renderCopyablePre(text, code, "highlight", `language-${view.lexer}`)
      }</div>`,
    );
  }
  return `<section class="page-meta metadata-panel">
<div class="metadata-format-switch" role="group" aria-label="Metadata RDF format">
  <div class="metadata-format-toolbar">
    <span class="metadata-format-heading">Format</span>
    <div class="metadata-format-options">${radios.join("")}</div>
  </div>
  <p class="metadata-format-note">RDF/XML serialization is deferred.</p>
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

function editLink(page: VirtualPage, repoRoot: string | null): string {
  if (repoRoot === null || page.source_path === null) return "";
  try {
    const path = relativeWithin(resolve(page.source_path), resolve(repoRoot))
      .replaceAll("\\", "/");
    const url =
      `https://github.com/${GITHUB_REPO}/blob/${GITHUB_BRANCH}/${path}`;
    return `<li id="ca-edit"><a href="${
      escapeHtml(url)
    }" target="_blank">Edit this page</a></li>`;
  } catch {
    return "";
  }
}

function pageTokens(
  page: VirtualPage | null,
  site: WikiSite,
  baseUrl: string,
  urlStyle: string,
  pagesJson: string,
  values: {
    toc: string;
    backlinks: string;
    infobox: string;
    categories: string;
    metadataPane: string;
    metadataTool: string;
    metadataTab: string;
    typeLabel: string;
    layoutLabel: string;
    slug: string;
    pageKind: string;
    layoutStem: string;
    body: string;
    source: string;
    editLink: string;
    redirectUrl: string;
  },
): Map<string, string> {
  const title = page?.title ?? "All Pages";
  return new Map([
    ["%wiki.base_url%", baseUrl],
    ["%wiki.url_style%", urlStyle],
    ["%wiki.pages%", pagesJson],
    ["%wiki.title%", escapeHtml(title)],
    ["%wiki.slug%", values.slug],
    ["%wiki.source%", escapeHtml(values.source)],
    ["%wiki.layout_stem%", escapeHtml(values.layoutStem)],
    ["%wiki.page_kind%", escapeHtml(values.pageKind)],
    ["%wiki.body%", values.body],
    ["%wiki.toc%", values.toc],
    ["%wiki.backlinks%", values.backlinks],
    ["%wiki.infobox%", values.infobox],
    ["%wiki.categories%", values.categories],
    ["%wiki.metadata_pane%", values.metadataPane],
    ["%wiki.metadata_tool%", values.metadataTool],
    ["%wiki.metadata_tab%", values.metadataTab],
    ["%wiki.type_label%", values.typeLabel],
    ["%wiki.layout_label%", values.layoutLabel],
    ["%wiki.edit_link%", values.editLink],
    ["%wiki.redirect_url%", escapeHtml(values.redirectUrl)],
    ["%wiki.head%", `<title>${escapeHtml(title)} - Wiki</title>`],
  ]);
}

function buildIndexHtml(
  site: WikiSite,
  baseUrl: string,
  urlStyle: string,
  pagesJson: string,
  layoutText: string,
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
  const body = `<ul class="pages-list">\n${links.join("\n")}${
    links.length === 0 ? "" : "\n"
  }</ul>`;
  const tokens = pageTokens(null, site, baseUrl, urlStyle, pagesJson, {
    toc: "",
    backlinks: "",
    infobox: "",
    categories: "",
    metadataPane: "",
    metadataTool: "",
    metadataTab: "",
    typeLabel: "",
    layoutLabel: "",
    slug: safeJson("__index__"),
    pageKind: "index",
    layoutStem: "index",
    body,
    source: "",
    editLink: "",
    redirectUrl: "",
  });
  return substitute(layoutText, tokens);
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
  docsDir: string,
  site: WikiSite,
): void {
  const protectedPaths = [
    config.config_root,
    ...config.wiki.input,
    ...config.wiki.assets,
    dirname(join(docsDir, "layouts", "wikipedia.html")),
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

export async function buildDocsSite(
  config: Config,
  outputDir: string,
  options: DocsBuildOptions = {},
): Promise<number> {
  const docsDir = resolve(options.docsDir ?? DOCS_DIR);
  const repoRoot = options.repoRoot === undefined
    ? REPO_ROOT
    : options.repoRoot;
  const resolvedOutputDir = resolve(outputDir);
  const baseUrl = config.site.base_url ?? "/wiki";
  const urlStyle = config.site.url_style || "dir";
  const wikiOutput = resolve(outputSubdirectory(resolvedOutputDir, baseUrl));
  const site = buildSite(config, baseUrl, urlStyle);
  validateOutputDir(resolvedOutputDir, config, docsDir, site);

  const defaultLayout = readTemplate(
    join(docsDir, "layouts", "wikipedia.html"),
  );
  const redirectLayout = readTemplate(
    join(docsDir, "layouts", "redirect.html"),
  );
  const pagesJson = safeJson(
    site.pages.map((page) => ({ slug: page.file_slug, title: page.title })),
  );

  if (pathExists(resolvedOutputDir)) {
    Deno.removeSync(resolvedOutputDir, { recursive: true });
  }
  Deno.mkdirSync(wikiOutput, { recursive: true });

  const indexPath = join(wikiOutput, "index.html");
  Deno.writeTextFileSync(
    indexPath,
    buildIndexHtml(site, baseUrl, urlStyle, pagesJson, defaultLayout),
  );
  let written = 1;

  for (const page of site.pages) {
    const hasMetadata = Object.keys(page.frontmatter).length > 0;
    const metadataPane = hasMetadata
      ? await buildMetadataPanelHtml(page, config, "json-ld-compacted")
      : "";
    const metadataTool = hasMetadata
      ? '<li><a href="#view-metadata-content" onclick="switchTab(\'metadata\'); return false;">View metadata</a></li>'
      : "";
    const metadataTab = hasMetadata
      ? '<li id="ca-metadata"><a href="#view-metadata-content" onclick="switchTab(\'metadata\'); return false;">Metadata</a></li>'
      : "";
    const redirectTo = typeof page.frontmatter.redirect_to === "string"
      ? page.frontmatter.redirect_to
      : "";
    const redirectUrl = redirectTo
      ? pageUrl(baseUrl, redirectTo, urlStyle)
      : "";
    const selectedLayout = page.layout_path !== null && isFile(page.layout_path)
      ? readTemplate(page.layout_path)
      : redirectTo
      ? redirectLayout
      : defaultLayout;
    const tokens = pageTokens(page, site, baseUrl, urlStyle, pagesJson, {
      toc: buildTocHtml(page, baseUrl, urlStyle),
      backlinks: buildBacklinksHtml(page, site, baseUrl, urlStyle),
      infobox: buildInfoboxHtml(page, site, baseUrl, urlStyle),
      categories: buildCategoriesHtml(page, baseUrl),
      metadataPane,
      metadataTool,
      metadataTab,
      typeLabel: typeLabel(page),
      layoutLabel: layoutLabel(page),
      slug: safeJson(page.file_slug),
      pageKind: "article",
      layoutStem: page.layout_stem,
      body: page.html,
      source: page.markdown,
      editLink: editLink(page, repoRoot),
      redirectUrl,
    });
    const html = substitute(selectedLayout, tokens);
    const outputPath = pageOutputPath(wikiOutput, page.file_slug, urlStyle);
    Deno.mkdirSync(dirname(outputPath), { recursive: true });
    Deno.writeTextFileSync(outputPath, html);
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

function parseOutputDir(args: string[]): string {
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--output-dir") {
      const value = args[index + 1];
      if (!value) throw new Error("--output-dir requires a path");
      return value;
    }
    if (args[index]?.startsWith("--output-dir=")) {
      return args[index]!.slice("--output-dir=".length);
    }
  }
  return "_site";
}

if (import.meta.main) {
  const config = Config.load(join(DOCS_DIR, "wiki.yml"));
  await buildDocsSite(config, parseOutputDir(Deno.args));
}
