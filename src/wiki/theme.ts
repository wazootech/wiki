/**
 * `@wazoo/wiki/theme` public surface (JSR entrypoint).
 *
 * The static-site build is a distinct layer from the semantic-wiki core in
 * `mod.ts`: it turns a validated wiki into pages, an asset manifest, and HTML.
 * That layer has always existed internally (this repo's own docs theme,
 * `docs/build.ts`, deep-imports it), but was reachable only from inside the
 * package. This entrypoint exports the surface a custom theme needs so it can
 * be authored in TypeScript against the published package instead of vendoring
 * engine source or deep-importing internals.
 *
 * The CLI still owns the artifact contract; a theme owns the surface. Reach for
 * this entrypoint when a wiki's published frontend must differ from the built-in
 * `wiki build` output. The built-in `build`/`serve` commands remain the default.
 *
 * See `docs/wiki/TypeScript_API_Reference.md` for guidance.
 */

// Site assembly: config -> pages -> routes/backlinks.
export { buildSite } from "./site/build.ts";
export type { TocItem, VirtualPage, WikiSite } from "./site/types.ts";

// Markdown rendering and table of contents.
export {
  outlineForMarkdown,
  renderOutlineTitle,
  renderWikiMarkdown,
  stripLeadingTitle,
  titleFromMarkdown,
} from "./site/markdown.ts";

// Page shell: layout token substitution.
export { renderLayout, renderPageLayout } from "./site/layout.ts";

// Built-in HTML for an index page and a page, wrapped in a layout.
export { buildIndexHtml, buildPageHtml } from "./site/html.ts";

// Whole-site driver: writes pages and assets to an output directory.
export { buildStaticSite } from "./site/publish.ts";

// Whole-site driver for a custom theme: the same flow as `buildStaticSite`,
// with the layout and token vocabulary owned by the caller (#409).
export {
  buildThemedSite,
  escapeHtml,
  safeJson,
  substitute,
  type ThemeMetadataOptions,
  type ThemePageContext,
  type ThemeSiteOptions,
} from "./site/theme_build.ts";

// Asset discovery and output manifest.
export {
  buildAssetManifest,
  iterAssetFiles,
  resolveAssetPath,
} from "./assets.ts";

// Filesystem reads that respect the active edit overlay.
export { isFile, pathExists, relativeWithin } from "./fspath.ts";

// Frontmatter export, for themes that emit linked-data sidecars.
export { exportFrontmatter } from "./export.ts";

// Core helpers a theme commonly needs alongside the site layer.
export { Config } from "./config.ts";
export { isExternalLink, resolvePageRoute } from "./links.ts";
export { pageOutputPath, pageUrl } from "./paths.ts";
export { METADATA_VIEWS, type MetadataView } from "./schemas/metadata.ts";
