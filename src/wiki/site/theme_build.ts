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
import { isFile, pathExists } from "../fspath.ts";
import { pageOutputPath } from "../paths.ts";
import { buildSite } from "./build.ts";
import type { VirtualPage } from "./types.ts";
import {
  DEFAULT_HIDDEN_FIELDS,
  DEFAULT_LAYOUT,
  DEFAULT_SELECTED_VIEW,
  DEFAULT_TITLE_SUFFIX,
  DEFAULT_VIEWS,
  safeJson,
  substitute,
  type ThemePageContext,
  type ThemeSiteOptions,
} from "./theme_build/defaults.ts";
import { buildMetadataPanelHtml } from "./theme_build/metadata_panel.ts";
import { shellTokens } from "./theme_build/shell.ts";
import {
  outputSubdirectory,
  readTemplate,
  validateOutputDir,
} from "./theme_build/output_dir.ts";

export {
  escapeHtml,
  safeJson,
  substitute,
  type ThemeMetadataOptions,
  type ThemePageContext,
  type ThemeSiteOptions,
} from "./theme_build/defaults.ts";

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
